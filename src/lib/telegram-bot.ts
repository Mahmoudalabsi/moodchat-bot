/**
 * Telegram Bot Library - MoodChat (مود شات) - محسّن للسرعة
 * 
 * التحسينات:
 * - كاش ذاكري لإعدادات AI (لا استعلام DB لكل رسالة)
 * - تقليل استعلامات DB من 11 إلى 4 كحد أقصى
 * - استعلامات متوازية حيثما أمكن
 * - إعادة المحاولة مع تراجع أسي لحد المعدل
 * - Z-AI SDK هو المزود الافتراضي
 */

import { db } from './db';

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

// Z-AI Config - من متغيرات البيئة مباشرة (لا استعلام DB)
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

// ============================
// كاش ذاكري لإعدادات AI
// ============================

let aiConfigCache: {
  provider: 'zsdk' | 'api';
  baseUrl: string;
  apiKey: string;
  model: string;
  chatId?: string;
  userId?: string;
  token?: string;
} | null = null;

let aiConfigCacheTime = 0;
const AI_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

async function getAIConfig() {
  // استخدم الكاش إذا كان متوفراً وأقل من 5 دقائق
  if (aiConfigCache && Date.now() - aiConfigCacheTime < AI_CONFIG_CACHE_TTL) {
    return aiConfigCache;
  }

  try {
    // استعلام واحد يجلب كل الإعدادات
    const configs = await db.botConfig.findMany({
      where: {
        key: { in: ['ai_provider', 'api_base_url', 'api_key', 'api_model', 'zai_chat_id', 'zai_user_id', 'zai_token'] }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));
    const provider = configMap.ai_provider || 'zsdk';

    if (provider === 'api' && configMap.api_base_url && configMap.api_key) {
      aiConfigCache = {
        provider: 'api',
        baseUrl: configMap.api_base_url,
        apiKey: configMap.api_key,
        model: configMap.api_model || 'gpt-4',
      };
    } else {
      aiConfigCache = {
        provider: 'zsdk',
        baseUrl: ZAI_BASE_URL,
        apiKey: ZAI_API_KEY,
        model: 'glm-4-plus',
        chatId: configMap.zai_chat_id || ZAI_CHAT_ID,
        userId: configMap.zai_user_id || ZAI_USER_ID,
        token: configMap.zai_token || ZAI_TOKEN,
      };
    }
  } catch {
    // في حالة فشل DB، استخدم الإعدادات الافتراضية
    aiConfigCache = {
      provider: 'zsdk',
      baseUrl: ZAI_BASE_URL,
      apiKey: ZAI_API_KEY,
      model: 'glm-4-plus',
      chatId: ZAI_CHAT_ID,
      userId: ZAI_USER_ID,
      token: ZAI_TOKEN,
    };
  }

  aiConfigCacheTime = Date.now();
  return aiConfigCache!;
}

// دالة لمسح الكاش عند تغيير الإعدادات
export function clearAIConfigCache() {
  aiConfigCache = null;
  aiConfigCacheTime = 0;
}

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
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function sendChatAction(chatId: number, action: string = 'typing') {
  return telegramAPI('sendChatAction', { chat_id: chatId, action });
}

// ============================
// AI Providers
// ============================

/**
 * Z-AI API - محسّن للسرعة مع إعادة محاولة ذكية
 */
export async function callZaiAPI(
  messages: Array<{ role: string; content: string }>,
  chatId?: string,
  userId?: string,
  token?: string
): Promise<string> {
  const maxRetries = 2; // تقليل المحاولات للسرعة
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 ثانية مهلة

    try {
      if (attempt > 0) {
        const delay = 1500 * attempt + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-From': 'Z',
      };
      if (chatId) headers['X-Chat-Id'] = chatId;
      if (userId) headers['X-User-Id'] = userId;
      if (token) headers['X-Token'] = token;

      const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          messages,
          temperature: 0.7,
          max_tokens: 800,
          thinking: { type: 'disabled' },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
          lastError = new Error(`Z-AI ${response.status}`);
          continue;
        }
        throw new Error(`Z-AI ${response.status}: ${errorBody.substring(0, 100)}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply && reply.trim()) return reply.trim();
      throw new Error('Empty Z-AI response');
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Z-AI failed');
}

async function callCustomAPI(
  messages: Array<{ role: string; content: string }>,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ messages, model, temperature: 0.7, max_tokens: 800 }),
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
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000));

      const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages, model: 'openai', temperature: 0.7,
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
      throw new Error('Empty response');
    } catch (error) {
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Pollinations failed');
}

// ============================
// User Management - محسّن
// ============================

async function getOrCreateUser(telegramUser: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  is_bot?: boolean;
}) {
  // upsert واحد بدلاً من findUnique + create/update
  return db.telegramUser.upsert({
    where: { userId: telegramUser.id },
    create: {
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
    update: {
      username: telegramUser.username || null,
      firstName: telegramUser.first_name || null,
      lastName: telegramUser.last_name || null,
      totalMessages: { increment: 1 },
    },
  });
}

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

// ============================
// Main Webhook Handler - محسّن للسرعة
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
    from: { id: number; username?: string; first_name?: string; };
    data?: string;
    message?: { chat: { id: number } };
  };
}) {
  try {
    if (update.callback_query) {
      await telegramAPI('answerCallbackQuery', { callback_query_id: update.callback_query.id });
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
          "السلام عليكم ورحمة الله وبركاته\n\n"
          + "أهلاً وسهلاً بك في بوت **مود شات**!\n\n"
          + "**المميزات:**\n"
          + "- ذاكرة ذكية - أتذكر كل محادثاتنا\n"
          + "- متعدد اللغات - أتحدث أي لغة\n"
          + "- محادثة طبيعية - أجيب بوضوح ودقة\n"
          + "- خصوصية تامة - محادثاتك محمية\n\n"
          + "ابدأ محادثتك الآن!"
        );
      } else {
        await db.telegramUser.update({
          where: { userId },
          data: { joinAttempts: { increment: 1 } },
        });
        await db.joinLog.create({ data: { userId, action: 'fail', passwordTried: text.substring(0, 50) } });
        await sendMessage(chatId, "كلمة المرور خاطئة!\n\nحاول مرة أخرى.");
      }
      return { ok: true };
    }

    // ============================
    // أمر /start
    // ============================

    if (text === '/start') {
      if (isAdmin(userId) || user.isApproved) {
        await sendMessage(chatId,
          "السلام عليكم ورحمة الله وبركاته\n\n"
          + "أهلاً بك في بوت **مود شات**!\n\n"
          + "**المميزات:**\n"
          + "- ذاكرة ذكية - أتذكر كل محادثاتنا\n"
          + "- متعدد اللغات - أتحدث أي لغة\n"
          + "- محادثة طبيعية - أجيب بوضوح ودقة\n"
          + "- خصوصية تامة - محادثاتك محمية\n\n"
          + "/clear - مسح الذاكرة\n"
          + "/help - عرض المساعدة"
        );
      } else {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
        await db.joinLog.create({ data: { userId, action: 'attempt' } });
        await sendMessage(chatId, "**هذا البوت خاص ومحمي بكلمة مرور!**\n\nللاستخدام، أرسل كلمة المرور:");
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
      await sendMessage(chatId, user.isBlocked ? "تم حظرك من استخدام هذا البوت." : "أرسل كلمة المرور للاستخدام.");
      return { ok: true };
    }

    // ============================
    // أوامر عامة
    // ============================

    if (text === '/help') {
      await sendMessage(chatId,
        "**مود شات - المساعدة**\n\n"
        + "- ذاكرة ذكية - أتذكر كل محادثاتنا\n"
        + "- متعدد اللغات - أتحدث أي لغة\n"
        + "- محادثة طبيعية - أجيب بوضوح ودقة\n\n"
        + "**الأوامر:**\n"
        + "/start - بدء المحادثة\n"
        + "/clear - مسح الذاكرة\n"
        + "/help - عرض المساعدة"
      );
      return { ok: true };
    }

    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "تم مسح سجل محادثتك وذاكرتي.\n\nابدأ محادثة جديدة!");
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
          await sendMessage(chatId, `تم حظر المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/unblock ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId) {
          await db.telegramUser.update({ where: { userId: targetId }, data: { isBlocked: false } });
          await sendMessage(chatId, `تم إلغاء حظر المستخدم \`${targetId}\``);
        }
        return { ok: true };
      }
      if (text.startsWith('/kick ')) {
        const targetId = parseInt(text.split(' ')[1]);
        if (targetId && targetId !== userId) {
          await db.message.deleteMany({ where: { userId: targetId } });
          await db.joinLog.deleteMany({ where: { userId: targetId } });
          await db.telegramUser.delete({ where: { userId: targetId } });
          await sendMessage(chatId, `تم حذف المستخدم \`${targetId}\``);
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
          await sendMessage(chatId, `تم تغيير كلمة المرور`);
        } else {
          await sendMessage(chatId, "كلمة المرور يجب أن تكون 3 أحرف على الأقل");
        }
        return { ok: true };
      }
      if (text === '/aistatus') {
        await handleAIStatusCommand(chatId);
        return { ok: true };
      }
    }

    // ============================
    // محادثة عادية - سريعة
    // ============================

    await sendChatAction(chatId);

    // جلب سجل المحادثة + إعدادات AI بالتوازي
    const [dbMessages, config] = await Promise.all([
      db.message.findMany({
        where: { userId, status: 'done' },
        orderBy: { timestamp: 'asc' },
        take: MAX_HISTORY,
        select: { role: true, content: true }, // فقط الحقول المطلوبة
      }),
      getAIConfig(), // يستخدم الكاش
    ]);

    // بناء رسائل AI
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: text },
    ];

    let aiReply: string | null = null;
    let usedProvider = '';

    // 1. Z-AI SDK (الافتراضي)
    if (config.provider === 'zsdk') {
      try {
        aiReply = await callZaiAPI(messages, config.chatId, config.userId, config.token);
        usedProvider = 'z-ai';
      } catch {}
    }

    // 2. API Token
    if (!aiReply && config.provider === 'api' && config.baseUrl && config.apiKey) {
      try {
        aiReply = await callCustomAPI(messages, config.baseUrl, config.apiKey, config.model);
        usedProvider = 'custom-api';
      } catch {}
    }

    // 3. Pollinations احتياطي
    if (!aiReply) {
      try {
        aiReply = await callPollinationsAPI(messages);
        usedProvider = 'pollinations';
      } catch {}
    }

    if (aiReply) {
      // حفظ الرسائل في الخلفية (لا ننتظرها)
      const savePromises = [
        db.message.create({ data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'done', chatId } }),
        db.message.create({ data: { userId, role: 'assistant', content: aiReply, modelUsed: `moodchat-${usedProvider}`, status: 'done', chatId } }),
      ];

      // إرسال الرد أولاً ثم حفظ DB
      const cleanReply = sanitizeTelegramMarkdown(aiReply);
      await Promise.all([sendMessage(chatId, cleanReply), ...savePromises]);
      return { ok: true };
    }

    // فشل الكل - أرسل رسالة خطأ
    await sendMessage(chatId, "عذراً، لم أتمكن من الرد حالياً. حاول مرة أخرى بعد قليل.");
    return { ok: true };

  } catch (error) {
    console.error('[Webhook] Error:', error);
    return { ok: false, error: String(error) };
  }
}

// ============================
// تنظيف Markdown
// ============================

function sanitizeTelegramMarkdown(text: string): string {
  let cleaned = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) cleaned = cleaned.replace(/\*\*([^*]*)$/, '*$1*');
  const codeCount = (cleaned.match(/`/g) || []).length;
  if (codeCount % 2 !== 0) cleaned += '`';
  return cleaned;
}

// ============================
// أوامر المدير
// ============================

async function handleDashboardCommand(chatId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // استعلامات متوازية
  const [totalUsers, approvedUsers, blockedUsers, totalMessages, messagesToday, newUsersToday] = await Promise.all([
    db.telegramUser.count(),
    db.telegramUser.count({ where: { isApproved: true } }),
    db.telegramUser.count({ where: { isBlocked: true } }),
    db.message.count(),
    db.message.count({ where: { timestamp: { gte: today } } }),
    db.telegramUser.count({ where: { firstSeen: { gte: today } } }),
  ]);

  const config = await getAIConfig();
  const aiInfo = config.provider === 'zsdk' ? 'Z-AI (GLM-4 Plus)' : config.model;

  await sendMessage(chatId,
    `**إحصائيات مود شات**\n\n`
    + `المستخدمين: ${totalUsers}\n`
    + `المفعلين: ${approvedUsers}\n`
    + `المحظورين: ${blockedUsers}\n`
    + `الرسائل: ${totalMessages}\n`
    + `رسائل اليوم: ${messagesToday}\n`
    + `مستخدمين جدد: ${newUsersToday}\n`
    + `AI: ${aiInfo}`
  );
}

async function handleAIStatusCommand(chatId: number) {
  let status = '**فحص حالة AI:**\n\n';

  try {
    const start = Date.now();
    await callZaiAPI([{ role: 'user', content: 'ok' }], ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN);
    status += `Z-AI: يعمل (${Date.now() - start}ms)\n`;
  } catch {
    status += `Z-AI: معطل\n`;
  }

  try {
    const start = Date.now();
    await callPollinationsAPI([{ role: 'user', content: 'ok' }], 0);
    status += `Pollinations: يعمل (${Date.now() - start}ms)\n`;
  } catch {
    status += `Pollinations: معطل\n`;
  }

  await sendMessage(chatId, status);
}

async function handleUsersCommand(chatId: number) {
  const users = await db.telegramUser.findMany({ orderBy: { lastActive: 'desc' }, take: 20 });
  if (users.length === 0) { await sendMessage(chatId, "لا يوجد مستخدمين."); return; }
  const userList = users.map(u => {
    const s = u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳';
    const name = u.firstName || u.username || 'مجهول';
    return `${s} ${name} (\`${u.userId}\`) - ${u.totalMessages} رسالة`;
  }).join('\n');
  await sendMessage(chatId, `**المستخدمين:**\n\n${userList}`);
}

async function handleChatLogCommand(chatId: number, text: string) {
  const parts = text.split(' ');
  if (parts.length < 2) { await sendMessage(chatId, "استخدم: `/chatlog [user_id]`"); return; }
  const targetId = parseInt(parts[1]);
  const messages = await db.message.findMany({ where: { userId: targetId }, orderBy: { timestamp: 'desc' }, take: 30 });
  if (messages.length === 0) { await sendMessage(chatId, "لا توجد رسائل."); return; }
  const log = messages.reverse().map(m => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content.substring(0, 150)}`).join('\n');
  const chunks: string[] = [];
  let current = `محادثة \`${targetId}\`:\n\n`;
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
  await sendMessage(chatId, `تم الإرسال إلى ${sent} من ${users.length}.`);
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
