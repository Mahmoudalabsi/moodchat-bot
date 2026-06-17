/**
 * WhatsApp Message Processor (Cron-triggered)
 * =============================================
 * GET/POST /api/process-wa-messages
 *
 * هذا الـ endpoint يُستدعى تلقائياً كل دقيقة عبر Vercel Cron.
 * يعالج رسائل واتساب المعلقة (status=pending, platform=whatsapp)
 * باستخدام Z-AI SDK ويُرسل الردود عبر WhatsApp Cloud API.
 *
 * يمتلك وصولاً تلقائياً لـ DATABASE_URL على Vercel.
 * لا يلمس رسائل تيليجرام إطلاقاً.
 *
 * الحماية:
 *  - يستخدم Vercel CRON_SECRET إن ضُبط (header-based auth)
 *  - يعالج رسالة واحدة فقط في كل استدعاء لتفادي timeout
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  sendLongTextMessage, downloadMedia, normalizePhone,
} from '@/lib/whatsapp-cloud';

// ============================
// Z-AI SDK Config (مشترك مع تيليجرام)
// ============================

const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const MAX_HISTORY = 20;
const CRON_SECRET = process.env.CRON_SECRET;

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
// Authentication for cron
// ============================

function isAuthorized(req: NextRequest): boolean {
  // If CRON_SECRET not set, allow only Vercel internal cron + localhost
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET) {
    if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  }
  // Vercel Cron sends x-vercel-cron-auth header
  const cronAuth = req.headers.get('x-vercel-cron-auth');
  if (cronAuth === 'true') return true;
  // Allow no-auth if no secret configured (open mode for dev/testing)
  if (!CRON_SECRET) return true;
  return false;
}

// ============================
// Z-AI SDK calls
// ============================

async function callZAI(messages: Array<{ role: string; content: any }>, maxTokens = 3000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s hard limit for Vercel
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

async function analyzeImageWithVLM(imageBase64: string, mimeType: string, userPrompt: string): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + '\n\nأنت الآن تحلل صورة أرسلها المستخدم. صفها بدقة وتفصيل، واستخرج كل المعلومات الممكنة.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt || 'صف هذه الصورة بدقة وتفصيل.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];
  return callZAI(messages as any, 1500);
}

// ============================
// File extraction helpers
// ============================

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(' ') + '\n\n';
    }
    return text;
  } catch (e: any) {
    return `[PDF - فشل استخراج النص: ${e.message}]`;
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: buffer });
    return r.value;
  } catch (e: any) {
    return `[DOCX - فشل الاستخراج: ${e.message}]`;
  }
}

async function extractTextFromExcel(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return wb.SheetNames.map(name => {
      const sheet = wb.Sheets[name];
      return `=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join('\n\n');
  } catch (e: any) {
    return `[Excel - فشل الاستخراج: ${e.message}]`;
  }
}

function extractTextFromPlain(buffer: Buffer): string {
  try { return buffer.toString('utf8'); } catch { return '[Text - cannot decode]'; }
}

async function extractTextFromFile(buffer: Buffer, fileName: string, mimeType: string): Promise<{ text: string; isImage: boolean; isAudio: boolean }> {
  const mt = (mimeType || '').toLowerCase();
  const fn = (fileName || '').toLowerCase();
  if (mt.includes('pdf') || fn.endsWith('.pdf')) return { text: await extractTextFromPDF(buffer), isImage: false, isAudio: false };
  if (mt.includes('word') || mt.includes('docx') || fn.endsWith('.docx') || fn.endsWith('.doc')) return { text: await extractTextFromDOCX(buffer), isImage: false, isAudio: false };
  if (mt.includes('sheet') || mt.includes('excel') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) return { text: await extractTextFromExcel(buffer), isImage: false, isAudio: false };
  if (mt.startsWith('image/')) return { text: '', isImage: true, isAudio: false };
  if (mt.startsWith('audio/')) return { text: '', isImage: false, isAudio: true };
  return { text: extractTextFromPlain(buffer), isImage: false, isAudio: false };
}

// ============================
// معالجة رسالة واحدة
// ============================

async function processOneMessage(msg: any): Promise<{ ok: boolean; error?: string }> {
  const { id, whatsappPhone, content, imageUrl, fileName, fileType, mimeType } = msg;

  if (!whatsappPhone) {
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    return { ok: false, error: 'no_whatsapp_phone' };
  }

  try {
    // atomic claim: pending → processing
    await db.message.update({ where: { id }, data: { status: 'processing' } });

    // history (last 20 done messages for this user)
    const dbMessages = await db.message.findMany({
      where: { whatsappPhone, status: 'done', platform: 'whatsapp' },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    let userContent = content;

    // معالجة الوسائط
    if (imageUrl) {
      try {
        const media = await downloadMedia(imageUrl);
        if (media) {
          if (fileType === 'image' || (mimeType || '').startsWith('image/')) {
            const base64 = media.buffer.toString('base64');
            const caption = content.split('\n').pop() || 'صف هذه الصورة بدقة وتفصيل.';
            const description = await analyzeImageWithVLM(base64, media.mimeType, caption);
            userContent = `[صورة - تم تحليلها]\nالوصف: ${description}`;
          } else if (fileType === 'voice' || fileType === 'audio' || (mimeType || '').startsWith('audio/')) {
            userContent = `${content}\n\n[ملف صوتي - ${media.mimeType} - يلزم تفريغ صوتي غير متاح حالياً في وضع cron]`;
          } else {
            const extracted = await extractTextFromFile(media.buffer, fileName || media.filename || '', media.mimeType || mimeType || '');
            if (extracted.isImage) {
              const base64 = media.buffer.toString('base64');
              const caption = content.split('\n').pop() || 'صف هذه الصورة.';
              const description = await analyzeImageWithVLM(base64, media.mimeType, caption);
              userContent = `[صورة - تم تحليلها]\n${description}`;
            } else if (extracted.text) {
              const truncated = extracted.text.length > 6000
                ? extracted.text.slice(0, 6000) + '\n...[تم اقتطاع النص]'
                : extracted.text;
              userContent = `${content}\n\nمحتوى الملف:\n${truncated}`;
            }
          }
        }
      } catch (mediaErr: any) {
        console.warn(`[WA-Cron] Media processing failed for ${id}:`, mediaErr.message);
        userContent = `${content}\n\n[تعذّر معالجة الملف: ${mediaErr.message}]`;
      }
    }

    // build conversation
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ];

    const aiReply = await callZAI(messages, 2500);

    // save reply
    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: {
        platform: 'whatsapp',
        whatsappPhone,
        userId: null,
        role: 'assistant',
        content: aiReply,
        modelUsed: 'moodchat-wa-cron',
        status: 'done',
        chatId: null,
      },
    });

    // send to user via WhatsApp
    await sendLongTextMessage(whatsappPhone, aiReply);

    // heartbeat
    await db.botConfig.upsert({
      where: { key: 'wa_cron_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'wa_cron_heartbeat', value: new Date().toISOString() },
    }).catch(() => {});

    return { ok: true };
  } catch (err: any) {
    console.error(`[WA-Cron] Failed for ${id}:`, err.message);
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
    // Process up to 2 messages per invocation (stays well under Vercel 60s limit)
    // Sort by oldest first
    const pending = await db.message.findMany({
      where: { platform: 'whatsapp', status: 'pending', whatsappPhone: { not: null } },
      orderBy: { timestamp: 'asc' },
      take: 2,
    });

    if (pending.length === 0) {
      // Still record a heartbeat
      await db.botConfig.upsert({
        where: { key: 'wa_cron_heartbeat' },
        update: { value: new Date().toISOString() },
        create: { key: 'wa_cron_heartbeat', value: new Date().toISOString() },
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        processed: 0,
        duration_ms: Date.now() - startTime,
        message: 'no pending messages',
      });
    }

    for (const msg of pending) {
      // Stop if approaching 45s (leave buffer for cleanup)
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
    console.error('[WA-Cron] Fatal error:', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || String(error),
      processed: processed.length,
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}
