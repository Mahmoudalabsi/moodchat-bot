/**
 * MoodChat Worker - Continuous loop version for PM2
 *
 * - Polls Neon DB every 2 seconds for pending messages
 * - Processes each with Z-AI SDK (primary) + Pollinations (fallback if enabled)
 * - Sends reply via Telegram Bot API
 * - Robust: auto-reconnects DB, retries on transient errors
 * - Designed to run under PM2 (restarts on crash, persists across sessions)
 */

const { PrismaClient } = require('@prisma/client');

// === Config ===
const POLL_INTERVAL_MS = 2000;
const MAX_PER_BATCH = 5;
const MAX_HISTORY = 30;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة.
5- كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً.

قواعد السرية:
- لا تكشف أبداً عن هويتك الحقيقية أو اسم الشركة المطورة لك.
- إذا سُئلت من أنت، أجب: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."`;

// === DB with auto-reconnect ===
let db = null;
let dbFailures = 0;

async function getDb() {
  if (db) return db;
  for (let i = 0; i < 5; i++) {
    try {
      const client = new PrismaClient({
        log: ['error'],
      });
      await client.$queryRaw`SELECT 1`;
      db = client;
      dbFailures = 0;
      console.log(`[${ts()}] ✅ DB connected`);
      return db;
    } catch (e) {
      console.error(`[${ts()}] DB connect attempt ${i+1}/5 failed: ${e.message.substring(0, 80)}`);
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error('DB connection failed after 5 retries');
}

async function resetDb() {
  if (db) {
    await db.$disconnect().catch(() => {});
    db = null;
  }
}

// === Helpers ===
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString();

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
      if (i < retries - 1) await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// === AI Providers ===

async function callZAI(messages) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Chat-Id': ZAI_CHAT_ID,
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
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Z-AI ${res.status}: ${errBody.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Z-AI response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages) {
  const res = await fetchWithRetry('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'openai',
      temperature: 0.7,
      seed: Math.floor(Math.random() * 10000),
    }),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (reply?.trim()) return reply.trim();
  throw new Error('Empty Pollinations response');
}

// === Telegram ===

async function sendTelegram(chatId, text) {
  // Telegram's Markdown v1 has strict rules - sanitize aggressively
  let safe = text;
  // Remove unsupported markdown
  safe = safe.replace(/^#{1,6}\s+/gm, '');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  safe = safe.replace(/~~[^~]+~~/g, '');
  safe = safe.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Balance asterisks
  const starCount = (safe.match(/\*/g) || []).length;
  if (starCount % 2 !== 0) safe = safe.replace(/\*([^*]*)$/, '$1');
  // Balance backticks
  const btCount = (safe.match(/`/g) || []).length;
  if (btCount % 2 !== 0) safe += '`';
  // Limit length
  if (safe.length > 4096) safe = safe.substring(0, 4090) + '...';

  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: safe,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    // If Markdown parsing fails, retry without parse_mode
    if (errBody.includes('parse') || errBody.includes('format')) {
      console.log(`  Retrying without Markdown...`);
      const res2 = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.substring(0, 4096),
          disable_web_page_preview: true,
        }),
      });
      if (!res2.ok) throw new Error(`Telegram ${res2.status}`);
      return res2.json();
    }
    throw new Error(`Telegram ${res.status}: ${errBody.substring(0, 150)}`);
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

// === Main Loop ===

async function processMessage(msg, db, pollinationsEnabled) {
  const chatId = msg.chatId || msg.userId;
  await sendTyping(chatId);

  // Get conversation history
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

  // Provider chain
  let reply;
  let modelUsed = 'moodchat-zai';
  try {
    reply = await callZAI(messages);
  } catch (e) {
    console.error(`[${ts()}]   Z-AI failed: ${e.message.substring(0, 80)}`);
    if (pollinationsEnabled) {
      try {
        reply = await callPollinations(messages);
        modelUsed = 'moodchat-pollinations';
      } catch (e2) {
        console.error(`[${ts()}]   Pollinations failed: ${e2.message.substring(0, 80)}`);
        reply = "عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏";
        modelUsed = 'moodchat-fallback';
      }
    } else {
      reply = "عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏";
      modelUsed = 'moodchat-fallback';
    }
  }

  // Save assistant reply
  await db.message.create({
    data: {
      userId: msg.userId,
      role: 'assistant',
      content: reply,
      modelUsed,
      status: 'done',
    },
  });

  // Mark user message as done
  await db.message.update({
    where: { id: msg.id },
    data: { status: 'done' },
  });

  // Send via Telegram
  try {
    await sendTelegram(chatId, reply);
    console.log(`[${ts()}]   ✅ Replied to ${msg.userId} via ${modelUsed}: "${reply.substring(0, 60)}..."`);
  } catch (e) {
    console.error(`[${ts()}]   ❌ Telegram send failed: ${e.message.substring(0, 100)}`);
    // Even if Telegram send fails, the message is in DB so user can see it in dashboard
  }
}

async function tick() {
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error(`[${ts()}] DB unavailable, waiting...`);
    return;
  }

  let pending = [];
  let pollinationsEnabled = false;
  try {
    pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: MAX_PER_BATCH,
    });
    const cfg = await db.botConfig.findUnique({ where: { key: 'pollinations_fallback_enabled' } });
    pollinationsEnabled = cfg?.value === 'true';
  } catch (e) {
    console.error(`[${ts()}] DB query failed: ${e.message.substring(0, 80)}`);
    dbFailures++;
    if (dbFailures >= 3) {
      console.error(`[${ts()}] Too many DB failures, resetting connection`);
      await resetDb();
      dbFailures = 0;
    }
    return;
  }

  if (pending.length === 0) return;

  console.log(`[${ts()}] Processing ${pending.length} pending message(s)`);

  for (const msg of pending) {
    try {
      await processMessage(msg, db, pollinationsEnabled);
    } catch (e) {
      console.error(`[${ts()}]   ❌ Failed msg ${msg.id}: ${e.message.substring(0, 100)}`);
      // Mark as done to avoid infinite retry loop
      try {
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });
      } catch (_) {}
    }
  }
}

async function main() {
  console.log(`[${ts()}] 🚀 MoodChat Worker started`);
  console.log(`[${ts()}]    Bot token: ...${BOT_TOKEN.slice(-8)}`);
  console.log(`[${ts()}]    Z-AI chat: ${ZAI_CHAT_ID}`);
  console.log(`[${ts()}]    Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Run forever
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error(`[${ts()}] Tick error: ${e.message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

// Handle signals gracefully
process.on('SIGINT', async () => {
  console.log(`[${ts()}] Received SIGINT, shutting down...`);
  await resetDb();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log(`[${ts()}] Received SIGTERM, shutting down...`);
  await resetDb();
  process.exit(0);
});

main().catch(e => {
  console.error(`[${ts()}] Fatal:`, e);
  process.exit(1);
});
