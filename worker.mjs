/**
 * مود شات - عامل الخلفية المحلي (محسّن)
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ log: ['error'] });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';
const MAX_HISTORY = 20;
const POLL_INTERVAL = 3000;

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// حماية من المعالجة المزدوجة
const processingIds = new Set();

// Telegram API
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  return res.json();
}

async function sendChatAction(chatId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  });
}

// Z-AI مع إعادة المحاولة
async function callZAI(messages) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
      const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Authorization': `Bearer ${ZAI_API_KEY}`,
          'X-Z-AI-From': 'Z', 'X-Chat-Id': ZAI_CHAT_ID, 'X-User-Id': ZAI_USER_ID, 'X-Token': ZAI_TOKEN,
        },
        signal: ctrl.signal,
        body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 800, thinking: { type: 'disabled' } }),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < 2) continue;
        throw new Error(`Z-AI ${res.status}`);
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
      throw new Error('Empty');
    } catch (e) { if (attempt === 2) throw e; } finally { clearTimeout(timeout); }
  }
}

// معالجة رسالة واحدة
async function processPendingMessage(msg) {
  const { id, userId, content, chatId } = msg;
  
  // منع المعالجة المزدوجة
  if (processingIds.has(id)) return;
  processingIds.add(id);

  if (!chatId) {
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    processingIds.delete(id);
    return;
  }

  try {
    // تحديث الحالة فوراً لمنع المعالجة المزدوجة
    await db.message.update({ where: { id }, data: { status: 'processing' } });

    await sendChatAction(chatId);

    const dbMessages = await db.message.findMany({
      where: { userId, status: 'done' },
      orderBy: { timestamp: 'asc' }, take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    const aiReply = await callZAI(messages);

    // تحديث الرسالة + حفظ الرد
    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: { userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat-z-ai-worker', status: 'done', chatId },
    });

    const clean = sanitizeMarkdown(aiReply);
    await sendMessage(chatId, clean);
    console.log(`[Worker] ✅ ${userId}: "${aiReply.substring(0, 40)}..."`);
  } catch (error) {
    console.error(`[Worker] ❌ ${id}:`, error.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    try { await sendMessage(chatId, "عذراً، حدث خطأ. حاول مرة أخرى."); } catch {}
  } finally {
    processingIds.delete(id);
  }
}

function sanitizeMarkdown(text) {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  return c;
}

// حلقة الاستقصاء
let isPolling = false;
async function poll() {
  if (isPolling) return;
  isPolling = true;
  try {
    const pending = await db.message.findMany({
      where: { status: 'pending', chatId: { not: null } },
      orderBy: { timestamp: 'asc' },
      take: 3,
    });
    if (pending.length > 0) {
      console.log(`[Worker] ${pending.length} pending`);
      for (const msg of pending) {
        await processPendingMessage(msg);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } catch (error) {
    console.error('[Worker] Poll error:', error.message);
  } finally {
    isPolling = false;
  }
}

// حماية من الأعطال
process.on('uncaughtException', (err) => console.error('[Worker] Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('[Worker] Unhandled:', err));

console.log('🤖 مود شات - عامل الخلفية (محسّن)');
console.log(`📡 Z-AI: ${ZAI_BASE_URL}`);
console.log(`⏱️ فترة الاستقصاء: ${POLL_INTERVAL}ms`);
console.log('🟢 جاهز لاستقبال الرسائل...\n');

setInterval(poll, POLL_INTERVAL);
poll();
