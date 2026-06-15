/**
 * MoodChat AI Worker - يعالج الرسائل المعلقة باستخدام Z-AI SDK
 * 
 * النظام الهجين:
 * 1. Vercel Webhook → يستلم الرسالة → يحفظها كـ "pending" في DB
 * 2. هذا الـ Worker → يقرأ "pending" → يستدعي Z-AI → يرسل الرد → يحفظ كـ "done"
 * 
 * يعمل فقط على شبكة Z.ai حيث Z-AI API متاح
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const MAX_HISTORY = 50;
const POLL_INTERVAL = 2000; // مللي ثانية
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

let isRunning = true;

// ============================
// Telegram API
// ============================

async function sendMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function sendChatAction(chatId: number) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  });
}

// ============================
// AI - Z-AI SDK (الافتراضي)
// ============================

async function getAIConfig() {
  try {
    const providerConfig = await db.botConfig.findUnique({ where: { key: 'ai_provider' } });
    const provider = providerConfig?.value || 'zsdk';

    if (provider === 'api') {
      const baseUrl = (await db.botConfig.findUnique({ where: { key: 'api_base_url' } }))?.value || '';
      const apiKey = (await db.botConfig.findUnique({ where: { key: 'api_key' } }))?.value || '';
      const model = (await db.botConfig.findUnique({ where: { key: 'api_model' } }))?.value || 'gpt-4';
      return { provider: 'api' as const, baseUrl, apiKey, model };
    }

    const chatId = (await db.botConfig.findUnique({ where: { key: 'zai_chat_id' } }))?.value || ZAI_CHAT_ID;
    const userId = (await db.botConfig.findUnique({ where: { key: 'zai_user_id' } }))?.value || ZAI_USER_ID;
    const token = (await db.botConfig.findUnique({ where: { key: 'zai_token' } }))?.value || ZAI_TOKEN;
    return { provider: 'zsdk' as const, chatId, userId, token };
  } catch {
    return { provider: 'zsdk' as const, chatId: ZAI_CHAT_ID, userId: ZAI_USER_ID, token: ZAI_TOKEN };
  }
}

async function chatWithAI(userId: number, userMessage: string): Promise<string> {
  const dbMessages = await db.message.findMany({
    where: { userId, status: 'done' },
    orderBy: { timestamp: 'asc' },
    take: MAX_HISTORY,
  });

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const msg of dbMessages) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });

  const config = await getAIConfig();

  // 1. API Token
  if (config.provider === 'api' && config.baseUrl && config.apiKey) {
    try {
      return await callCustomAPI(messages, config.baseUrl, config.apiKey, config.model);
    } catch (e) {
      console.error('❌ Custom API:', e);
    }
  }

  // 2. Z-AI SDK
  try {
    return await callZaiAPI(messages, config.chatId, config.userId, config.token);
  } catch (e) {
    console.error('❌ Z-AI:', e);
  }

  // 3. احتياطي
  return "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً. حاول مرة أخرى لاحقاً.";
}

async function callZaiAPI(
  messages: Array<{ role: string; content: string }>,
  chatId?: string,
  userId?: string,
  token?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Z-AI-From': 'Z',
  };
  if (chatId) headers['X-Chat-Id'] = chatId;
  if (userId) headers['X-User-Id'] = userId;
  if (token) headers['X-Token'] = token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 2048, thinking: { type: 'disabled' } }),
    });

    if (!response.ok) throw new Error(`Z-AI ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callCustomAPI(
  messages: Array<{ role: string; content: string }>,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ messages, model, temperature: 0.7, max_tokens: 2048 }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(timeout);
  }
}

// ============================
// Worker - معالجة الرسائل المعلقة
// ============================

async function processPendingMessages() {
  const pending = await db.message.findMany({
    where: { status: 'pending', role: 'user' },
    orderBy: { timestamp: 'asc' },
    take: 5,
  });

  for (const msg of pending) {
    try {
      const chatId = msg.chatId || msg.userId;
      console.log(`📩 معالجة: "${msg.content.substring(0, 50)}..." (user: ${msg.userId})`);

      // إرسال حالة الكتابة
      await sendChatAction(chatId);

      // استدعاء Z-AI
      const aiReply = await chatWithAI(msg.userId, msg.content);

      // حفظ رد AI
      await db.message.create({
        data: {
          userId: msg.userId,
          role: 'assistant',
          content: aiReply,
          modelUsed: 'moodchat-zai',
          status: 'done',
        },
      });

      // تحديث الرسالة الأصلية كـ "done"
      await db.message.update({
        where: { id: msg.id },
        data: { status: 'done' },
      });

      // إرسال الرد عبر تيليجرام
      await sendMessage(chatId, aiReply);
      console.log(`🤖 رد: "${aiReply.substring(0, 60)}..."`);

    } catch (error) {
      console.error(`❌ خطأ في معالجة رسالة ${msg.id}:`, error);

      // تحديث الرسالة كـ فاشلة
      await db.message.update({
        where: { id: msg.id },
        data: { status: 'done' },
      }).catch(() => {});
    }
  }
}

// ============================
// Main Loop
// ============================

async function startWorker() {
  console.log('');
  console.log('🌙 ═══════════════════════════════════════════════');
  console.log('🤖 مود شات - AI Worker');
  console.log('🧠 يعالج الرسائل المعلقة باستخدام Z-AI SDK');
  console.log('🔗 Vercel Webhook → DB → هذا الـ Worker → Z-AI');
  console.log('🌙 ═══════════════════════════════════════════════');
  console.log('');

  // اختبار Z-AI
  console.log('🧪 اختبار الاتصال بـ Z-AI SDK...');
  try {
    const reply = await callZaiAPI(
      [{ role: 'system', content: 'أنت مساعد.' }, { role: 'user', content: 'قل مرحبا' }],
      ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
    );
    console.log(`✅ Z-AI SDK يعمل! رد: "${reply.substring(0, 50)}..."`);
  } catch (e) {
    console.error('⚠️ Z-AI SDK لا يعمل:', e);
  }

  console.log('');
  console.log('🚀 الـ Worker يعمل الآن! اضغط Ctrl+C للإيقاف');
  console.log('');

  while (isRunning) {
    try {
      await processPendingMessages();
    } catch (error) {
      console.error('❌ خطأ في الـ Worker:', error);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

// إيقاف نظيف
process.on('SIGINT', () => {
  console.log('\n⏹️ جاري إيقاف الـ Worker...');
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

startWorker().catch(console.error);
