/**
 * Telegram Bot Library - Smart Hybrid Mode
 * 
 * النظام:
 * 1. Vercel Webhook → يستلم الرسالة
 * 2. يحاول الرد المباشر بالـ AI (Z-AI → Pollinations)
 * 3. إذا فشل → يحفظ كـ "pending" للـ Worker المحلي
 * 
 * كلمة المرور: MOOD2026
 * Z-AI SDK هو المزود الافتراضي
 */

import { db } from './db';

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// Z-AI API Config
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

// ============================
// Telegram API Helpers
// ============================

async function telegramAPI(method: string, params: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string, extra?: Record<string, unknown>) {
  return telegramAPI('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

async function sendChatAction(chatId: number, action: string = 'typing') {
  return telegramAPI('sendChatAction', { chat_id: chatId, action });
}

// ============================
// AI Providers
// ============================

async function getAIConfig(): Promise<{
  provider: 'zsdk' | 'api';
  baseUrl: string;
  apiKey: string;
  model: string;
  chatId?: string;
  userId?: string;
  token?: string;
}> {
  try {
    const providerConfig = await db.botConfig.findUnique({ where: { key: 'ai_provider' } });
    const provider = providerConfig?.value || 'zsdk';

    if (provider === 'api') {
      const baseUrl = (await db.botConfig.findUnique({ where: { key: 'api_base_url' } }))?.value || '';
      const apiKey = (await db.botConfig.findUnique({ where: { key: 'api_key' } }))?.value || '';
      const model = (await db.botConfig.findUnique({ where: { key: 'api_model' } }))?.value || 'gpt-4';
      return { provider: 'api', baseUrl, apiKey, model };
    }

    const chatId = (await db.botConfig.findUnique({ where: { key: 'zai_chat_id' } }))?.value || ZAI_CHAT_ID;
    const userId = (await db.botConfig.findUnique({ where: { key: 'zai_user_id' } }))?.value || ZAI_USER_ID;
    const token = (await db.botConfig.findUnique({ where: { key: 'zai_token' } }))?.value || ZAI_TOKEN;
    return {
      provider: 'zsdk',
      baseUrl: ZAI_BASE_URL,
      apiKey: ZAI_API_KEY,
      model: 'glm-4-plus',
      chatId,
      userId,
      token,
    };
  } catch {
    return {
      provider: 'zsdk',
      baseUrl: ZAI_BASE_URL,
      apiKey: ZAI_API_KEY,
      model: 'glm-4-plus',
      chatId: ZAI_CHAT_ID,
      userId: ZAI_USER_ID,
      token: ZAI_TOKEN,
    };
  }
}

export async function callZaiAPI(
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
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Z-AI ${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply && reply.trim()) return reply.trim();
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
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ messages, model, temperature: 0.7, max_tokens: 1024 }),
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
  retries: number = 1
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

      const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages,
          model: 'openai',
          temperature: 0.7,
          seed: Math.floor(Math.random() * 10000),
        }),
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
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  is_bot?: boolean;
}) {
  let user = await db.telegramUser.findUnique({
    where: { userId: telegramUser.id },
  });

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

// ============================
// Main Webhook Handler - Smart Hybrid
// ============================

export async function handleTelegramUpdate(update: {
  message?: {
    message_id: number;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
      is_bot?: boolean;
    };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    data?: string;
    message?: { chat: { id: number } };
  };
}) {
  try {
    if (update.callback_query) {
      await telegramAPI('answerCallbackQuery', {
        callback_query_id: update.callback_query.id,
      });
      return { ok: true };
    }

    const message = update.message;
    if (!message?.from || !message?.text) return { ok: true };

    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();

    const user = await getOrCreateUser(message.from);

    // ============================
    // نظام كلمة المرور
    // ============================

    if (user.waitingForPassword && !isAdmin(userId)) {
      const currentPassword = await getJoinPassword();
      if (text === currentPassword) {
        await db.telegramUser.update({
          where: { userId },
          data: { isApproved: true, approvedAt: new Date(), waitingForPassword: false },
        });
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
      } else {
        await db.telegramUser.update({
          where: { userId },
          data: { joinAttempts: { increment: 1 } },
        });
        await db.joinLog.create({ data: { userId, action: 'fail', passwordTried: text.substring(0, 50) } });
        await sendMessage(chatId, "❌ كلمة المرور خاطئة!\n\nحاول مرة أخرى.");
      }
      return { ok: true };
    }

    // ============================
    // أمر /start
    // ============================

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
      return { ok: true };
    }

    // ============================
    // التحقق من الصلاحية
    // ============================

    if (!user.isApproved || user.isBlocked) {
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
      }
      if (user.isBlocked) {
        await sendMessage(chatId, "🚫 تم حظرك من استخدام هذا البوت.");
      } else {
        await sendMessage(chatId, "🔐 أرسل كلمة المرور للاستخدام.");
      }
      return { ok: true };
    }

    // ============================
    // أوامر عامة
    // ============================

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
      return { ok: true };
    }

    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "🗑️ تم مسح سجل محادثتك وذاكرتي.\n\nيمكنك البدء بمحادثة جديدة الآن!");
      return { ok: true };
    }

    // ============================
    // أوامر المدير
    // ============================

    if (isAdmin(userId)) {
      if (text === '/stats') { await handleDashboardCommand(chatId); return { ok: true }; }
      if (text === '/users') { await handleUsersCommand(chatId); return { ok: true }; }
      if (text.startsWith('/chatlog')) { await handleChatLogCommand(chatId, text); return { ok: true }; }
      if (text.startsWith('/block ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: true, waitingForPassword: false } });
          await sendMessage(chatId, `🚫 تم حظر المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/unblock ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: false } });
          await sendMessage(chatId, `✅ تم إلغاء حظر المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/kick ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.message.deleteMany({ where: { userId: targetId } });
          await db.joinLog.deleteMany({ where: { userId: targetId } });
          await db.telegramUser.delete({ where: { userId: targetId } });
          await sendMessage(chatId, `🗑️ تم حذف المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/broadcast ')) {
        await handleBroadcast(chatId, text.replace('/broadcast ', ''));
        return { ok: true };
      }
      if (text.startsWith('/setpass ')) {
        const newPass = text.replace('/setpass ', '').trim();
        if (newPass.length >= 3) {
          await db.botConfig.upsert({ where: { key: 'join_password' }, update: { value: newPass }, create: { key: 'join_password', value: newPass } });
          await sendMessage(chatId, `🔑 تم تغيير كلمة المرور`);
        } else {
          await sendMessage(chatId, "❌ كلمة المرور يجب أن تكون 3 أحرف على الأقل");
        }
        return { ok: true };
      }
    }

    // ============================
    // محادثة عادية - Smart Hybrid
    // يحاول الرد المباشر أولاً، ثم يحفظ كـ pending إذا فشل
    // ============================

    await sendChatAction(chatId);

    // حفظ رسالة المستخدم كـ pending أولاً
    const userMsg = await db.message.create({
      data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'pending', chatId },
    });

    try {
      // بناء سجل المحادثة
      const dbMessages = await db.message.findMany({
        where: { userId, status: 'done' },
        orderBy: { timestamp: 'asc' },
        take: MAX_HISTORY,
      });

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: text },
      ];

      const config = await getAIConfig();
      let aiReply: string | null = null;

      // 1. Z-AI SDK (الافتراضي)
      if (config.provider === 'zsdk') {
        try {
          aiReply = await callZaiAPI(messages, config.chatId, config.userId, config.token);
        } catch { /* Z-AI failed - try next provider */ }
      }

      // 2. API Token
      if (!aiReply && config.provider === 'api' && config.baseUrl && config.apiKey) {
        try {
          aiReply = await callCustomAPI(messages, config.baseUrl, config.apiKey, config.model);
        } catch {}
      }

      // 3. Pollinations.ai احتياطي
      if (!aiReply) {
        try {
          aiReply = await callPollinationsAPI(messages);
        } catch {}
      }

      if (aiReply) {
        // تم الحصول على رد - تحديث الرسالة وإرسال الرد
        await db.message.update({ where: { id: userMsg.id }, data: { status: 'done' } });
        await db.message.create({
          data: { userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat-ai', status: 'done', chatId },
        });
        await sendMessage(chatId, aiReply);
        return { ok: true };
      }
    } catch (error) {
      console.error('Direct AI call failed:', error);
    }

    // إذا فشلت جميع المحاولات → الرسالة تبقى "pending" للـ Worker المحلي
    console.log('Message saved as pending for local worker');
    return { ok: true };

  } catch (error) {
    console.error('Webhook handler error:', error);
    return { ok: false, error: String(error) };
  }
}

// ============================
// أوامر المدير
// ============================

async function handleDashboardCommand(chatId: number) {
  const totalUsers = await db.telegramUser.count();
  const approvedUsers = await db.telegramUser.count({ where: { isApproved: true } });
  const blockedUsers = await db.telegramUser.count({ where: { isBlocked: true } });
  const totalMessages = await db.message.count();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const messagesToday = await db.message.count({ where: { timestamp: { gte: today } } });
  const newUsersToday = await db.telegramUser.count({ where: { firstSeen: { gte: today } } });
  const config = await getAIConfig();
  const aiInfo = config.provider === 'zsdk' ? 'Z-AI SDK (GLM-4 Plus)' : config.model;

  await sendMessage(chatId,
    `📊 **إحصائيات مود شات**\n\n`
    + `👥 المستخدمين: ${totalUsers}\n`
    + `✅ المفعلين: ${approvedUsers}\n`
    + `🚫 المحظورين: ${blockedUsers}\n`
    + `📨 الرسائل: ${totalMessages}\n`
    + `📩 رسائل اليوم: ${messagesToday}\n`
    + `🆕 مستخدمين جدد: ${newUsersToday}\n`
    + `🤖 AI: ${aiInfo}`
  );
}

async function handleUsersCommand(chatId: number) {
  const users = await db.telegramUser.findMany({ orderBy: { lastActive: 'desc' }, take: 20 });
  if (users.length === 0) { await sendMessage(chatId, "لا يوجد مستخدمين."); return; }
  const userList = users.map(u => {
    const status = u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳';
    const name = u.firstName || u.username || 'مجهول';
    return `${status} ${name} (\`${u.userId}\`) - ${u.totalMessages} رسالة`;
  }).join('\n');
  await sendMessage(chatId, `👥 **المستخدمين:**\n\n${userList}`);
}

async function handleChatLogCommand(chatId: number, text: string) {
  const parts = text.split(' ');
  if (parts.length < 2) { await sendMessage(chatId, "استخدم: `/chatlog [user_id]`"); return; }
  const targetId = parseInt(parts[1]);
  const messages = await db.message.findMany({ where: { userId: targetId }, orderBy: { timestamp: 'desc' }, take: 30 });
  if (messages.length === 0) { await sendMessage(chatId, "لا توجد رسائل."); return; }
  const log = messages.reverse().map(m => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content.substring(0, 150)}`).join('\n');
  const chunks: string[] = [];
  let current = `📋 محادثة \`${targetId}\`:\n\n`;
  for (const line of log.split('\n')) {
    if (current.length + line.length + 1 > 3800) { chunks.push(current); current = ''; }
    current += line + '\n';
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) await sendMessage(chatId, chunk);
}

async function handleBroadcast(chatId: number, message: string) {
  const users = await db.telegramUser.findMany({ where: { isApproved: true, isBlocked: false } });
  let sent = 0;
  for (const user of users) { try { await sendMessage(user.userId, `📢 ${message}`); sent++; } catch {} }
  await sendMessage(chatId, `📢 تم الإرسال إلى ${sent} من ${users.length}.`);
}

// ============================
// Webhook Management
// ============================

export async function setWebhook(webhookUrl: string) {
  return telegramAPI('setWebhook', { url: webhookUrl });
}

export async function getWebhookInfo() {
  return telegramAPI('getWebhookInfo', {});
}

export async function deleteWebhook() {
  return telegramAPI('deleteWebhook', {});
}

export async function getJoinPassword(): Promise<string> {
  try {
    const config = await db.botConfig.findUnique({ where: { key: 'join_password' } });
    return config?.value || JOIN_PASSWORD;
  } catch {
    return JOIN_PASSWORD;
  }
}
