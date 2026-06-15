/**
 * Telegram Bot Library - MoodChat (مود شات) - يعمل بالكامل على Vercel
 * 
 * النظام:
 * 1. Webhook يستلم الرسالة ويعالجها بالكامل على Vercel
 * 2. المزود الرئيسي: Pollinations.ai (مجاني، يعمل من Vercel)
 * 3. المزود الاحتياطي: نظام رد ذكي مدمج
 * 4. دائماً يرد - لا رسائل تضيع أبداً
 */

import { db } from './db';

// ============================
// الإعدادات
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. مهم: لا تبدأ كل رد بالسلام، فقط أجب مباشرة على سؤال المستخدم. السلام فقط في رسالة الترحيب الأولى.";

// كاش ذاكري لإعدادات AI
let aiConfigCache: { provider: string; baseUrl: string; apiKey: string; model: string; chatId?: string; userId?: string; token?: string; } | null = null;
let aiConfigCacheTime = 0;

async function getAIConfig() {
  if (aiConfigCache && Date.now() - aiConfigCacheTime < 300000) return aiConfigCache;
  try {
    const configs = await db.botConfig.findMany({
      where: { key: { in: ['ai_provider', 'api_base_url', 'api_key', 'api_model', 'zai_chat_id', 'zai_user_id', 'zai_token'] } }
    });
    const m = Object.fromEntries(configs.map(c => [c.key, c.value]));
    const provider = m.ai_provider || 'zsdk';
    if (provider === 'api' && m.api_base_url && m.api_key) {
      aiConfigCache = { provider: 'api', baseUrl: m.api_base_url, apiKey: m.api_key, model: m.api_model || 'gpt-4' };
    } else {
      aiConfigCache = { provider: 'zsdk', baseUrl: '', apiKey: '', model: 'glm-4-plus' };
    }
  } catch {
    aiConfigCache = { provider: 'zsdk', baseUrl: '', apiKey: '', model: 'glm-4-plus' };
  }
  aiConfigCacheTime = Date.now();
  return aiConfigCache!;
}

export function clearAIConfigCache() { aiConfigCache = null; aiConfigCacheTime = 0; }

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
// AI Providers - نظام متعدد الطبقات
// ============================

/**
 * المزود 1: Pollinations.ai - مجاني ويعمل من Vercel
 * يستخدم عدة محاولات مع تأخير متزايد
 */
async function callPollinationsAPI(
  messages: Array<{ role: string; content: string }>,
  retries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      // تأخير متزايد بين المحاولات
      await sleep(1000 * attempt + Math.random() * 500);
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);

    try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'openai',
          messages,
          temperature: 0.7,
          seed: Math.floor(Math.random() * 100000),
        }),
      });

      if (response.status === 429) {
        console.log(`[AI] Pollinations rate limited (attempt ${attempt + 1}/${retries})`);
        continue; // حاول مرة أخرى
      }

      if (!response.ok) throw new Error(`Pollinations ${response.status}`);

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
      throw new Error('Empty Pollinations response');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log(`[AI] Pollinations timeout (attempt ${attempt + 1}/${retries})`);
        continue;
      }
      if (attempt === retries - 1) throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error('Pollinations failed after all retries');
}

/**
 * المزود 2: Pollinations GET endpoint (طريقة بديلة)
 */
async function callPollinationsGetAPI(
  prompt: string
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);

  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const response = await fetch(
      `https://text.pollinations.ai/${encodedPrompt}?model=openai&seed=${Math.floor(Math.random() * 100000)}`,
      { signal: ctrl.signal }
    );

    if (!response.ok) throw new Error(`Pollinations GET ${response.status}`);
    const text = await response.text();
    if (text?.trim()) return text.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(t);
  }
}

/**
 * المزود 3: Custom API (إذا تم تكوينه من لوحة التحكم)
 */
async function callCustomAPI(
  messages: Array<{ role: string; content: string }>,
  config: { baseUrl: string; apiKey: string; model: string }
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    if (!response.ok) throw new Error(`Custom API ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Custom API response');
  } finally {
    clearTimeout(t);
  }
}

/**
 * دالة موحدة لاستدعاء AI مع نظام احتياطي متعدد الطبقات
 * دائماً تُرجع رداً - لا تفشل أبداً
 */
async function getAIResponse(
  messages: Array<{ role: string; content: string }>,
  config: { provider: string; chatId?: string; userId?: string; token?: string; baseUrl?: string; apiKey?: string; model?: string }
): Promise<{ reply: string; provider: string }> {
  const errors: string[] = [];

  // الطبقة 1: Pollinations.ai (POST)
  try {
    console.log('[AI] Trying Pollinations POST...');
    const reply = await callPollinationsAPI(messages);
    console.log('[AI] Pollinations POST succeeded');
    return { reply, provider: 'pollinations' };
  } catch (err: any) {
    errors.push(`Pollinations POST: ${err?.message || 'failed'}`);
    console.log(`[AI] Pollinations POST failed: ${err?.message}`);
  }

  // الطبقة 2: Pollinations.ai (GET - طريقة بديلة)
  try {
    console.log('[AI] Trying Pollinations GET...');
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || 'مرحبا';
    const reply = await callPollinationsGetAPI(lastUserMsg);
    console.log('[AI] Pollinations GET succeeded');
    return { reply, provider: 'pollinations-get' };
  } catch (err: any) {
    errors.push(`Pollinations GET: ${err?.message || 'failed'}`);
    console.log(`[AI] Pollinations GET failed: ${err?.message}`);
  }

  // الطبقة 3: Custom API (إذا تم تكوينه)
  if (config.provider === 'api' && config.baseUrl && config.apiKey) {
    try {
      console.log('[AI] Trying Custom API...');
      const reply = await callCustomAPI(messages, { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model || 'gpt-4' });
      console.log('[AI] Custom API succeeded');
      return { reply, provider: 'custom-api' };
    } catch (err: any) {
      errors.push(`Custom API: ${err?.message || 'failed'}`);
      console.log(`[AI] Custom API failed: ${err?.message}`);
    }
  }

  // الطبقة الأخيرة: رد ذكي مدمج (لا يفشل أبداً)
  console.log('[AI] All providers failed, using smart fallback');
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const fallbackReply = generateSmartFallback(lastUserMsg);
  return { reply: fallbackReply, provider: 'fallback' };
}

/**
 * نظام رد ذكي مدمج - يولد ردوداً مناسبة عندما تفشل جميع مزودي AI
 */
function generateSmartFallback(userMessage: string): string {
  const msg = userMessage.toLowerCase().trim();

  // ردود للتحيات
  if (/^(مرحبا|سلام|هلا|اهلا|السلام|أهلا|مرحباً|هاي|صباح|مساء)/.test(msg)) {
    return "وعليكم السلام ورحمة الله وبركاته!\n\nأهلاً وسهلاً بك في مود شات. كيف يمكنني مساعدتك اليوم؟";
  }

  // ردود للأسئلة عن الحالة
  if (/^(كيف|شلون|شخبار|عامل|كيفك)/.test(msg)) {
    return "الحمد لله بخير! كيف حالك أنت؟ أتمنى أن تكون بخير وعافية.";
  }

  // ردود للشكر
  if (/^(شكرا|شكراً|مشكور|تسلم|الله يجزاك)/.test(msg)) {
    return "العفو! لا شكر على واجب. أنا هنا لمساعدتك دائماً.";
  }

  // ردود لمن أنت
  if (/^(من أنت|مين أنت|اسمك|عرف نفسك)/.test(msg)) {
    return "أنا مود شات، مساعدك الذكي! يمكنني مساعدتك في الإجابة على أسئلتك والمحادثة بأي لغة تريدها.";
  }

  // ردود للمساعدة
  if (/^(ساعدني|محتاج مساعدة|help|مساعدة)/.test(msg)) {
    return "بالطبع! أنا هنا لمساعدتك. أخبرني بما تحتاج وسأبذل قصارى جهدي لمساعدتك.";
  }

  // رد عام
  return "شكراً لرسالتك! حالياً أواجه ضغطاً على الخوادم، لكن يمكنك المحاولة مرة أخرى بعد قليل وسأرد عليك بشكل أفضل. يمكنك أيضاً استخدام أوامر مثل:\n\n/clear - مسح الذاكرة\n/help - المساعدة";
}

// ============================
// User Management
// ============================

async function getOrCreateUser(u: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean; }) {
  return db.telegramUser.upsert({
    where: { userId: u.id },
    create: { userId: u.id, username: u.username || null, firstName: u.first_name || null, lastName: u.last_name || null, languageCode: u.language_code || null, isBot: u.is_bot || false, totalMessages: 1, isApproved: isAdmin(u.id), approvedAt: isAdmin(u.id) ? new Date() : null },
    update: { username: u.username || null, firstName: u.first_name || null, lastName: u.last_name || null, totalMessages: { increment: 1 } },
  });
}

function isAdmin(userId: number): boolean { return ADMIN_IDS.includes(userId); }

// ============================
// Main Webhook Handler
// ============================

export async function handleTelegramUpdate(update: {
  message?: { message_id: number; from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean; }; chat: { id: number }; text?: string; };
  callback_query?: { id: string; from: { id: number; username?: string; first_name?: string; }; data?: string; message?: { chat: { id: number } }; };
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

    // نظام كلمة المرور
    if (user.waitingForPassword && !isAdmin(userId)) {
      const pw = await getJoinPassword();
      if (text === pw) {
        await db.telegramUser.update({ where: { userId }, data: { isApproved: true, approvedAt: new Date(), waitingForPassword: false } });
        await db.joinLog.create({ data: { userId, action: 'success' } });
        await sendMessage(chatId, "السلام عليكم ورحمة الله وبركاته\n\nأهلاً وسهلاً بك في بوت **مود شات**!\n\n- ذاكرة ذكية - أتذكر كل محادثاتنا\n- متعدد اللغات - أتحدث أي لغة\n- محادثة طبيعية - أجيب بوضوح ودقة\n\nابدأ محادثتك الآن!");
      } else {
        await db.telegramUser.update({ where: { userId }, data: { joinAttempts: { increment: 1 } } });
        await db.joinLog.create({ data: { userId, action: 'fail', passwordTried: text.substring(0, 50) } });
        await sendMessage(chatId, "كلمة المرور خاطئة!\n\nحاول مرة أخرى.");
      }
      return { ok: true };
    }

    // أمر /start
    if (text === '/start') {
      if (isAdmin(userId) || user.isApproved) {
        await sendMessage(chatId, "السلام عليكم ورحمة الله وبركاته\n\nأهلاً بك في بوت **مود شات**!\n\n- ذاكرة ذكية - أتذكر كل محادثاتنا\n- متعدد اللغات - أتحدث أي لغة\n\n/clear - مسح الذاكرة\n/help - المساعدة");
      } else {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
        await db.joinLog.create({ data: { userId, action: 'attempt' } });
        await sendMessage(chatId, "**هذا البوت خاص ومحمي بكلمة مرور!**\n\nأرسل كلمة المرور:");
      }
      return { ok: true };
    }

    // التحقق من الصلاحية
    if (!user.isApproved || user.isBlocked) {
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
      }
      await sendMessage(chatId, user.isBlocked ? "تم حظرك." : "أرسل كلمة المرور.");
      return { ok: true };
    }

    // أوامر عامة
    if (text === '/help') {
      await sendMessage(chatId, "**مود شات - المساعدة**\n\n- ذاكرة ذكية\n- متعدد اللغات\n\n/start - بدء المحادثة\n/clear - مسح الذاكرة\n/help - المساعدة");
      return { ok: true };
    }
    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "تم مسح سجل محادثتك.\n\nابدأ محادثة جديدة!");
      return { ok: true };
    }

    // أوامر المدير
    if (isAdmin(userId)) {
      if (text === '/stats') { await handleDashboardCommand(chatId); return { ok: true }; }
      if (text === '/users') { await handleUsersCommand(chatId); return { ok: true }; }
      if (text.startsWith('/chatlog')) { await handleChatLogCommand(chatId, text); return { ok: true }; }
      if (text === '/aistatus') { await handleAIStatusCommand(chatId); return { ok: true }; }
      if (text.startsWith('/block ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid && tid !== userId) { await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: true, waitingForPassword: false } }); await sendMessage(chatId, `تم حظر \`${tid}\``); }
        return { ok: true };
      }
      if (text.startsWith('/unblock ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid) { await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: false } }); await sendMessage(chatId, `تم إلغاء حظر \`${tid}\``); }
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
        if (np.length >= 3) { await db.botConfig.upsert({ where: { key: 'join_password' }, update: { value: np }, create: { key: 'join_password', value: np } }); await sendMessage(chatId, `تم تغيير كلمة المرور`); }
        else await sendMessage(chatId, "كلمة المرور يجب أن تكون 3 أحرف على الأقل");
        return { ok: true };
      }
    }

    // ============================
    // محادثة عادية - معالجة كاملة
    // ============================

    // إظهار حالة الكتابة
    await sendChatAction(chatId);

    // حفظ رسالة المستخدم
    await db.message.create({
      data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'done', chatId },
    });

    // جلب سجل المحادثة والإعدادات
    const [dbMessages, config] = await Promise.all([
      db.message.findMany({ where: { userId, status: 'done' }, orderBy: { timestamp: 'asc' }, take: MAX_HISTORY, select: { role: true, content: true } }),
      getAIConfig(),
    ]);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // الحصول على رد AI (دائماً ينجح)
    const { reply, provider } = await getAIResponse(messages, config);

    // حفظ رد AI
    await db.message.create({
      data: { userId, role: 'assistant', content: reply, modelUsed: `moodchat-${provider}`, status: 'done', chatId },
    });

    const clean = sanitizeMarkdown(reply);
    await sendMessage(chatId, clean);

    return { ok: true };

  } catch (error) {
    console.error('[Webhook] Error:', error);
    // محاولة إرسال رسالة خطأ حتى في حالة الفشل الكلي
    try {
      if (update.message?.chat?.id) {
        await sendMessage(update.message.chat.id, "عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
      }
    } catch {}
    return { ok: false, error: String(error) };
  }
}

// ============================
// أوامر المدير - حالة AI
// ============================

async function handleAIStatusCommand(chatId: number) {
  let status = "**حالة مزودي AI:**\n\n";

  // اختبار Pollinations POST
  try {
    const start = Date.now();
    await callPollinationsAPI([{ role: 'user', content: 'مرحبا' }], 1);
    const ms = Date.now() - start;
    status += `Pollinations POST: يعمل (${ms}ms)\n`;
  } catch (err: any) {
    status += `Pollinations POST: غير متاح\n`;
  }

  // اختبار Pollinations GET
  try {
    const start = Date.now();
    await callPollinationsGetAPI('مرحبا');
    const ms = Date.now() - start;
    status += `Pollinations GET: يعمل (${ms}ms)\n`;
  } catch (err: any) {
    status += `Pollinations GET: غير متاح\n`;
  }

  const config = await getAIConfig();
  if (config.provider === 'api') {
    try {
      const start = Date.now();
      await callCustomAPI([{ role: 'user', content: 'مرحبا' }], { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
      const ms = Date.now() - start;
      status += `Custom API: يعمل (${ms}ms)\n`;
    } catch {
      status += `Custom API: غير متاح\n`;
    }
  }

  status += `\nالنظام: Pollinations + رد ذكي احتياطي`;
  await sendMessage(chatId, status);
}

// ============================
// مساعدات
// ============================

function sanitizeMarkdown(text: string): string {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  c = c.replace(/~~/g, '');
  c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return c;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleDashboardCommand(chatId: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [tu, au, bu, tm, mt, nu] = await Promise.all([
    db.telegramUser.count(), db.telegramUser.count({ where: { isApproved: true } }),
    db.telegramUser.count({ where: { isBlocked: true } }), db.message.count(),
    db.message.count({ where: { timestamp: { gte: today } } }),
    db.telegramUser.count({ where: { firstSeen: { gte: today } } }),
  ]);
  await sendMessage(chatId, `**إحصائيات مود شات**\n\nالمستخدمين: ${tu}\nالمفعلين: ${au}\nالمحظورين: ${bu}\nالرسائل: ${tm}\nرسائل اليوم: ${mt}\nمستخدمين جدد: ${nu}`);
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
