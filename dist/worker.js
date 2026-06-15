/**
 * MoodChat AI Worker - Plain Node.js version
 * More robust than tsx version
 * 
 * Z-AI SDK (الافتراضي) + Pollinations.ai (احتياطي)
 */

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  log: ['error', 'warn'],
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';
const POLL_INTERVAL = 2000;
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة. كن مختصراً.";

// Track if we're processing to avoid overlapping
let isProcessing = false;

async function sendTelegram(chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    return await res.json();
  } catch (e) {
    console.error('❌ Telegram send error:', e.message);
  }
}

async function sendChatAction(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch {}
}

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
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 1024, thinking: { type: 'disabled' } }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Z-AI ${res.status}: ${errText.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));
      const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
      });
      if (!res.ok) {
        if (res.status === 429 && attempt < retries) continue;
        throw new Error(`Pollinations ${res.status}`);
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
      throw new Error('Empty response');
    } catch (error) {
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function chatWithAI(userId, userMessage) {
  // Get conversation history
  const dbMessages = await db.message.findMany({
    where: { userId, status: 'done' },
    orderBy: { timestamp: 'asc' },
    take: MAX_HISTORY,
  });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...dbMessages.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  // 1. Z-AI SDK (الافتراضي)
  try {
    return await callZAI(messages);
  } catch (e) {
    console.error('❌ Z-AI failed:', e.message);
  }

  // 2. Pollinations احتياطي
  try {
    console.log('🔄 Trying Pollinations fallback...');
    return await callPollinations(messages);
  } catch (e) {
    console.error('❌ Pollinations failed:', e.message);
  }

  return "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً. حاول مرة أخرى لاحقاً 🙏";
}

async function processPendingMessages() {
  if (isProcessing) return;

  isProcessing = true;
  try {
    const pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 3,
    });

    for (const msg of pending) {
      try {
        const chatId = msg.chatId || msg.userId;
        const preview = msg.content.substring(0, 40);
        console.log(`📩 [${new Date().toLocaleTimeString()}] Processing: "${preview}..." (user: ${msg.userId})`);

        await sendChatAction(chatId);
        const aiReply = await chatWithAI(msg.userId, msg.content);

        // Save AI reply
        await db.message.create({
          data: { userId: msg.userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat-zai', status: 'done' },
        });

        // Mark user message as done
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });

        // Send via Telegram
        await sendTelegram(chatId, aiReply);
        console.log(`🤖 [${new Date().toLocaleTimeString()}] Reply sent: "${aiReply.substring(0, 50)}..."`);

      } catch (error) {
        console.error(`❌ Error processing ${msg.id}:`, error.message);
        // Mark as done to prevent infinite retries
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('❌ Process loop error:', error.message);
  } finally {
    isProcessing = false;
  }
}

async function main() {
  console.log('');
  console.log('🌙 ═══════════════════════════════════════════════');
  console.log('🤖 مود شات - AI Worker (Z-AI SDK)');
  console.log('🔗 Vercel Webhook → Neon DB → Worker → Z-AI');
  console.log('🌙 ═══════════════════════════════════════════════');
  console.log('');

  console.log('🚀 Worker started! Polling every 2 seconds...');
  console.log('');

  // Main polling loop
  while (true) {
    try {
      await processPendingMessages();
    } catch (error) {
      console.error('❌ Fatal worker error:', error.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Stopping worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Catch unhandled errors
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught exception:', error.message);
  // Don't exit - keep running
});

main().catch(e => {
  console.error('💀 Fatal startup error:', e);
  process.exit(1);
});
