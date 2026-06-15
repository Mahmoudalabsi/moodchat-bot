/**
 * MoodChat Bot Runner - Long Polling Mode
 * يعمل محلياً مع Z-AI SDK مباشرة
 * يقرأ تحديثات تيليجرام عبر getUpdates (Long Polling)
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 50;
const POLL_TIMEOUT = 30; // ثانية

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// Z-AI API Config
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

let lastUpdateId = 0;
let isRunning = true;

// ============================
// Telegram API
// ============================

async function telegramAPI(method: string, params: Record<string, unknown> = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string, extra?: Record<string, unknown>) {
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function sendChatAction(chatId: number, action: string = 'typing') {
  return telegramAPI('sendChatAction', { chat_id: chatId, action });
}

// ============================
// AI Chat - Z-AI SDK (افتراضي) مع احتياطي
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
    return { provider: 'zsdk' as const, baseUrl: ZAI_BASE_URL, apiKey: ZAI_API_KEY, model: 'glm-4-plus', chatId, userId, token };
  } catch {
    return { provider: 'zsdk' as const, baseUrl: ZAI_BASE_URL, apiKey: ZAI_API_KEY, model: 'glm-4-plus', chatId: ZAI_CHAT_ID, userId: ZAI_USER_ID, token: ZAI_TOKEN };
  }
}

async function chatWithAI(userId: number, userMessage: string): Promise<string> {
  const dbMessages = await db.message.findMany({
    where: { userId },
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

  // 1. API Token إذا كان محدد
  if (config.provider === 'api' && config.baseUrl && config.apiKey) {
    try {
      return await callCustomAPI(messages, config.baseUrl, config.apiKey, config.model);
    } catch (error) {
      console.error('❌ Custom API فشل:', error);
    }
  }

  // 2. Z-AI SDK (الافتراضي - يعمل من شبكة Z.ai)
  try {
    return await callZaiAPI(messages, config.chatId, config.userId, config.token);
  } catch (error) {
    console.error('❌ Z-AI فشل:', error);
  }

  // 3. احتياطي: Pollinations.ai
  try {
    return await callPollinationsAPI(messages);
  } catch (error) {
    console.error('❌ Pollinations فشل أيضاً:', error);
    return "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً. حاول مرة أخرى لاحقاً.";
  }
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
    console.log('🤖 جاري الاتصال بـ Z-AI SDK...');
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
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

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Z-AI ${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply && reply.trim()) {
      console.log('✅ Z-AI SDK استجاب بنجاح');
      return reply.trim();
    }
    throw new Error('Empty Z-AI response');
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
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty API response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinationsAPI(
  messages: Array<{ role: string; content: string }>,
  retries: number = 2
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

      const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) continue;
        throw new Error(`Pollinations ${response.status}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply && reply.trim()) return reply.trim();
      throw new Error('Empty Pollinations response');
    } catch (error) {
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Pollinations all retries failed');
}

// ============================
// User Management
// ============================

async function getOrCreateUser(telegramUser: {
  id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean;
}) {
  let user = await db.telegramUser.findUnique({ where: { userId: telegramUser.id } });

  if (!user) {
    user = await db.telegramUser.create({
      data: {
        userId: telegramUser.id,
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        lastName: telegramUser.last_name || null,
        languageCode: telegramUser.language_code || null,
        isBot: telegramUser.is_bot || false,
        totalMessages: 1,
        isApproved: isAdmin(telegramUser.id),
        approvedAt: isAdmin(telegramUser.id) ? new Date() : null,
      },
    });
  } else {
    user = await db.telegramUser.update({
      where: { userId: telegramUser.id },
      data: {
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        lastName: telegramUser.last_name || null,
        totalMessages: { increment: 1 },
      },
    });
  }
  return user;
}

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

async function getJoinPassword(): Promise<string> {
  try {
    const config = await db.botConfig.findUnique({ where: { key: 'join_password' } });
    return config?.value || JOIN_PASSWORD;
  } catch {
    return JOIN_PASSWORD;
  }
}

// ============================
// Message Handler (نفس منطق الويب هوك)
// ============================

async function handleMessage(update: {
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean };
    chat: { id: number };
    text?: string;
  };
}) {
  try {
    const message = update.message;
    if (!message?.from || !message?.text) return;

    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();

    console.log(`📩 [${new Date().toLocaleTimeString()}] ${message.from.first_name || message.from.username}: ${text}`);

    const user = await getOrCreateUser(message.from);

    // نظام كلمة المرور
    if (user.waitingForPassword && !isAdmin(userId)) {
      const currentPassword = await getJoinPassword();
      if (text === currentPassword) {
        await db.telegramUser.update({ where: { userId }, data: { isApproved: true, approvedAt: new Date(), waitingForPassword: false } });
        await db.joinLog.create({ data: { userId, action: 'success' } });
        await sendMessage(chatId,
          "السلام عليكم ورحمة الله وبركاته 🌙\n\n"
          + "أهلاً وسهلاً بك في بوت **مود شات**! 🤖\n\n"
          + "✨ **المميزات:**\n"
          + "🧠 ذاكرة ذكية - أتذكر كل محادثاتنا\n"
          + "🌍 متعدد اللغات - أتحدث أي لغة\n"
          + "💬 محادثة طبيعية - أجيب بوضوح ودقة\n"
          + "🔐 خصوصية تامة - محادثاتك محمية\n\n"
          + "ابدأ محادثتك الآن! 👋"
        );
        console.log('✅ مستخدم جديد تم تفعيله');
      } else {
        await db.telegramUser.update({ where: { userId }, data: { joinAttempts: { increment: 1 } } });
        await db.joinLog.create({ data: { userId, action: 'fail', passwordTried: text.substring(0, 50) } });
        await sendMessage(chatId, "❌ كلمة المرور خاطئة!\n\nحاول مرة أخرى.");
        console.log('❌ كلمة مرور خاطئة');
      }
      return;
    }

    // أمر /start
    if (text === '/start') {
      if (isAdmin(userId) || user.isApproved) {
        await sendMessage(chatId,
          "السلام عليكم ورحمة الله وبركاته 🌙\n\n"
          + "أهلاً بك في بوت **مود شات**! 🤖\n\n"
          + "✨ **المميزات:**\n"
          + "🧠 ذاكرة ذكية - أتذكر كل محادثاتنا\n"
          + "🌍 متعدد اللغات - أتحدث أي لغة\n"
          + "💬 محادثة طبيعية - أجيب بوضوح ودقة\n"
          + "🔐 خصوصية تامة - محادثاتك محمية\n\n"
          + "/clear - مسح الذاكرة والبدء من جديد\n"
          + "/help - عرض المساعدة"
        );
      } else {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
        await db.joinLog.create({ data: { userId, action: 'attempt' } });
        await sendMessage(chatId, "🔐 **هذا البوت خاص ومحمي بكلمة مرور!**\n\nللاستخدام، أرسل كلمة المرور أدناه:");
      }
      return;
    }

    // التحقق من الصلاحية
    if (!user.isApproved || user.isBlocked) {
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
      }
      await sendMessage(chatId, user.isBlocked ? "🚫 تم حظرك من استخدام هذا البوت." : "🔐 أرسل كلمة المرور للاستخدام.");
      return;
    }

    // أوامر عامة
    if (text === '/help') {
      await sendMessage(chatId,
        "🤖 **مود شات - المساعدة**\n\n"
        + "✨ **المميزات:**\n"
        + "🧠 ذاكرة ذكية - أتذكر كل محادثاتنا\n"
        + "🌍 متعدد اللغات - أتحدث أي لغة\n"
        + "💬 محادثة طبيعية - أجيب بوضوح ودقة\n"
        + "🔐 خصوصية تامة - محادثاتك محمية\n\n"
        + "📌 **الأوامر:**\n"
        + "/start - بدء المحادثة\n"
        + "/clear - مسح الذاكرة والبدء من جديد\n"
        + "/help - عرض المساعدة"
      );
      return;
    }

    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "🗑️ تم مسح سجل محادثتك وذاكرتي.\n\nيمكنك البدء بمحادثة جديدة الآن!");
      console.log('🗑️ تم مسح ذاكرة مستخدم');
      return;
    }

    // أوامر المدير
    if (isAdmin(userId)) {
      if (text === '/stats') {
        const totalUsers = await db.telegramUser.count();
        const approvedUsers = await db.telegramUser.count({ where: { isApproved: true } });
        const blockedUsers = await db.telegramUser.count({ where: { isBlocked: true } });
        const totalMessages = await db.message.count();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const messagesToday = await db.message.count({ where: { timestamp: { gte: today } } });
        const config = await getAIConfig();
        await sendMessage(chatId,
          `📊 **إحصائيات مود شات**\n\n`
          + `👥 المستخدمين: ${totalUsers}\n`
          + `✅ المفعلين: ${approvedUsers}\n`
          + `🚫 المحظورين: ${blockedUsers}\n`
          + `📨 الرسائل: ${totalMessages}\n`
          + `📩 رسائل اليوم: ${messagesToday}\n`
          + `🤖 AI: ${config.provider === 'zsdk' ? 'Z-AI SDK' : config.model}`
        );
        return;
      }
      if (text.startsWith('/block ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: true, waitingForPassword: false } });
          await sendMessage(chatId, `🚫 تم حظر المستخدم \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith('/unblock ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: false } });
          await sendMessage(chatId, `✅ تم إلغاء حظر المستخدم \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith('/kick ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.message.deleteMany({ where: { userId: targetId } });
          await db.joinLog.deleteMany({ where: { userId: targetId } });
          await db.telegramUser.delete({ where: { userId: targetId } });
          await sendMessage(chatId, `🗑️ تم حذف المستخدم \`${targetId}\``);
        }
        return;
      }
      if (text.startsWith('/broadcast ')) {
        const broadcastMsg = text.replace('/broadcast ', '');
        const users = await db.telegramUser.findMany({ where: { isApproved: true, isBlocked: false } });
        let sent = 0;
        for (const u of users) { try { await sendMessage(u.userId, `📢 ${broadcastMsg}`); sent++; } catch {} }
        await sendMessage(chatId, `📢 تم الإرسال إلى ${sent} من ${users.length}.`);
        return;
      }
      if (text.startsWith('/setpass ')) {
        const newPass = text.replace('/setpass ', '').trim();
        if (newPass.length >= 3) {
          await db.botConfig.upsert({ where: { key: 'join_password' }, update: { value: newPass }, create: { key: 'join_password', value: newPass } });
          await sendMessage(chatId, `🔑 تم تغيير كلمة المرور`);
        }
        return;
      }
    }

    // محادثة عادية مع الذكاء الاصطناعي
    await sendChatAction(chatId);

    await db.message.create({ data: { userId, role: 'user', content: text, modelUsed: 'moodchat' } });

    const aiReply = await chatWithAI(userId, text);

    await db.message.create({ data: { userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat' } });

    await sendMessage(chatId, aiReply);
    console.log(`🤖 رد: ${aiReply.substring(0, 80)}...`);

  } catch (error) {
    console.error('❌ خطأ في معالجة الرسالة:', error);
  }
}

// ============================
// Long Polling Loop
// ============================

async function startPolling() {
  console.log('');
  console.log('🌙 ═══════════════════════════════════════');
  console.log('🤖 مود شات - بوت التشغيل المحلي');
  console.log('📡 وضع: Long Polling');
  console.log('🧠 AI: Z-AI SDK (افتراضي)');
  console.log('🌙 ═══════════════════════════════════════');
  console.log('');

  // ملاحظة: يجب حذف الويب هوك ومسح التحديثات قبل تشغيل هذا السكربت
  // استخدم: start-bot.sh أو نفذ الأوامر يدوياً
  console.log('🚀 جاري بدء Long Polling...');
  console.log('🧠 Z-AI SDK سيعمل تلقائياً عند أول رسالة');
  console.log('');

  while (isRunning) {
    try {
      const result = await telegramAPI('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message'],
      });

      if (!result.ok) {
        if (result.description?.includes('Conflict')) {
          console.error('⚠️ تعارض - جاري إعادة المحاولة...');
          await new Promise(r => setTimeout(r, 10000));
        } else {
          console.error('❌ خطأ في getUpdates:', result.description);
          await new Promise(r => setTimeout(r, 5000));
        }
        continue;
      }

      const updates = result.result || [];
      for (const update of updates) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        // معالجة كل تحديث في الخلفية
        handleMessage(update).catch(err => console.error('❌ خطأ:', err));
      }
    } catch (error) {
      console.error('❌ خطأ في الاتصال:', error);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// إيقاف نظيف
process.on('SIGINT', () => {
  console.log('\n⏹️ جاري إيقاف البوت...');
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  isRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

// تشغيل
startPolling().catch(console.error);
