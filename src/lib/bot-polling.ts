/**
 * MoodChat Bot - Local Polling Script
 * يعمل على بيئة Z.ai مع وصول كامل لـ internal-api.z.ai
 * 
 * يستخدم وضع polling (getUpdates) لاستقبال الرسائل
 * يعالج الرسائل باستخدام Z-AI API (سريع وموثوق)
 * يعمل 24/7 طالما العملية تعمل
 */

// تحميل متغيرات البيئة أولاً - يجب أن يكون قبل أي import آخر
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
// تحميل .env مع override لأن النظام يضع DATABASE_URL افتراضي خاطئ
dotenvConfig({ path: '/home/z/my-project/.env', override: true });

// التأكد من أن DATABASE_URL صحيح
if (!process.env.DATABASE_URL?.startsWith('postgresql://')) {
  console.error('[ERROR] DATABASE_URL is not set correctly! Current:', process.env.DATABASE_URL?.substring(0, 20));
  process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
}

import { db } from './db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 20;
const POLL_INTERVAL = 2000; // 2 ثانية
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي ومحترم. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. قواعد صارمة: 1- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال. 2- لا تكرر التحيات في كل رسالة. 3- أجب مباشرة وبشكل طبيعي دون مقدمات.";

let lastUpdateId = 0;
let isProcessing = false;

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

async function sendMessage(chatId: number, text: string, extra?: Record<string, unknown>) {
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function sendChatAction(chatId: number) {
  return telegramAPI('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ============================
// Z-AI API (Internal - سريع وموثوق من Z.ai)
// ============================

async function callZaiAPI(
  messages: Array<{ role: string; content: string }>,
  chatId?: string, userId?: string, token?: string
): Promise<string> {
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
    body: JSON.stringify({
      messages,
      temperature: 0.7,
      max_tokens: 800,
      thinking: { type: 'disabled' },
    }),
  });

  if (response.status === 429) {
    console.log('[Z-AI] Rate limited, waiting 3 seconds...');
    await sleep(3000);
    throw new Error('Rate limited');
  }

  if (!response.ok) throw new Error(`Z-AI ${response.status}`);
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (reply?.trim()) return reply.trim();
  throw new Error('Empty response');
}

async function getAIResponseWithRetry(
  messages: Array<{ role: string; content: string }>,
  retries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await callZaiAPI(messages, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN);
    } catch (err: any) {
      console.log(`[AI] Attempt ${attempt + 1}/${retries} failed: ${err?.message}`);
      if (attempt < retries - 1) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  // فشل كل المحاولات - رد احتياطي
  return "عذراً، أواجه ضغطاً على الخوادم حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
}

// ============================
// User Management
// ============================

async function getOrCreateUser(u: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean; }) {
  return db.telegramUser.upsert({
    where: { userId: u.id },
    create: {
      userId: u.id, username: u.username || null, firstName: u.first_name || null,
      lastName: u.last_name || null, languageCode: u.language_code || null,
      isBot: u.is_bot || false, totalMessages: 1, isApproved: isAdmin(u.id),
      approvedAt: isAdmin(u.id) ? new Date() : null,
    },
    update: {
      username: u.username || null, firstName: u.first_name || null,
      lastName: u.last_name || null, totalMessages: { increment: 1 },
    },
  });
}

function isAdmin(userId: number): boolean { return ADMIN_IDS.includes(userId); }

// ============================
// Message Processing
// ============================

async function processMessage(update: any) {
  try {
    const message = update.message;
    if (!message?.from || !message?.text) return;

    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const user = await getOrCreateUser(message.from);

    console.log(`[Bot] Message from ${user.firstName || userId}: ${text.substring(0, 50)}`);

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
      return;
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
      return;
    }

    // التحقق من الصلاحية
    if (!user.isApproved || user.isBlocked) {
      if (!user.isApproved && !user.waitingForPassword) {
        await db.telegramUser.update({ where: { userId }, data: { waitingForPassword: true } });
      }
      await sendMessage(chatId, user.isBlocked ? "تم حظرك." : "أرسل كلمة المرور.");
      return;
    }

    // أوامر عامة
    if (text === '/help') {
      await sendMessage(chatId, "**مود شات - المساعدة**\n\n- ذاكرة ذكية\n- متعدد اللغات\n\n/start - بدء المحادثة\n/clear - مسح الذاكرة\n/help - المساعدة");
      return;
    }
    if (text === '/clear') {
      await db.message.deleteMany({ where: { userId } });
      await sendMessage(chatId, "تم مسح سجل محادثتك.\n\nابدأ محادثة جديدة!");
      return;
    }

    // أوامر المدير
    if (isAdmin(userId)) {
      if (text === '/stats') { await handleStatsCommand(chatId); return; }
      if (text === '/users') { await handleUsersCommand(chatId); return; }
      if (text === '/ping') { await sendMessage(chatId, "البوت يعمل! ✅"); return; }
      if (text.startsWith('/block ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid && tid !== userId) {
          await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: true, waitingForPassword: false } });
          await sendMessage(chatId, `تم حظر \`${tid}\``);
        }
        return;
      }
      if (text.startsWith('/unblock ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid) {
          await db.telegramUser.update({ where: { userId: tid }, data: { isBlocked: false } });
          await sendMessage(chatId, `تم إلغاء حظر \`${tid}\``);
        }
        return;
      }
      if (text.startsWith('/kick ')) {
        const tid = parseInt(text.split(' ')[1]);
        if (tid && tid !== userId) {
          await db.message.deleteMany({ where: { userId: tid } });
          await db.joinLog.deleteMany({ where: { userId: tid } });
          await db.telegramUser.delete({ where: { userId: tid } });
          await sendMessage(chatId, `تم حذف \`${tid}\``);
        }
        return;
      }
      if (text.startsWith('/broadcast ')) {
        const users = await db.telegramUser.findMany({ where: { isApproved: true, isBlocked: false } });
        let sent = 0;
        for (const u of users) { try { await sendMessage(u.userId, `${text.replace('/broadcast ', '')}`); sent++; } catch {} }
        await sendMessage(chatId, `تم الإرسال إلى ${sent} من ${users.length}.`);
        return;
      }
      if (text.startsWith('/setpass ')) {
        const np = text.replace('/setpass ', '').trim();
        if (np.length >= 3) {
          await db.botConfig.upsert({ where: { key: 'join_password' }, update: { value: np }, create: { key: 'join_password', value: np } });
          await sendMessage(chatId, `تم تغيير كلمة المرور`);
        } else await sendMessage(chatId, "كلمة المرور يجب أن تكون 3 أحرف على الأقل");
        return;
      }
    }

    // ============================
    // محادثة عادية - معالجة بالـ Z-AI
    // ============================

    await sendChatAction(chatId);

    // حفظ رسالة المستخدم
    await db.message.create({
      data: { userId, role: 'user', content: text, modelUsed: 'moodchat', status: 'done', chatId },
    });

    // جلب سجل المحادثة
    const dbMessages = await db.message.findMany({
      where: { userId, status: 'done' },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // الحصول على رد AI
    const aiReply = await getAIResponseWithRetry(messages);

    // حفظ رد AI
    await db.message.create({
      data: { userId, role: 'assistant', content: aiReply, modelUsed: 'moodchat-z-ai', status: 'done', chatId },
    });

    const clean = sanitizeMarkdown(aiReply);
    await sendMessage(chatId, clean);
    console.log(`[Bot] Replied to ${userId}: ${aiReply.substring(0, 50)}...`);

  } catch (error) {
    console.error('[Bot] Error processing message:', error);
  }
}

// ============================
// Helper Functions
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

async function getJoinPassword(): Promise<string> {
  try { const c = await db.botConfig.findUnique({ where: { key: 'join_password' } }); return c?.value || JOIN_PASSWORD; } catch { return JOIN_PASSWORD; }
}

async function handleStatsCommand(chatId: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [tu, au, bu, tm, mt, nu] = await Promise.all([
    db.telegramUser.count(), db.telegramUser.count({ where: { isApproved: true } }),
    db.telegramUser.count({ where: { isBlocked: true } }), db.message.count(),
    db.message.count({ where: { timestamp: { gte: today } } }),
    db.telegramUser.count({ where: { firstSeen: { gte: today } } }),
  ]);
  await sendMessage(chatId, `**إحصائيات مود شات**\n\nالمستخدمين: ${tu}\nالمفعلين: ${au}\nالمحظورين: ${bu}\nالرسائل: ${tm}\nرسائل اليوم: ${mt}\nمستخدمين جدد: ${nu}\nAI: Z-AI (GLM-4 Plus)`);
}

async function handleUsersCommand(chatId: number) {
  const users = await db.telegramUser.findMany({ orderBy: { lastActive: 'desc' }, take: 20 });
  if (!users.length) { await sendMessage(chatId, "لا يوجد مستخدمين."); return; }
  const list = users.map(u => `${u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳'} ${u.firstName || u.username || 'مجهول'} (\`${u.userId}\`) - ${u.totalMessages} رسالة`).join('\n');
  await sendMessage(chatId, `**المستخدمين:**\n\n${list}`);
}

// ============================
// Main Polling Loop
// ============================

async function startPolling() {
  console.log('=================================');
  console.log('🤖 مود شات - البوت يعمل!');
  console.log('=================================');
  console.log(`Bot Token: ${BOT_TOKEN.substring(0, 10)}...`);
  console.log(`Admin IDs: ${ADMIN_IDS.join(', ')}`);
  console.log(`Z-AI: ${ZAI_BASE_URL}`);
  console.log(`Polling interval: ${POLL_INTERVAL}ms`);
  console.log('=================================');

  // حذف الـ webhook أولاً (لا يمكن استخدام polling مع webhook)
  try {
    const webhookResult = await telegramAPI('deleteWebhook', {});
    console.log('[Setup] Webhook deleted:', JSON.stringify(webhookResult));
  } catch (err) {
    console.log('[Setup] Could not delete webhook:', err);
  }

  // انتظار قصير بعد حذف الـ webhook
  await sleep(2000);

  // حلقة الاستقصاء الرئيسية
  while (true) {
    try {
      if (isProcessing) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      isProcessing = true;

      const result = await telegramAPI('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 30, // long polling - الانتظار حتى 30 ثانية
        limit: 10,
        allowed_updates: ['message'],
      });

      if (result.ok && result.result?.length > 0) {
        for (const update of result.result) {
          if (update.update_id >= lastUpdateId) {
            lastUpdateId = update.update_id;
          }
          await processMessage(update);
        }
      }

      isProcessing = false;
    } catch (error) {
      console.error('[Polling] Error:', error);
      isProcessing = false;
      await sleep(5000); // انتظار أطول عند الخطأ
    }
  }
}

// تشغيل البوت
startPolling().catch(console.error);
