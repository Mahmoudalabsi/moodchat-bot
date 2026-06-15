/**
 * Telegram Bot Library - Webhook Mode for Vercel
 * يعمل كـ webhook على Vercel Serverless
 * يستخدم Z-AI API مباشرة (مجاني 100%)
 * كلمة المرور + ذاكرة المحادثة في قاعدة البيانات
 */

import { db } from './db';

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'ai2024';
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// Z-AI API Config
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

// Optional: Gemini API key (free at https://aistudio.google.com/apikey)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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
// AI Chat - Multi-provider with fallback
// ============================

async function chatWithAI(userId: number, userMessage: string): Promise<string> {
  // بناء سجل المحادثة من قاعدة البيانات
  const dbMessages = await db.message.findMany({
    where: { userId },
    orderBy: { timestamp: 'asc' },
    take: MAX_HISTORY,
  });

  // تحويل لصيغة API
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const msg of dbMessages) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // إضافة الرسالة الحالية
  messages.push({ role: 'user', content: userMessage });

  // محاولة مع مزود AI مختلف
  const errors: string[] = [];

  // 1. محاولة مع Gemini (الأفضل - مجاني وموثوق)
  if (GEMINI_API_KEY) {
    try {
      return await callGeminiAPI(messages);
    } catch (e) {
      errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. محاولة مع Z-AI (يعمل من بيئة Z.ai المحلية فقط)
  try {
    return await callZaiAPI(messages);
  } catch (e) {
    errors.push(`Z-AI: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. محاولة مع Pollinations.ai (مجاني، بدون مفتاح - قد يكون بطيء)
  try {
    return await callPollinationsAPI(messages);
  } catch (e) {
    errors.push(`Pollinations: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

async function callZaiAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Z-AI-From': 'Z',
  };

  if (ZAI_CHAT_ID) headers['X-Chat-Id'] = ZAI_CHAT_ID;
  if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
  if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

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
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty Z-AI response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinationsAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        model: 'openai',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Pollinations ${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty Pollinations response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    // تحويل لصيغة Gemini API
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system');

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini ${response.status}: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty Gemini response');
  } finally {
    clearTimeout(timeout);
  }
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
        // المدير يدخل مباشرة بدون كلمة سر
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
// Main Webhook Handler
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
    // Handle callback queries
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

    console.log(`📩 [${message.from.first_name || '?'}] ${text.substring(0, 80)}`);

    // Register/update user
    const user = await getOrCreateUser(message.from);

    // ============================
    // نظام كلمة المرور - مخزن في قاعدة البيانات
    // ============================

    // إذا المستخدم ينتظر كلمة المرور
    if (user.waitingForPassword && !isAdmin(userId)) {
      const currentPassword = await getJoinPassword();
      if (text === currentPassword) {
        await db.telegramUser.update({
          where: { userId },
          data: {
            isApproved: true,
            approvedAt: new Date(),
            waitingForPassword: false,
          },
        });
        await db.joinLog.create({
          data: { userId, action: 'success' },
        });
        await sendMessage(chatId,
          "✅ **تم التحقق بنجاح!**\n\n"
          + "مرحباً بك في البوت! 🎉\n"
          + "الآن يمكنك محادثتي بحرية.\n\n"
          + "استخدم /help لمعرفة الأوامر المتاحة."
        );
      } else {
        await db.telegramUser.update({
          where: { userId },
          data: { joinAttempts: { increment: 1 } },
        });
        await db.joinLog.create({
          data: { userId, action: 'fail', passwordTried: text.substring(0, 50) },
        });
        await sendMessage(chatId,
          "❌ **كلمة السر خاطئة!**\n\n"
          + "حاول مرة أخرى أو تواصل مع مالك البوت للحصول على كلمة السر."
        );
      }
      return { ok: true };
    }

    // ============================
    // أمر /start
    // ============================

    if (text === '/start') {
      if (isAdmin(userId) || user.isApproved) {
        await sendMessage(chatId,
          "مرحباً! 👋 أنا بوت **مود شات** للذكاء الاصطناعي\n"
          + "يمكنك محادثتي بأي لغة وأنا سأرد عليك!\n"
          + "سأتذكر كل ما تقوله في محادثتنا 💬\n\n"
          + "الأوامر المتاحة:\n"
          + "/start - بدء المحادثة\n"
          + "/clear - مسح سجل المحادثة\n"
          + "/help - عرض المساعدة"
        );
      } else {
        // المستخدم جديد - يطلب كلمة سر
        await db.telegramUser.update({
          where: { userId },
          data: { waitingForPassword: true },
        });
        await db.joinLog.create({
          data: { userId, action: 'attempt' },
        });
        await sendMessage(chatId,
          "🔐 **هذا البوت خاص ومحمي بكلمة سر!**\n\n"
          + "للاستخدام، أرسل كلمة السر أدناه:\n"
          + "(إذا لم تكن تعرف كلمة السر، تواصل مع مالك البوت)"
        );
      }
      return { ok: true };
    }

    // ============================
    // التحقق من الصلاحية
    // ============================

    if (!user.isApproved || user.isBlocked) {
      // إذا غير موافق عليه، يطلب كلمة سر
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({
          where: { userId },
          data: { waitingForPassword: true },
        });
      }
      if (user.isBlocked) {
        await sendMessage(chatId, "🚫 تم حظرك من استخدام هذا البوت.");
      } else {
        await sendMessage(chatId, "🔐 أرسل كلمة السر للاستخدام.");
      }
      return { ok: true };
    }

    // ============================
    // أوامر عامة
    // ============================

    if (text === '/help') {
      let helpText = "🤖 **مساعدة مود شات**\n\n"
        + "📌 **الأوامر:**\n"
        + "/start - بدء محادثة جديدة\n"
        + "/clear - مسح سجل المحادثة والذاكرة\n"
        + "/help - عرض هذه الرسالة\n\n"
        + "💡 **مميزات:**\n"
        + "- أتحدث أي لغة\n"
        + "- أتذكر كل ما تقوله في المحادثة\n"
        + "- استخدم /clear لمسح ذاكرتي والبدء من جديد";

      if (isAdmin(userId)) {
        helpText += "\n\n👑 **أوامر المدير:**\n"
          + "/stats - إحصائيات البوت\n"
          + "/users - قائمة المستخدمين\n"
          + "/chatlog [ID] - قراءة محادثة مستخدم\n"
          + "/block [ID] - حظر مستخدم\n"
          + "/unblock [ID] - إلغاء حظر\n"
          + "/kick [ID] - حذف مستخدم نهائياً\n"
          + "/broadcast [رسالة] - إرسال للجميع\n"
          + "/setpass [كلمة] - تغيير كلمة السر";
      }

      await sendMessage(chatId, helpText);
      return { ok: true };
    }

    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId,
        "🗑️ **تم مسح سجل محادثتك وذاكرتي.**\n\n"
        + "يمكنك البدء بمحادثة جديدة الآن!"
      );
      return { ok: true };
    }

    // ============================
    // أوامر المدير
    // ============================

    if (isAdmin(userId)) {
      if (text === '/stats') {
        await handleDashboardCommand(chatId);
        return { ok: true };
      }
      if (text === '/users') {
        await handleUsersCommand(chatId);
        return { ok: true };
      }
      if (text.startsWith('/chatlog')) {
        await handleChatLogCommand(chatId, text);
        return { ok: true };
      }
      if (text.startsWith('/block ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.telegramUser.update({
            where: { userId: targetId },
            data: { isBlocked: true, waitingForPassword: false },
          });
          await sendMessage(chatId, `🚫 تم حظر المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/unblock ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId) {
          await db.telegramUser.update({
            where: { userId: targetId },
            data: { isBlocked: false },
          });
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
          await sendMessage(chatId, `🗑️ تم حذف المستخدم \`${targetId}\` وجميع بياناته`);
        }
        return { ok: true };
      }
      if (text.startsWith('/broadcast ')) {
        const broadcastMsg = text.replace('/broadcast ', '');
        await handleBroadcast(chatId, broadcastMsg);
        return { ok: true };
      }
      if (text.startsWith('/setpass ')) {
        const newPass = text.replace('/setpass ', '').trim();
        if (newPass.length >= 3) {
          // Update the JOIN_PASSWORD in BotConfig
          await db.botConfig.upsert({
            where: { key: 'join_password' },
            update: { value: newPass },
            create: { key: 'join_password', value: newPass },
          });
          await sendMessage(chatId, `🔑 تم تغيير كلمة السر إلى: \`${newPass}\``);
        } else {
          await sendMessage(chatId, "❌ كلمة السر يجب أن تكون 3 أحرف على الأقل");
        }
        return { ok: true };
      }
    }

    // ============================
    // محادثة عادية مع الذكاء الاصطناعي
    // ============================

    await sendChatAction(chatId);

    // حفظ رسالة المستخدم في قاعدة البيانات
    await db.message.create({
      data: { userId, role: 'user', content: text, modelUsed: 'zai-glm4' },
    });

    // الحصول على رد من الذكاء الاصطناعي (مع ذاكرة كاملة)
    const aiReply = await chatWithAI(userId, text);

    // حفظ رد المساعد
    await db.message.create({
      data: { userId, role: 'assistant', content: aiReply, modelUsed: 'zai-glm4' },
    });

    await sendMessage(chatId, aiReply);
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
  const pendingUsers = await db.telegramUser.count({ where: { isApproved: false, isBlocked: false } });
  const totalMessages = await db.message.count();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const messagesToday = await db.message.count({
    where: { timestamp: { gte: today } },
  });
  const newUsersToday = await db.telegramUser.count({
    where: { firstSeen: { gte: today } },
  });

  const stats = [
    `📊 **لوحة تحكم مود شات**\n`,
    `👥 المستخدمين: ${totalUsers}`,
    `✅ الموافق عليهم: ${approvedUsers}`,
    `⏳ في الانتظار: ${pendingUsers}`,
    `🚫 المحظورين: ${blockedUsers}`,
    `📨 إجمالي الرسائل: ${totalMessages}`,
    `📩 رسائل اليوم: ${messagesToday}`,
    `🆕 مستخدمين جدد اليوم: ${newUsersToday}`,
    `🤖 مزود AI: Z-AI (GLM-4 Plus) مجاني`,
  ].join('\n');

  await sendMessage(chatId, stats);
}

async function handleUsersCommand(chatId: number) {
  const users = await db.telegramUser.findMany({
    orderBy: { lastActive: 'desc' },
    take: 20,
  });

  if (users.length === 0) {
    await sendMessage(chatId, "لا يوجد مستخدمين مسجلين.");
    return;
  }

  const userList = users.map(u => {
    const status = u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳';
    const name = u.firstName || u.username || 'مجهول';
    return `${status} ${name} (\`${u.userId}\`) - ${u.totalMessages} رسالة`;
  }).join('\n');

  await sendMessage(chatId, `👥 **قائمة المستخدمين:**\n\n${userList}`);
}

async function handleChatLogCommand(chatId: number, text: string) {
  const parts = text.split(' ');
  if (parts.length < 2) {
    await sendMessage(chatId, "استخدم: `/chatlog [user_id]`");
    return;
  }

  const targetId = parseInt(parts[1]);
  const messages = await db.message.findMany({
    where: { userId: targetId },
    orderBy: { timestamp: 'desc' },
    take: 30,
  });

  if (messages.length === 0) {
    await sendMessage(chatId, "لا توجد رسائل لهذا المستخدم.");
    return;
  }

  const log = messages.reverse().map(m => {
    const role = m.role === 'user' ? '👤' : '🤖';
    const time = new Date(m.timestamp).toLocaleString('ar-EG');
    return `${role} [${time}]: ${m.content.substring(0, 150)}`;
  }).join('\n');

  // Telegram has a 4096 char limit per message
  const chunks = [];
  let current = `📋 **سجل محادثة \`${targetId}\`:**\n\n`;
  for (const line of log.split('\n')) {
    if (current.length + line.length + 1 > 3800) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await sendMessage(chatId, chunk);
  }
}

async function handleBroadcast(chatId: number, message: string) {
  const users = await db.telegramUser.findMany({
    where: { isApproved: true, isBlocked: false },
  });

  let sent = 0;
  for (const user of users) {
    try {
      await sendMessage(user.userId, `📢 **إعلان من المدير:**\n\n${message}`);
      sent++;
    } catch {}
  }

  await sendMessage(chatId, `📢 تم إرسال الرسالة إلى ${sent} مستخدم من أصل ${users.length}.`);
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

// Get effective join password (from DB or default)
export async function getJoinPassword(): Promise<string> {
  try {
    const config = await db.botConfig.findUnique({ where: { key: 'join_password' } });
    return config?.value || JOIN_PASSWORD;
  } catch {
    return JOIN_PASSWORD;
  }
}
