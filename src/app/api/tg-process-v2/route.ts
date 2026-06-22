/**
 * TG Process V2 — Pollinations-only, no auto-stop, multi-message
 * GET /api/tg-process-v2
 *
 * This endpoint is intentionally SEPARATE from /api/tg-auto-process
 * to avoid the legacy auto-stop behavior. It ALWAYS processes pending messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BOT_TOKEN = '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';
const MAX_HISTORY = 20;
const CRON_SECRET = process.env.CRON_SECRET;

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم. إذا كتب بالعربية ترد بالعربية، إذا كتب بالإنجليزية ترد بالإنجليزية.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة.
5- كن مختصراً إلا إذا طُلب التفصيل.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً - بدلاً من الرفض قدّم أفضل مساعدة ممكنة.
- لا تكرر نفس الرد ولا نفس المقدمة. كل رد يجب أن يكون فريداً.`;

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true;
  const cronAuth = req.headers.get('x-vercel-cron-auth');
  if (cronAuth === 'true') return true;
  if (!CRON_SECRET) return true;
  return false;
}

async function tgApi(method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json().catch(() => ({}));
}

async function telegramSendMessage(chatId: number, text: string): Promise<void> {
  if (text.length <= 3800) {
    await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' }).catch(() => {});
    return;
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
    } catch {
      try { await tgApi('sendMessage', { chat_id: chatId, text: chunks[i] }); } catch {}
    }
  }
}

async function sendChatAction(chatId: number): Promise<void> {
  try { await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }); } catch {}
}

async function callAI(messages: Array<{ role: string; content: any }>, maxTokens = 2500): Promise<string> {
  // Pollinations — primary (works from Vercel)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const pollRes = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'moodchat-vercel-v2',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    clearTimeout(timeout);
    if (pollRes.ok) {
      const pollData = await pollRes.json();
      const pollReply = pollData?.choices?.[0]?.message?.content?.trim();
      if (pollReply) return pollReply;
    }
  } catch {}

  // Smart fallback
  const lastUser = messages.filter(m => m.role === 'user').pop();
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  if (/^(hi|hello|hey|مرحبا|هلا|السلام|سلام)/i.test(userText.trim())) {
    return 'مرحباً! كيف يمكنني مساعدتك اليوم؟';
  }
  return 'أعتذر، أواجه مشكلة مؤقتة في الاتصال بالخدمة. يرجى المحاولة مرة أخرى بعد لحظات.';
}

async function processOneMessage(msg: any): Promise<{ ok: boolean; error?: string }> {
  const { id, userId, content, chatId } = msg;

  if (!chatId) {
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    return { ok: false, error: 'no_chat_id' };
  }

  try {
    // Atomic claim
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

    const aiReply = await callAI(messages, 2500);

    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: {
        userId,
        role: 'assistant',
        content: aiReply,
        modelUsed: 'moodchat-v2',
        status: 'done',
        chatId,
      },
    });

    await telegramSendMessage(chatId, aiReply);

    return { ok: true };
  } catch (err: any) {
    console.error(`[TG-V2] Failed for ${id}:`, err.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const pending = await db.message.findMany({
      where: { status: 'pending', chatId: { not: null } },
      orderBy: { timestamp: 'asc' },
      take: 3,
    });

    if (!pending || pending.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: 'no pending messages',
        endpoint: 'tg-process-v2',
        durationMs: Date.now() - startTime,
      });
    }

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const msg of pending) {
      if (Date.now() - startTime > 50000) break;
      const result = await processOneMessage(msg);
      if (result.ok) successful++;
      else {
        failed++;
        if (result.error) errors.push(result.error);
      }
    }

    return NextResponse.json({
      ok: true,
      endpoint: 'tg-process-v2',
      processed: pending.length,
      successful,
      failed,
      errors: errors.slice(0, 3),
      durationMs: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || String(error),
      endpoint: 'tg-process-v2',
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
