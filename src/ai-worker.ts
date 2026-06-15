/**
 * AI Worker - MoodChat (مود شات)
 * يعمل على بيئة Z.ai - يستخدم Z-AI SDK ك مزود أساسي
 * 
 * يعالج الرسائل المعلقة (pending) من قاعدة البيانات:
 * 1. يقرأ الرسائل المعلقة كل ثانيتين
 * 2. يستدعي Z-AI SDK للحصول على رد
 * 3. يرسل الرد عبر Telegram API
 * 4. يحدّث حالة الرسالة إلى "done"
 * 5. يرسل نبضة حياة (heartbeat) كل 30 ثانية
 */

import { PrismaClient } from '@prisma/client';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const MAX_HISTORY = 20;
const POLL_INTERVAL = 2000; // ثانيتين
const HEARTBEAT_INTERVAL = 30000; // 30 ثانية
const BATCH_SIZE = 5; // عدد الرسائل التي يعالجها في المرة الواحدة

// Z-AI SDK Config
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي ومحترم. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. قواعد صارمة: 1- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال. 2- لا تكرر التحيات في كل رسالة. 3- أجب مباشرة وبشكل طبيعي دون مقدمات.";

const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

// ============================
// Telegram API
// ============================

async function telegramAPI(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string) {
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

function sanitizeMarkdown(text: string): string {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  c = c.replace(/~~/g, '');
  c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return c;
}

// ============================
// Z-AI SDK - المزود الأساسي
// ============================

async function callZaiSDK(messages: Array<{ role: string; content: string }>): Promise<string> {
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  const zai = new ZAIClass(ZAI_CONFIG);
  
  // إعادة المحاولة 3 مرات مع تأخير متزايد
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        model: 'glm-4-plus',
        temperature: 0.7,
        max_tokens: 800,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) {
        return reply.trim();
      }
      throw new Error('Empty response');
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('rate');
      if (is429 && attempt < 2) {
        const delay = 2000 * (attempt + 1) + Math.random() * 1000;
        console.log(`[Worker] Z-AI rate limited, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Z-AI SDK failed after retries');
}

// احتياطي: Pollinations
async function callPollinations(messages: Array<{ role: string; content: string }>): Promise<string> {
  for (const model of ['mistral', 'openai']) {
    try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model, messages, temperature: 0.7, seed: Math.floor(Math.random() * 100000) }),
      });
      if (response.status === 429) continue;
      if (!response.ok) continue;
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
    } catch { continue; }
  }
  throw new Error('Pollinations failed');
}

// ============================
// معالجة الرسائل المعلقة
// ============================

let totalProcessed = 0;
let totalFailed = 0;
let isProcessing = false;

async function processPendingMessages() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // البحث عن رسائل معلقة
    const pendingMessages = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: BATCH_SIZE,
    });

    if (pendingMessages.length === 0) return;

    console.log(`[Worker] Found ${pendingMessages.length} pending messages`);

    for (const msg of pendingMessages) {
      try {
        // تحديث الحالة إلى "processing" لمنع المعالجة المزدوجة
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'processing' },
        });

        // جلب سجل المحادثة
        const dbMessages = await db.message.findMany({
          where: {
            userId: msg.userId,
            status: { in: ['done', 'processing'] },
            timestamp: { lte: msg.timestamp },
          },
          orderBy: { timestamp: 'asc' },
          take: MAX_HISTORY,
          select: { role: true, content: true },
        });

        const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        // استدعاء Z-AI SDK (أساسي) مع fallback
        let reply: string;
        let provider: string;
        try {
          reply = await callZaiSDK(aiMessages);
          provider = 'zai-sdk';
        } catch (zaiErr: any) {
          console.log(`[Worker] Z-AI failed: ${zaiErr?.message?.substring(0, 60)}, trying Pollinations...`);
          try {
            reply = await callPollinations(aiMessages);
            provider = 'pollinations';
          } catch (pollErr: any) {
            console.error(`[Worker] All AI failed for user ${msg.userId}`);
            // تحديث الرسالة الأصلية كفاشلة
            await db.message.update({
              where: { id: msg.id },
              data: { status: 'done' },
            });
            totalFailed++;
            continue;
          }
        }

        // حفظ رد الـ AI
        await db.message.create({
          data: {
            userId: msg.userId,
            role: 'assistant',
            content: reply,
            modelUsed: `moodchat-${provider}`,
            status: 'done',
            chatId: msg.chatId,
          },
        });

        // تحديث الرسالة الأصلية
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });

        // إرسال الرد عبر Telegram
        const chatId = msg.chatId || msg.userId;
        await sendMessage(chatId, sanitizeMarkdown(reply));

        totalProcessed++;
        console.log(`[Worker] Processed msg ${msg.id} for user ${msg.userId} via ${provider} (total: ${totalProcessed})`);

      } catch (err: any) {
        console.error(`[Worker] Error processing msg ${msg.id}:`, err?.message?.substring(0, 100));
        // أعد الرسالة لحالة pending للمحاولة مرة أخرى
        try {
          await db.message.update({
            where: { id: msg.id },
            data: { status: 'pending' },
          });
        } catch {}
        totalFailed++;
      }
    }
  } catch (err: any) {
    console.error('[Worker] Error in processPendingMessages:', err?.message?.substring(0, 100));
  } finally {
    isProcessing = false;
  }
}

// ============================
// نبضة الحياة (Heartbeat)
// ============================

async function sendHeartbeat() {
  try {
    await db.botConfig.upsert({
      where: { key: 'worker_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'worker_heartbeat', value: new Date().toISOString() },
    });

    await db.botConfig.upsert({
      where: { key: 'worker_stats' },
      update: { value: JSON.stringify({ totalProcessed, totalFailed, lastActivity: new Date().toISOString() }) },
      create: { key: 'worker_stats', value: JSON.stringify({ totalProcessed, totalFailed, lastActivity: new Date().toISOString() }) },
    });
  } catch (err: any) {
    console.error('[Worker] Heartbeat error:', err?.message?.substring(0, 60));
  }
}

// ============================
// تنظيف الرسائل العالقة
// ============================

async function cleanStuckMessages() {
  try {
    // الرسائل في حالة "processing" لأكثر من 5 دقائق = عالقة
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await db.message.updateMany({
      where: {
        status: 'processing',
        timestamp: { lt: fiveMinutesAgo },
      },
      data: { status: 'pending' },
    });
    if (result.count > 0) {
      console.log(`[Worker] Recovered ${result.count} stuck messages`);
    }
  } catch (err: any) {
    console.error('[Worker] Clean error:', err?.message?.substring(0, 60));
  }
}

// ============================
// التشغيل الرئيسي
// ============================

async function main() {
  console.log('========================================');
  console.log('  مود شات - AI Worker');
  console.log('  Z-AI SDK (GLM-4 Plus) - Primary');
  console.log(`  Bot Token: ...${BOT_TOKEN.slice(-8)}`);
  console.log(`  Poll Interval: ${POLL_INTERVAL}ms`);
  console.log('========================================');

  // اختبار Z-AI SDK
  try {
    console.log('[Worker] Testing Z-AI SDK...');
    const testReply = await callZaiSDK([{ role: 'user', content: 'say ok' }]);
    console.log(`[Worker] Z-AI SDK test: OK (${testReply.substring(0, 30)})`);
  } catch (err: any) {
    console.error(`[Worker] Z-AI SDK test FAILED: ${err?.message?.substring(0, 80)}`);
    console.error('[Worker] Worker will still start, but Z-AI may not work');
  }

  // اختبار اتصال قاعدة البيانات
  try {
    await db.$queryRaw`SELECT 1`;
    console.log('[Worker] Database connection: OK');
  } catch (err: any) {
    console.error(`[Worker] Database connection FAILED: ${err?.message?.substring(0, 80)}`);
    process.exit(1);
  }

  // إرسال نبضة الحياة الأولى
  await sendHeartbeat();

  // حلقة المعالجة الرئيسية
  console.log('[Worker] Starting main loop...');

  // معالجة الرسائل كل ثانيتين
  const processInterval = setInterval(processPendingMessages, POLL_INTERVAL);

  // نبضة الحياة كل 30 ثانية
  const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // تنظيف الرسائل العالقة كل دقيقة
  const cleanInterval = setInterval(cleanStuckMessages, 60000);

  // معالجة أي رسائل معلقة فوراً
  await processPendingMessages();

  // التعامل مع إشارات الإيقاف
  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
    clearInterval(processInterval);
    clearInterval(heartbeatInterval);
    clearInterval(cleanInterval);
    await db.$disconnect();
    console.log('[Worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // منع العملية من الخروج
  process.stdin.resume();
}

main().catch(err => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
