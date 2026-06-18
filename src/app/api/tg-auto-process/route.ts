/**
 * Telegram Auto-Processor (Cron-triggered, atomic, VPS-safe)
 * =============================================================
 * GET/POST /api/tg-auto-process
 *
 * هذا الـ endpoint يعمل كـ "VPS worker fallback" — يعالج رسائل
 * تيليجرام المعلقة تلقائياً كل بضع ثوانٍ عندما يكون VPS worker
 * متوقفاً. يتوقف تلقائياً بمجرد عودة VPS worker للعمل.
 *
 * آليات الأمان (يضمن عدم الإضرار ببوت تيليجرام):
 *  1. لا يلمس /api/telegram ولا أي كود أصلي في src/lib/telegram-bot.ts
 *  2. Atomic claim: updateMany with status=pending → status=processing
 *     - إذا كان VPS worker يعمل، لن يجد الرسالة هنا (claim متنافس)
 *     - لا يحدث تكرار أبداً
 *  3. AUTO-STOP: يتوقف فوراً عند اكتشاف أن VPS worker عاد
 *     (heartbeat أقل من 60 ثانية = VPS worker شغّال)
 *  4. يحفظ الـ reply في DB قبل إرساله (idempotent)
 *  5. يُعالج رسالة واحدة فقط لكل استدعاء (للحدود الزمنية)
 *
 * يدعم الإيقاف اليدوي: GET /api/tg-auto-process?stop=1
 * يدعم التشغيل: GET /api/tg-auto-process?start=1
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================
// Z-AI SDK Config (نفس الإعدادات الأصلية)
// ============================

const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const MAX_HISTORY = 20;
const CRON_SECRET = process.env.CRON_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';

// VPS worker heartbeat detection
const VPS_WORKER_HEARTBEAT_KEY = 'worker_heartbeat';
const VPS_WORKER_ALIVE_THRESHOLD_SEC = 60;

// Auto-processor keys
const AUTO_PROC_STOP_KEY = 'tg_auto_proc_stopped';
const AUTO_PROC_HEARTBEAT_KEY = 'tg_auto_proc_heartbeat';

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

async function telegramSendMessage(chatId: number, text: string): Promise<void> {
  if (text.length <= 3800) {
    await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' }).catch(() => {});
    return;
  }
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
    } catch {
      try { await tgApi('sendMessage', { chat_id: chatId, text: chunks[i] }); } catch {}
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
  try { await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }); } catch {}
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
// VPS Worker Detection
// ============================

async function isVpsWorkerAlive(): Promise<boolean> {
  try {
    const hb = await db.botConfig.findUnique({ where: { key: VPS_WORKER_HEARTBEAT_KEY } });
    if (!hb?.value) return false;
    const lastTime = new Date(hb.value).getTime();
    const now = Date.now();
    const diffSec = (now - lastTime) / 1000;
    return diffSec < VPS_WORKER_ALIVE_THRESHOLD_SEC;
  } catch {
    return false;
  }
}

async function isAutoProcStopped(): Promise<boolean> {
  try {
    const s = await db.botConfig.findUnique({ where: { key: AUTO_PROC_STOP_KEY } });
    return s?.value === 'true';
  } catch {
    return false;
  }
}

async function updateAutoProcHeartbeat(): Promise<void> {
  try {
    await db.botConfig.upsert({
      where: { key: AUTO_PROC_HEARTBEAT_KEY },
      update: { value: new Date().toISOString() },
      create: { key: AUTO_PROC_HEARTBEAT_KEY, value: new Date().toISOString() },
    });
  } catch {}
}

// ============================
// Process one message
// ============================

async function processOneMessage(msg: any): Promise<{ ok: boolean; error?: string }> {
  const { id, userId, content, chatId } = msg;

  if (!chatId) {
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    return { ok: false, error: 'no_chat_id' };
  }

  try {
    // ATOMIC CLAIM: pending → processing (prevents double-processing by VPS worker)
    const claimed = await db.message.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'processing' },
    });
    if (claimed.count === 0) {
      return { ok: false, error: 'already_claimed' };
    }

    await sendChatAction(chatId);

    const dbMessages = await db.message.findMany({
      where: { userId, status: 'done' },
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

    // Save reply BEFORE sending (idempotent)
    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: {
        userId,
        role: 'assistant',
        content: aiReply,
        modelUsed: 'moodchat-auto-process',
        status: 'done',
        chatId,
      },
    });

    await telegramSendMessage(chatId, aiReply);

    return { ok: true };
  } catch (err: any) {
    console.error(`[TG-AutoProc] Failed for ${id}:`, err.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

// ============================
// Route handler
// ============================

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const stopFlag = url.searchParams.get('stop');
  const startFlag = url.searchParams.get('start');

  if (stopFlag === '1') {
    await db.botConfig.upsert({
      where: { key: AUTO_PROC_STOP_KEY },
      update: { value: 'true' },
      create: { key: AUTO_PROC_STOP_KEY, value: 'true' },
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      message: 'Auto-processor stopped. VPS worker will handle all messages.',
      stopped: true,
    });
  }
  if (startFlag === '1') {
    await db.botConfig.upsert({
      where: { key: AUTO_PROC_STOP_KEY },
      update: { value: 'false' },
      create: { key: AUTO_PROC_STOP_KEY, value: 'false' },
    }).catch(() => {});
  }

  const startTime = Date.now();

  try {
    const stopped = await isAutoProcStopped();
    if (stopped) {
      return NextResponse.json({
        ok: true,
        message: 'Auto-processor is stopped. Visit /api/tg-auto-process?start=1 to resume.',
        stopped: true,
      });
    }

    // AUTO-STOP: yield to VPS worker if it's alive
    const vpsAlive = await isVpsWorkerAlive();
    if (vpsAlive) {
      return NextResponse.json({
        ok: true,
        message: 'VPS worker is alive. Auto-processor yielding.',
        vpsWorkerAlive: true,
        durationMs: Date.now() - startTime,
      });
    }

    await updateAutoProcHeartbeat();

    const pending = await db.message.findFirst({
      where: { status: 'pending', chatId: { not: null } },
      orderBy: { timestamp: 'asc' },
    });

    if (!pending) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: 'no pending messages',
        vpsWorkerAlive: false,
        durationMs: Date.now() - startTime,
      });
    }

    const result = await processOneMessage(pending);

    return NextResponse.json({
      ok: true,
      processed: 1,
      successful: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      messageId: pending.id,
      error: result.error,
      vpsWorkerAlive: false,
      durationMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[TG-AutoProc] Fatal:', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || String(error),
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
