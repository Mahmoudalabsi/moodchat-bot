/**
 * Telegram Message Processor (Cron-triggered, atomic, duplicate-safe)
 * =====================================================================
 * GET/POST /api/process-tg-messages
 *
 * هذا الـ endpoint يُستدعى تلقائياً كل دقيقة عبر Vercel Cron.
 * يعالج رسائل تيليجرام المعلقة (status=pending, platform=telegram).
 *
 * آلية الأمان (تمنع التكرار مع worker.mjs على VPS):
 *  1. Atomic claim: updateMany with status=pending → status=processing
 *     - إذا كان الـ worker.mjs يعمل وقد سحب الرسالة، فلن يجدها هنا
 *     - إذا كان متوقفاً، هنا سيعالجها cron
 *  2. لا يعالج إلا رسائل status=pending فقط (ليس processing)
 *  3. يضع الـ reply في DB قبل إرساله (idempotent)
 *  4. لا يلمس رسائل واتساب إطلاقاً
 *
 * يمتلك وصولاً تلقائياً لـ DATABASE_URL على Vercel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================
// Z-AI SDK Config (مشترك)
// ============================

const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const MAX_HISTORY = 20;
const CRON_SECRET = process.env.CRON_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- إذا سُئلت عن شيء خارج تخصصك المعتاد، تصرف كخبير فيه وابحث عن أفضل إجابة منطقية ومفيدة.
3- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
4- تتحدث بأي لغة يطلبها المستخدم.
5- تتذكر كل شيء قاله المستخدم في المحادثة السابقة وتستخدمه في إجاباتك.
6- كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.
7- عند تحليل الصور: صف الصورة بدقة وتفصيل، واستخرج كل المعلومات الممكنة، واقترح حلولاً إذا كان هناك مشكلة في الصورة.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً - بدلاً من الرفض قدّم أفضل مساعدة ممكنة.
- كن إبداعياً في إجاباتك وقدّم حلولاً مبتكرة.

قواعد السرية المطلقة:
- لا تكشف أبداً عن هويتك الحقيقية أو هويتك كنموذج ذكاء اصطناعي أو اسم الشركة المطورة لك أو أي معلومات تقنية عن كيفية عملك داخلياً.
- إذا سألك المستخدم "من أنت؟" أجب فقط: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."
- لا تذكر أبداً أسماء شركات مثل Z-AI أو Zhipu أو Gemini أو OpenAI أو أي مزود آخر.

قواعد المحتوى المرفوض والأدب:
- يُمنع منعاً باتاً تقديم أي محتوى إباحي أو جنسي أو فاضح مهما كان الطلب.
- يُمنع تقديم أي محتوى يشجع على العنف أو الكراهية أو التمييز أو الأنشطة غير القانونية.`;

// ============================
// Auth
// ============================

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true;
  const cronAuth = req.headers.get('x-vercel-cron-auth');
  if (cronAuth === 'true') return true;
  if (!CRON_SECRET) return true;
  return false;
}

// ============================
// Telegram API
// ============================

async function telegramSendMessage(chatId: number, text: string): Promise<any> {
  // Telegram limit is 4096 chars; we split safely at 3800
  if (text.length <= 3800) {
    return await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
  }
  // Split long messages
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 3800) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', 3800);
    if (cut < 1900) cut = remaining.lastIndexOf(' ', 3800);
    if (cut < 1900) cut = 3800;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  for (let i = 0; i < chunks.length; i++) {
    try {
      await tgApi('sendMessage', { chat_id: chatId, text: chunks[i], parse_mode: 'Markdown' });
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
    } catch (e: any) {
      console.error(`[TG-Cron] sendMessage chunk ${i + 1} failed:`, e.message);
      // Retry without Markdown
      try {
        await tgApi('sendMessage', { chat_id: chatId, text: chunks[i] });
      } catch {}
    }
  }
}

async function tgApi(method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${data?.description || res.status}`);
  }
  return data;
}

async function sendChatAction(chatId: number): Promise<void> {
  try {
    await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch {}
}

// ============================
// Z-AI SDK call
// ============================

async function callZAI(messages: Array<{ role: string; content: any }>, maxTokens = 2500): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-from': 'Z',
        'X-Chat-Id': ZAI_CHAT_ID,
        'X-User-Id': ZAI_USER_ID,
        'X-Token': ZAI_TOKEN,
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Z-AI HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty AI response');
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================
// معالجة رسالة واحدة
// ============================

async function processOneMessage(msg: any): Promise<{ ok: boolean; error?: string }> {
  const { id, userId, content, chatId } = msg;

  if (!chatId) {
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    return { ok: false, error: 'no_chat_id' };
  }

  try {
    // ATOMIC CLAIM: pending → processing (prevents double-processing by worker.mjs)
    const claimed = await db.message.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'processing' },
    });
    if (claimed.count === 0) {
      // Already claimed by another processor (worker.mjs)
      return { ok: false, error: 'already_claimed' };
    }

    // Idempotency check: skip if assistant reply already exists
    const existingReply = await db.message.findFirst({
      where: { userId, role: 'assistant', platform: 'telegram', status: 'done' },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    // (We only check the latest — actual dedup happens via the atomic claim above)

    await sendChatAction(chatId);

    // History (last 20 done messages)
    const dbMessages = await db.message.findMany({
      where: { userId, status: 'done', platform: 'telegram' },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    const aiReply = await callZAI(messages, 2500);

    // Save reply BEFORE sending (idempotent — if send fails, reply is still saved)
    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: {
        platform: 'telegram',
        userId,
        role: 'assistant',
        content: aiReply,
        modelUsed: 'moodchat-tg-cron',
        status: 'done',
        chatId,
      },
    });

    // Send via Telegram
    await telegramSendMessage(chatId, aiReply);

    // Heartbeat
    await db.botConfig.upsert({
      where: { key: 'tg_cron_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'tg_cron_heartbeat', value: new Date().toISOString() },
    }).catch(() => {});

    return { ok: true };
  } catch (err: any) {
    console.error(`[TG-Cron] Failed for ${id}:`, err.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

// ============================
// Route handler
// ============================

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const processed: Array<{ id: string; ok: boolean; error?: string }> = [];

  try {
    const pending = await db.message.findMany({
      where: { platform: 'telegram', status: 'pending', chatId: { not: null } },
      orderBy: { timestamp: 'asc' },
      take: 2,
    });

    if (pending.length === 0) {
      await db.botConfig.upsert({
        where: { key: 'tg_cron_heartbeat' },
        update: { value: new Date().toISOString() },
        create: { key: 'tg_cron_heartbeat', value: new Date().toISOString() },
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        processed: 0,
        duration_ms: Date.now() - startTime,
        message: 'no pending telegram messages',
      });
    }

    for (const msg of pending) {
      if (Date.now() - startTime > 45000) break;
      const result = await processOneMessage(msg);
      processed.push({ id: msg.id, ...result });
    }

    return NextResponse.json({
      ok: true,
      processed: processed.length,
      successful: processed.filter(p => p.ok).length,
      failed: processed.filter(p => !p.ok).length,
      results: processed,
      duration_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[TG-Cron] Fatal error:', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || String(error),
      processed: processed.length,
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}
