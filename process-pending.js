/**
 * One-shot message processor - runs once and exits
 * Called by worker-cron.sh in a loop every 3 seconds.
 * Includes retry logic for Neon scale-to-zero cold starts.
 */
const { PrismaClient } = require('@prisma/client');

// Build PrismaClient with retry — Neon DB sometimes refuses first connection after idle
let _db = null;
async function getDb(retries = 5, delayMs = 1500) {
  if (_db) return _db;
  for (let i = 0; i < retries; i++) {
    try {
      const client = new PrismaClient();
      // Test the connection with a lightweight query
      await client.$queryRaw`SELECT 1`;
      _db = client;
      return _db;
    } catch (e) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      } else {
        throw e;
      }
    }
  }
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
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
    'X-Z-AI-from': 'Z',
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
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error('DB connection failed after retries:', e.message);
    return;
  }

  let pending;
  try {
    pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 5,
    });
  } catch (e) {
    console.error('DB query failed:', e.message);
    await db.$disconnect().catch(() => {});
    _db = null;
    return;
  }

  if (pending.length === 0) {
    await db.$disconnect().catch(() => {});
    _db = null;
    return;
  }

  console.log(`[${new Date().toISOString()}] Processing ${pending.length} pending messages`);

  for (const msg of pending) {
    let replySent = false;
    try {
      const chatId = msg.chatId || msg.userId;

      // Send typing action (non-fatal if it fails)
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
      } catch (_) {}

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

      // Call Z-AI first, fallback to Pollinations, then to a static message
      let reply;
      let modelUsed = 'moodchat-zai';
      try {
        reply = await callZAI(messages);
      } catch (e) {
        console.error('Z-AI failed:', e.message);
        try {
          reply = await callPollinations(messages);
          modelUsed = 'moodchat-pollinations';
        } catch (e2) {
          console.error('Pollinations failed:', e2.message);
          reply = "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً 🙏";
          modelUsed = 'moodchat-fallback';
        }
      }

      // Save assistant reply in DB
      await db.message.create({
        data: { userId: msg.userId, role: 'assistant', content: reply, modelUsed, status: 'done' },
      });

      // Mark user message as done
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });

      // Send reply to Telegram (with 3 retries)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await sendTelegram(chatId, reply);
          replySent = true;
          console.log(`✅ Replied to ${msg.userId}: "${reply.substring(0, 50)}..."`);
          break;
        } catch (e) {
          console.error(`Send attempt ${attempt + 1} failed:`, e.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!replySent) {
        console.error(`❌ Failed to send reply to ${msg.userId} after 3 attempts`);
      }

    } catch (error) {
      console.error(`❌ Processing error for msg ${msg.id}:`, error.message);
      // If we never sent a reply, mark as 'failed' (recoverable) — NOT 'done'
      if (!replySent) {
        await db.message.update({ where: { id: msg.id }, data: { status: 'failed' } }).catch(() => {});
      }
    }
  }

  await db.$disconnect().catch(() => {});
  _db = null;
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
