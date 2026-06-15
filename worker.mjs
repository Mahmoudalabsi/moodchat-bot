/**
 * مود شات - عامل الخلفية المحلي
 * يستعلم عن الرسائل المعلقة ويرد عليها باستخدام Z-AI
 * يعمل على منصة Z.ai حيث internal-api.z.ai متاح
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
const POLL_INTERVAL = 3000; // 3 ثوانٍ

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// ============================
// Telegram API
// ============================

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  return res.json();
}

async function sendChatAction(chatId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  });
}

// ============================
// Z-AI API - مع إعادة المحاولة
// ============================

async function callZAI(messages) {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      if (attempt > 0) {
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.log(`[Z-AI] Retry ${attempt}, waiting ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
      const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ZAI_API_KEY}`,
          'X-Z-AI-From': 'Z',
          'X-Chat-Id': ZAI_CHAT_ID,
          'X-User-Id': ZAI_USER_ID,
          'X-Token': ZAI_TOKEN,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages, temperature: 0.7, max_tokens: 800, thinking: { type: 'disabled' },
        }),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries - 1) continue;
        throw new Error(`Z-AI ${res.status}`);
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
      throw new Error('Empty response');
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
    } finally { clearTimeout(timeout); }
  }
}

// ============================
// معالجة الرسالة المعلقة
// ============================

async function processPendingMessage(msg) {
  const { id, userId, content, chatId } = msg;
  
  if (!chatId) {
    console.log(`[Worker] Message ${id} has no chatId, marking failed`);
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    return;
  }

  try {
    // إرسال حالة الكتابة
    await sendChatAction(chatId);

    // جلب سجل المحادثة
    const dbMessages = await db.message.findMany({
      where: { userId, status: 'done' },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    // استدعاء Z-AI
    const aiReply = await callZAI(messages);

    // تحديث الرسالة الأصلية
    await db.message.update({ where: { id }, data: { status: 'done' } });

    // حفظ رد AI
    await db.message.create({
      data: { userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat-z-ai', status: 'done', chatId },
    });

    // إرسال الرد عبر Telegram
    const cleanReply = sanitizeMarkdown(aiReply);
    await sendMessage(chatId, cleanReply);

    console.log(`[Worker] ✅ Replied to user ${userId}: "${aiReply.substring(0, 50)}..."`);
  } catch (error) {
    console.error(`[Worker] ❌ Failed for message ${id}:`, error.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    await sendMessage(chatId, "عذراً، حدث خطأ مؤقت. حاول مرة أخرى.");
  }
}

function sanitizeMarkdown(text) {
  let cleaned = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) cleaned = cleaned.replace(/\*\*([^*]*)$/, '*$1*');
  const codeCount = (cleaned.match(/`/g) || []).length;
  if (codeCount % 2 !== 0) cleaned += '`';
  return cleaned;
}

// ============================
// حلقة الاستقصاء الرئيسية
// ============================

async function poll() {
  try {
    // البحث عن الرسائل المعلقة
    const pending = await db.message.findMany({
      where: { status: 'pending', chatId: { not: null } },
      orderBy: { timestamp: 'asc' },
      take: 5, // معالجة 5 رسائل كحد أقصى في كل دورة
    });

    if (pending.length > 0) {
      console.log(`[Worker] Found ${pending.length} pending message(s)`);
      for (const msg of pending) {
        await processPendingMessage(msg);
        await new Promise(r => setTimeout(r, 1000)); // تأخير بين الرسائل
      }
    }
  } catch (error) {
    console.error('[Worker] Poll error:', error.message);
  }
}

// ============================
// بدء التشغيل
// ============================

console.log('🤖 مود شات - عامل الخلفية');
console.log(`📡 Z-AI: ${ZAI_BASE_URL}`);
console.log(`⏱️ فترة الاستقصاء: ${POLL_INTERVAL}ms`);
console.log('🟢 جاهز لاستقبال الرسائل...\n');

// تشغيل حلقة الاستقصاء
setInterval(poll, POLL_INTERVAL);

// تشغيل فوري أول مرة
poll();
