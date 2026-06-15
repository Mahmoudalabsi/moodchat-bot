/**
 * One-shot message processor - runs once and exits
 * Called by cron every minute
 */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم. كن مختصراً.";

async function callZAI(messages) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Z-AI-From': 'Z',
  };
  if (ZAI_CHAT_ID) headers['X-Chat-Id'] = ZAI_CHAT_ID;
  if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
  if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 1024, thinking: { type: 'disabled' } }),
    });
    if (!res.ok) throw new Error(`Z-AI ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
    });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'عذراً، لا أستطيع الرد الآن';
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function main() {
  const pending = await db.message.findMany({
    where: { status: 'pending', role: 'user' },
    orderBy: { timestamp: 'asc' },
    take: 5,
  });

  if (pending.length === 0) {
    await db.$disconnect();
    return;
  }

  console.log(`[${new Date().toISOString()}] Processing ${pending.length} pending messages`);

  for (const msg of pending) {
    try {
      const chatId = msg.chatId || msg.userId;

      // Send typing action
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      });

      // Get history
      const history = await db.message.findMany({
        where: { userId: msg.userId, status: 'done' },
        orderBy: { timestamp: 'asc' },
        take: MAX_HISTORY,
      });

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: msg.content },
      ];

      // Call Z-AI first, fallback to Pollinations
      let reply;
      try {
        reply = await callZAI(messages);
      } catch (e) {
        console.error('Z-AI failed:', e.message);
        try {
          reply = await callPollinations(messages);
        } catch (e2) {
          console.error('Pollinations failed:', e2.message);
          reply = "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً 🙏";
        }
      }

      // Save reply
      await db.message.create({
        data: { userId: msg.userId, role: 'assistant', content: reply, modelUsed: 'moodchat-zai', status: 'done' },
      });

      // Mark as done
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });

      // Send reply
      await sendTelegram(chatId, reply);
      console.log(`✅ Replied to ${msg.userId}: "${reply.substring(0, 50)}..."`);

    } catch (error) {
      console.error(`❌ Error:`, error.message);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } }).catch(() => {});
    }
  }

  await db.$disconnect();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
