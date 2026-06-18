/**
 * One-shot message processor - runs once and exits
 * Called by worker-cron.sh in a loop.
 * Includes retry logic for Neon scale-to-zero cold starts AND network errors.
 */
const { PrismaClient } = require('@prisma/client');

// Build PrismaClient with retry — Neon DB sometimes refuses first connection after idle
let _db = null;
async function getDb(retries = 5, delayMs = 1500) {
  if (_db) return _db;
  for (let i = 0; i < retries; i++) {
    try {
      const client = new PrismaClient();
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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
// NOTE: ZAI_CHAT_ID intentionally NOT used — bot is decoupled from z.ai web chat
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم. كن مختصراً.";

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch with retry — handles transient "fetch failed" errors
async function fetchWithRetry(url, options, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) {
        await sleep(1500 * (i + 1));
      }
    }
  }
  throw lastErr;
}

async function callZAI(messages) {
  // Decoupled from any specific Z.ai web chat — no X-Chat-Id header
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-User-Id': ZAI_USER_ID,
    'X-Token': ZAI_TOKEN,
    'X-Z-AI-From': 'Z',
  };

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
  const res = await fetchWithRetry('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || 'عذراً، لا أستطيع الرد الآن';
}

async function sendTelegram(chatId, text) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Telegram ${res.status}: ${errBody.substring(0, 200)}`);
  }
  return res.json();
}

async function sendTyping(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch (_) {}
}

async function main() {
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error(`[${new Date().toISOString()}] DB connection failed:`, e.message);
    return;
  }

  let pending;
  let pollinationsEnabled = false;
  try {
    pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 5,
    });
    // Check if Pollinations fallback is enabled in DB settings
    const cfg = await db.botConfig.findUnique({ where: { key: 'pollinations_fallback_enabled' } });
    pollinationsEnabled = cfg?.value === 'true';
  } catch (e) {
    console.error(`[${new Date().toISOString()}] DB query failed:`, e.message);
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

      await sendTyping(chatId);

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

      // Provider chain: Z-AI (always) → Pollinations (only if enabled in DB) → static fallback
      let reply;
      let modelUsed = 'moodchat-zai';
      try {
        reply = await callZAI(messages);
      } catch (e) {
        console.error(`  Z-AI failed: ${e.message}`);
        if (pollinationsEnabled) {
          try {
            reply = await callPollinations(messages);
            modelUsed = 'moodchat-pollinations';
          } catch (e2) {
            console.error(`  Pollinations failed: ${e2.message}`);
            reply = "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً 🙏";
            modelUsed = 'moodchat-fallback';
          }
        } else {
          reply = "عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏";
          modelUsed = 'moodchat-fallback';
        }
      }

      // Save assistant reply in DB
      await db.message.create({
        data: { userId: msg.userId, role: 'assistant', content: reply, modelUsed, status: 'done' },
      });

      // Mark user message as done
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });

      // Send reply to Telegram (3 retries inside sendTelegram)
      try {
        await sendTelegram(chatId, reply);
        replySent = true;
        console.log(`  ✅ Replied to ${msg.userId}: "${reply.substring(0, 50)}..."`);
      } catch (e) {
        console.error(`  ❌ Send failed after retries: ${e.message}`);
      }

    } catch (error) {
      console.error(`  ❌ Processing error for msg ${msg.id}:`, error.message);
    }
  }

  await db.$disconnect().catch(() => {});
  _db = null;
}

// Run with overall timeout guard
const timeoutGuard = setTimeout(() => {
  console.error('Overall timeout (90s) - exiting');
  process.exit(1);
}, 90000);

main()
  .then(() => {
    clearTimeout(timeoutGuard);
    process.exit(0);
  })
  .catch(e => {
    console.error('Fatal:', e);
    clearTimeout(timeoutGuard);
    process.exit(1);
  });
