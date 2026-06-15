/**
 * Telegram Bot Library - MoodChat (مود شات)
 * 
 * نظام هجين ذكي:
 * - Vercel Webhook: يستقبل الرسائل ويحفظها كـ "pending"
 * - Z.ai Worker: يعالج الرسائل باستخدام Z-AI SDK (الأساسي)
 * - إذا Worker غير متاح: Vercel يعالج مباشرة بـ Gemini/Pollinations
 * - لا ضياع للرسائل أبداً!
 */

import { db } from './db';

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 20;
const WORKER_TIMEOUT = 30000; // 30 ثانية - إذا لم يعالج Worker خلالها، يعالج Vercel

// Z-AI SDK Config
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

// Google Gemini API Config
const GEMINI_CONFIG = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: 'gemini-2.0-flash',
};

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي ومحترم. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. قواعد صارمة: 1- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال. 2- لا تكرر التحيات في كل رسالة. 3- أجب مباشرة وبشكل طبيعي دون مقدمات.";

// كاش ذكري للإعدادات
let aiConfigCache: { provider: string; baseUrl: string; apiKey: string; model: string; } | null = null;
let aiConfigCacheTime = 0;

async function getAIConfig() {
  if (aiConfigCache && Date.now() - aiConfigCacheTime < 300000) return aiConfigCache;
  try {
    const configs = await db.botConfig.findMany({
      where: { key: { in: ['ai_provider', 'api_base_url', 'api_key', 'api_model'] } }
    });
    const m = Object.fromEntries(configs.map(c => [c.key, c.value]));
    const provider = m.ai_provider || 'zsdk';
    if (provider === 'api' && m.api_base_url && m.api_key) {
      aiConfigCache = { provider: 'api', baseUrl: m.api_base_url, apiKey: m.api_key, model: m.api_model || 'gpt-4' };
    } else {
      aiConfigCache = { provider: 'zsdk', baseUrl: ZAI_CONFIG.baseUrl, apiKey: ZAI_CONFIG.apiKey, model: 'glm-4-plus' };
    }
  } catch {
    aiConfigCache = { provider: 'zsdk', baseUrl: ZAI_CONFIG.baseUrl, apiKey: ZAI_CONFIG.apiKey, model: 'glm-4-plus' };
  }
  aiConfigCacheTime = Date.now();
  return aiConfigCache!;
}

export function clearAIConfigCache() { aiConfigCache = null; aiConfigCacheTime = 0; }

// ============================
// فحص حالة الـ Worker
// ============================

async function isWorkerAlive(): Promise<boolean> {
  try {
    const heartbeat = await db.botConfig.findUnique({ where: { key: 'worker_heartbeat' } });
    if (!heartbeat?.value) return false;
    const lastBeat = new Date(heartbeat.value).getTime();
    return (Date.now() - lastBeat) < 120000; // أقل من دقيقتين = Worker شغال
  } catch {
    return false;
  }
}

// ============================
// Telegram API
// ============================

async function telegramAPI(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string, extra?: Record<string, unknown>) {
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function sendChatAction(chatId: number) {
  return telegramAPI('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ============================
// AI Providers (لاستخدام Vercel fallback فقط)
// ============================

async function callZaiSDK(messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAIClass = ZAIModule.default;
    const zai = new ZAIClass(ZAI_CONFIG);
    const completion = await zai.chat.completions.create({
      messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      model: 'glm-4-plus',
      temperature: 0.7,
      max_tokens: 800,
      thinking: { type: 'disabled' },
    });
    const reply = completion?.choices?.[0]?.message?.content;
    if (reply?.trim()) {
      console.log('[AI] Z-AI SDK OK');
      return reply.trim();
    }
    throw new Error('Empty Z-AI response');
  } catch (err: any) {
    throw new Error(`ZAI SDK: ${err?.message?.substring(0, 80)}`);
  }
}

async function callGeminiDirect(messages: Array<{ role: string; content: string }>): Promise<string> {
  let apiKey = GEMINI_CONFIG.apiKey;
  if (!apiKey) {
    try {
      const cfg = await db.botConfig.findUnique({ where: { key: 'gemini_api_key' } });
      apiKey = cfg?.value || '';
    } catch {}
  }
  if (!apiKey) throw new Error('No Gemini API key');

  try {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const systemInstruction = messages.find(m => m.role === 'system');
    const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 800 } };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction.content }] };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify(body) }
    );
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply?.trim()) { console.log('[AI] Gemini OK'); return reply.trim(); }
    throw new Error('Empty Gemini');
  } catch (err: any) {
    throw new Error(`Gemini: ${err?.message?.substring(0, 60)}`);
  }
}

async function callPollinationsOpenAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  for (const model of ['mistral', 'openai', 'llama']) {
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
      if (reply?.trim()) { console.log(`[AI] Pollinations ${model} OK`); return reply.trim(); }
    } catch { continue; }
  }
  throw new Error('Pollinations failed');
}

async function callCustomAPI(messages: Array<{ role: string; content: string }>, config: { baseUrl: string; apiKey: string; model: string }): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model: config.model, messages, temperature: 0.7, max_tokens: 800 }),
  });
  if (!response.ok) throw new Error(`Custom ${response.status}`);
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (reply?.trim()) return reply.trim();
  throw new Error('Empty custom');
}

// Vercel Fallback: يعمل فقط عندما Worker غير متاح
async function getAIResponseFallback(
  messages: Array<{ role: string; content: string }>,
  config: { provider: string; baseUrl?: string; apiKey?: string; model?: string }
): Promise<{ reply: string; provider: string }> {
  const errors: string[] = [];

  // جرب Z-AI SDK أولاً (قد يعمل من Z.ai إذا كان الـ webhook يعالج هناك)
  const providers: Array<{ name: string; fn: () => Promise<string> }> = [
    { name: 'zai-sdk', fn: () => callZaiSDK(messages) },
    { name: 'gemini', fn: () => callGeminiDirect(messages) },
    { name: 'pollinations', fn: () => callPollinationsOpenAI(messages) },
  ];

  if (config.provider === 'api' && config.baseUrl && config.apiKey) {
    providers.push({ name: 'custom-api', fn: () => callCustomAPI(messages, { baseUrl: config.baseUrl!, apiKey: config.apiKey!, model: config.model || 'gpt-4' }) });
  }

  for (const provider of providers) {
    try {
      const reply = await provider.fn();
      return { reply, provider: provider.name };
    } catch (err: any) {
      errors.push(`${provider.name}: ${err?.message?.substring(0, 40)}`);
    }
  }

  console.log('[AI Fallback] All failed:', errors.join(' | '));
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  return { reply: generateSmartFallback(lastUserMsg), provider: 'fallback' };
}

function generateSmartFallback(userMessage: string): string {
  const msg = userMessage.toLowerCase().trim();
  if (/^(مرحبا|سلام|هلا|اهلا|السلام|أهلا|مرحباً|هاي|صباح|مساء)/.test(msg))
    return "وعليكم السلام ورحمة الله وبركاته!\n\nأهلاً وسهلاً بك في مود شات. كيف يمكنني مساعدتك اليوم؟";
  if (/^(كيف|شلون|شخبار|عامل|كيفك)/.test(msg))
    return "الحمد لله بخير! كيف حالك أنت؟ أتمنى أن تكون بخير وعافية.";
  if (/^(شكرا|شكراً|مشكور|تسلم|الله يجزاك)/.test(msg))
    return "العفو! لا شكر على واجب. أنا هنا لمساعدتك دائماً.";
  if (/^(من أنت|مين أنت|اسمك|عرف نفسك)/.test(msg))
    return "أنا مود شات، مساعدك الذكي! يمكنني مساعدتك في الإجابة على أسئلتك والمحادثة بأي لغة تريدها.";
  if (/^(ساعدني|محتاج مساعدة|help|مساعدة)/.test(msg))
    return "بالطبع! أنا هنا لمساعدتك. أخبرني بما تحتاج وسأبذل قصارى جهدي لمساعدتك.";
  return "شكراً لرسالتك! حالياً أواجه ضغطاً على الخوادم، لكن يمكنك المحاولة مرة أخرى بعد قليل.\n\n/clear - مسح الذاكرة\n/help - المساعدة";
}

// ============================
// User Management
// ============================

async function getOrCreateUser(u: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean; }) {
  return db.telegramUser.upsert({
    where: { userId: u.id },
    create: {
      userId: u.id,
      username: u.username || null,
      firstName: u.first_name || null,
      lastName: u.last_name || null,
      languageCode: u.language_code || null,
      isBot: u.is_bot || false,
      totalMessages: 1,
      isApproved: isAdmin(u.id),
      approvedAt: isAdmin(u.id) ? new Date() : null,
      waitingForPassword: !isAdmin(u.id), // المستخدم العادي يحتاج كلمة مرور
    },
    update: { username: u.username || null, firstName: u.first_name || null, lastName: u.last_name || null, totalMessages: { increment: 1 } },
  });
}

function isAdmin(userId: number): boolean { return ADMIN_IDS.includes(userId); }

// ============================
// Main Webhook Handler - نظام هجين ذكي
// ============================

export async function handleTelegramUpdate(update: {
  message?: { message_id: number; from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean; }; chat: { id: number }; text?: string; };
  callback_query?: { id: string; from: { id: number; username?: string; first_name?: string; }; data?: string; message?: { chat: { id: number } }; };
}) {
  try {
    // رد على الأزرار التفاعلية
    if (update.callback_query) {
      await telegramAPI('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      return { ok: true };
    }

    const message = update.message;
    if (!message?.from || !message?.text) return { ok: true };

    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const isAdm = isAdmin(userId);

    // إنشاء أو تحديث المستخدم
    const user = await getOrCreateUser(message.from);
    console.log(`[Bot] User ${userId} (${user.firstName}) | approved:${user.isApproved} blocked:${user.isBlocked} waiting:${user.waitingForPassword} admin:${isAdm} | msg: "${text.substring(0, 40)}"`);

    // ==========================================
    // 1) المستخدم المحظور - لا يمكنه فعل أي شيء
    // ==========================================
    if (user.isBlocked) {
      await sendMessage(chatId, "🚫 تم حظرك من استخدام هذا البوت.\nتواصل مع المدير إذا كنت تعتقد أن هذا خطأ.");
      return { ok: true };
    }

    // ==========================================
    // 2) الأدمن - صلاحيات كاملة بدون كلمة مرور
    // ==========================================
    if (isAdm) {
      // التأكد أن الأدمن مفعل دائماً
      if (!user.isApproved) {
        await db.telegramUser.update({ where: { userId }, data: { isApproved: true, approvedAt: new Date(), waitingForPassword: false } });
      }

      if (text === '/start') {
        await sendMessage(chatId, "👑 **أهلاً بك يا مدير!**\n\nبوت **مود شات** جاهز!\n\n🧠 ذاكرة ذكية | 🌍 متعدد اللغات | 🤖 Z-AI (GLM-4 Plus)\n\n**أوامر المدير:**\n/stats - الإحصائيات\n/users - قائمة المستخدمين\n/aistatus - حالة الذكاء الاصطناعي\n/chatlog [id] - سجل محادثة مستخدم\n/block [id] - حظر مستخدم\n/unblock [id] - إلغاء حظر\n/kick [id] - حذف مستخدم\n/broadcast [msg] - إرسال للجميع\n/setpass [pass] - تغيير كلمة المرور\n/workerstatus - حالة الـ Worker\n\n**أوامر عامة:**\n/clear - مسح الذاكرة\n/help - المساعدة");
        return { ok: true };
      }
      if (text === '/help') {
        await sendMessage(chatId, `**🤖 مود شات - المساعدة**\n\n🧠 الذاكرة: آخر ${MAX_HISTORY} رسالة\n🌍 اللغات: أي لغة\n🤖 المحرك: Z-AI (GLM-4 Plus)\n\n**أوامر عامة:** /clear /help /start\n**أوامر المدير:** 👑 /stats /users /aistatus /workerstatus /chatlog /block /unblock /kick /broadcast /setpass`);
        return { ok: true };
      }
      if (text === '/stats') { await handleDashboardCommand(chatId); return { ok: true }; }
      if (text === '/users') { await handleUsersCommand(chatId); return { ok: true }; }
      if (text.startsWith('/chatlog')) { await handleChatLogCommand(chatId, text); return { ok: true }; }
      if (text === '/aistatus') { await handleAIStatusCommand(chatId); return { ok: true }; }
      if (text === '/workerstatus') { await handleWorkerStatusCommand(chatId); return { ok: true }; }
      if (text.startsWith('/block ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid && tid !== userId) { await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: true, waitingForPassword: false } }); await sendMessage(chatId, `تم حظر \`${tid}\``); }
        return { ok: true };
      }
      if (text.startsWith('/unblock ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid) {
          await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: false, isApproved: false, waitingForPassword: true, joinAttempts: 0 } });
          await sendMessage(chatId, `تم إلغاء حظر \`${tid}\` - يجب عليه إدخال كلمة المرور مجدداً`);
        }
        return { ok: true };
      }
      if (text.startsWith('/kick ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid && tid !== userId) { await db.message.deleteMany({ where: { userId: tid } }); await db.joinLog.deleteMany({ where: { userId: tid } }); await db.telegramUser.delete({ where: { userId: tid } }); await sendMessage(chatId, `تم حذف \`${tid}\``); }
        return { ok: true };
      }
      if (text.startsWith('/broadcast ')) {
        const users = await db.telegramUser.findMany({ where: { isApproved: true, isBlocked: false } });
        let sent = 0;
        for (const u of users) { try { await sendMessage(u.userId, `${text.replace('/broadcast ', '')}`); sent++; } catch {} }
        await sendMessage(chatId, `تم الإرسال إلى ${sent} من ${users.length}.`);
        return { ok: true };
      }
      if (text.startsWith('/setpass ')) {
        const np = text.replace('/setpass ', '').trim();
        if (np.length >= 3) { await db.botConfig.upsert({ where: { key: 'join_password' }, update: { value: np }, create: { key: 'join_password', value: np } }); await sendMessage(chatId, `✅ تم تغيير كلمة المرور إلى: \`${np}\``); }
        else await sendMessage(chatId, "كلمة المرور يجب أن تكون 3 أحرف على الأقل");
        return { ok: true };
      }
      // أمر /clear للأدمن أيضاً
      if (text === '/clear') {
        await db.message.deleteMany({ where: { userId } });
        await sendMessage(chatId, "تم مسح سجل محادثتك.");
        return { ok: true };
      }
      // الأدمن يقدر يتكلم مع AI مباشرة
      // (يقع في قسم المحادثة أدناه)
    }

    // ==========================================
    // 3) المستخدم غير المفعل (غير الأدمن) - نظام كلمة المرور
    // ==========================================
    if (!user.isApproved && !isAdm) {
      // أمر /start - اعرض رسالة الترحيب مع طلب كلمة المرور
      if (text === '/start') {
        if (!user.waitingForPassword) {
          await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
        }
        await sendMessage(chatId, "🔒 **هذا البوت خاص ومحمي بكلمة مرور!**\n\nلتفعيل حسابك والمحادثة مع الذكاء الاصطناعي، أرسل كلمة المرور:\n\n_(إذا لم تكن تعرف كلمة المرور، تواصل مع المدير)_");
        return { ok: true };
      }

      // أي أمر ثاني - اطلب كلمة المرور
      if (text.startsWith('/')) {
        await sendMessage(chatId, "🔒 أرسل كلمة المرور أولاً لتفعيل حسابك!");
        return { ok: true };
      }

      // تحقق من كلمة المرور
      const pw = await getJoinPassword();
      if (text === pw) {
        // ✅ كلمة المرور صحيحة - فعّل الحساب
        await db.telegramUser.update({
          where: { userId },
          data: { isApproved: true, approvedAt: new Date(), waitingForPassword: false, joinAttempts: 0 }
        });
        await db.joinLog.create({ data: { userId, action: 'success' } });
        console.log(`[Bot] User ${userId} activated successfully!`);
        await sendMessage(chatId, "✅ **تم تفعيل حسابك بنجاح!**\n\nأهلاً وسهلاً بك في بوت **مود شات**!\n\n🧠 ذاكرة ذكية - أتذكر كل محادثاتنا\n🌍 متعدد اللغات - أتحدث أي لغة\n🤖 يعمل بـ Z-AI (GLM-4 Plus)\n\nابدأ محادثتك الآن! اكتب أي شيء 🎉");
        return { ok: true };
      } else {
        // ❌ كلمة المرور خاطئة
        const newAttempts = (user.joinAttempts || 0) + 1;
        await db.telegramUser.update({
          where: { userId },
          data: { joinAttempts: newAttempts }
        });
        await db.joinLog.create({ data: { userId, action: 'fail', passwordTried: text.substring(0, 50) } });

        if (newAttempts >= 5) {
          // حظر بعد 5 محاولات
          await db.telegramUser.update({
            where: { userId },
            data: { isBlocked: true, waitingForPassword: false }
          });
          console.log(`[Bot] User ${userId} blocked after 5 failed attempts`);
          await sendMessage(chatId, "🚫 تم حظرك بسبب 5 محاولات خاطئة متتالية.\nتواصل مع المدير إذا كنت تعتقد أن هذا خطأ.");
        } else {
          await sendMessage(chatId, `❌ كلمة المرور خاطئة!\n\nالمحاولات المتبقية: ${5 - newAttempts}/5\n\nحاول مرة أخرى:`);
        }
        return { ok: true };
      }
    }

    // ==========================================
    // 4) المستخدم المفعل (غير الأدمن) - أوامر عامة
    // ==========================================
    if (user.isApproved && !isAdm) {
      if (text === '/start') {
        await sendMessage(chatId, "أهلاً بك في بوت **مود شات**! 🎉\n\n🧠 ذاكرة ذكية | 🌍 متعدد اللغات | 🤖 Z-AI (GLM-4 Plus)\n\n/clear - مسح الذاكرة\n/help - المساعدة");
        return { ok: true };
      }
      if (text === '/help') {
        await sendMessage(chatId, `**🤖 مود شات - المساعدة**\n\n🧠 الذاكرة: أتذكر آخر ${MAX_HISTORY} رسالة\n🌍 اللغات: أتحدث أي لغة\n🤖 المحرك: Z-AI (GLM-4 Plus)\n\n**الأوامر:**\n/clear - مسح سجل المحادثة\n/help - المساعدة\n/start - إعادة بدء المحادثة\n\nاكتب أي شيء وسأرد عليك! 🎉`);
        return { ok: true };
      }
      if (text === '/clear') {
        await db.message.deleteMany({ where: { userId } });
        await sendMessage(chatId, "تم مسح سجل محادثتك.\n\nابدأ محادثة جديدة!");
        return { ok: true };
      }
      // المحادثة مع AI تقع في القسم أدناه
    }

    // ==========================================
    // 5) المحادثة مع الذكاء الاصطناعي (المستخدم المفعل + الأدمن)
    // ==========================================
    if ((user.isApproved || isAdm) && !user.isBlocked) {
      await sendChatAction(chatId);
      const workerAlive = await isWorkerAlive();

      if (workerAlive) {
        // ✅ الوضع الهجين: احفظ كـ "pending" والـ Worker سيعالجها بـ Z-AI SDK
        await db.message.create({
          data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'pending', chatId },
        });
        console.log(`[Webhook] Message saved as pending (worker alive). User: ${userId}`);
        return { ok: true, mode: 'hybrid-pending' };
      }

      // ❌ Worker غير متاح: عالج مباشرة باستخدام AI fallback
      console.log(`[Webhook] Worker offline, processing inline. User: ${userId}`);

      await db.message.create({
        data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'done', chatId },
      });

      const [dbMessages, config] = await Promise.all([
        db.message.findMany({ where: { userId, status: 'done' }, orderBy: { timestamp: 'asc' }, take: MAX_HISTORY, select: { role: true, content: true } }),
        getAIConfig(),
      ]);

      const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const { reply, provider } = await getAIResponseFallback(aiMessages, config);

      await db.message.create({
        data: { userId, role: 'assistant', content: reply, modelUsed: `moodchat-${provider}`, status: 'done', chatId },
      });

      await sendMessage(chatId, sanitizeMarkdown(reply));
      return { ok: true, mode: 'inline-fallback', provider };
    }

    // إذا وصلنا هنا - شيء غير متوقع
    console.log(`[Bot] Unhandled state for user ${userId}: approved=${user.isApproved} blocked=${user.isBlocked} admin=${isAdm}`);
    await sendMessage(chatId, "أرسل /start للبدء.");
    return { ok: true };

  } catch (error) {
    console.error('[Webhook] Error:', error);
    try {
      if (update.message?.chat?.id) {
        await sendMessage(update.message.chat.id, "عذراً، حدث خطأ. حاول مرة أخرى.");
      }
    } catch {}
    return { ok: false, error: String(error) };
  }
}

// ============================
// أوامر المدير
// ============================

async function handleAIStatusCommand(chatId: number) {
  let status = "**حالة مزودي AI:**\n\n";
  const msgs = [{ role: 'user' as const, content: 'say ok' }];

  try { const s = Date.now(); await callZaiSDK(msgs); status += `Z-AI SDK: يعمل (${Date.now()-s}ms)\n`; } catch { status += `Z-AI SDK: غير متاح (يعمل من Z.ai فقط)\n`; }
  try { const s = Date.now(); await callGeminiDirect(msgs); status += `Gemini: يعمل (${Date.now()-s}ms)\n`; } catch { status += `Gemini: غير متاح\n`; }
  try { const s = Date.now(); await callPollinationsOpenAI(msgs); status += `Pollinations: يعمل (${Date.now()-s}ms)\n`; } catch { status += `Pollinations: غير متاح\n`; }

  const workerAlive = await isWorkerAlive();
  status += `\nWorker: ${workerAlive ? 'يعمل ✅ (Z-AI SDK)' : 'متوقف ❌ (fallback mode)'}\nالنظام: Z-AI SDK أساسي + Gemini/Pollinations احتياطي`;
  await sendMessage(chatId, status);
}

async function handleWorkerStatusCommand(chatId: number) {
  let status = "**حالة الـ Worker:**\n\n";
  try {
    const heartbeat = await db.botConfig.findUnique({ where: { key: 'worker_heartbeat' } });
    if (heartbeat?.value) {
      const lastBeat = new Date(heartbeat.value);
      const age = Math.round((Date.now() - lastBeat.getTime()) / 1000);
      status += `آخر نبضة: ${lastBeat.toISOString()}\nمنذ: ${age} ثانية\nالحالة: ${age < 120 ? 'يعمل ✅' : 'متوقف ❌'}`;
    } else {
      status += 'لا توجد نبضة - Worker لم يعمل بعد';
    }
  } catch {
    status += 'خطأ في قراءة الحالة';
  }

  const pendingCount = await db.message.count({ where: { status: 'pending' } });
  status += `\n\nرسائل معلقة: ${pendingCount}`;
  await sendMessage(chatId, status);
}

function sanitizeMarkdown(text: string): string {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  c = c.replace(/~~/g, '');
  c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return c;
}

async function handleDashboardCommand(chatId: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [tu, au, bu, tm, mt, nu, pm] = await Promise.all([
    db.telegramUser.count(), db.telegramUser.count({ where: { isApproved: true } }),
    db.telegramUser.count({ where: { isBlocked: true } }), db.message.count(),
    db.message.count({ where: { timestamp: { gte: today } } }),
    db.telegramUser.count({ where: { firstSeen: { gte: today } } }),
    db.message.count({ where: { status: 'pending' } }),
  ]);
  await sendMessage(chatId, `**إحصائيات مود شات**\n\nالمستخدمين: ${tu}\nالمفعلين: ${au}\nالمحظورين: ${bu}\nالرسائل: ${tm}\nرسائل اليوم: ${mt}\nمستخدمين جدد: ${nu}\nمعلقة: ${pm}`);
}

async function handleUsersCommand(chatId: number) {
  const users = await db.telegramUser.findMany({ orderBy: { lastActive: 'desc' }, take: 20 });
  if (!users.length) { await sendMessage(chatId, "لا يوجد مستخدمين."); return; }
  const list = users.map(u => `${u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳'} ${u.firstName || u.username || 'مجهول'} (\`${u.userId}\`) - ${u.totalMessages} رسالة`).join('\n');
  await sendMessage(chatId, `**المستخدمين:**\n\n${list}`);
}

async function handleChatLogCommand(chatId: number, text: string) {
  const parts = text.split(' ');
  if (parts.length < 2) { await sendMessage(chatId, "استخدم: `/chatlog [user_id]`"); return; }
  const tid = parseInt(parts[1]);
  const msgs = await db.message.findMany({ where: { userId: tid }, orderBy: { timestamp: 'desc' }, take: 30 });
  if (!msgs.length) { await sendMessage(chatId, "لا توجد رسائل."); return; }
  const log = msgs.reverse().map(m => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content.substring(0, 150)}`).join('\n');
  const chunks: string[] = []; let cur = `محادثة \`${tid}\`:\n\n`;
  for (const line of log.split('\n')) { if (cur.length + line.length + 1 > 3800) { chunks.push(cur); cur = ''; } cur += line + '\n'; }
  if (cur) chunks.push(cur);
  for (const chunk of chunks) await sendMessage(chatId, chunk);
}

// ============================
// Webhook Management
// ============================

export async function setWebhook(webhookUrl: string) { return telegramAPI('setWebhook', { url: webhookUrl }); }
export async function getWebhookInfo() { return telegramAPI('getWebhookInfo', {}); }
export async function deleteWebhook() { return telegramAPI('deleteWebhook', {}); }
export async function getJoinPassword(): Promise<string> {
  try { const c = await db.botConfig.findUnique({ where: { key: 'join_password' } }); return c?.value || JOIN_PASSWORD; } catch { return JOIN_PASSWORD; }
}
