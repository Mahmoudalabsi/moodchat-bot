/**
 * مود شات - عامل خلفية واتساب (whatsapp-worker.mjs)
 * ===================================================
 * يعالج الرسائل المعلقة (pending) الخاصة بـ WhatsApp فقط:
 *  - يستعلم عن الرسائل ذات platform='whatsapp' وstatus='pending'
 *  - يستدعي Z-AI SDK (GLM-4 Plus) للحصول على رد
 *  - يرسل الرد عبر WhatsApp Cloud API
 *  - يدعم: نص، صور (VLM)، مستندات (PDF/DOCX/Excel/txt/code)، صوت (ASR)، فيديو
 *
 * هذا العامل مستقل تماماً عن worker.mjs (الخاص بتيليجرام) ولا يلمسه.
 * يمكن تشغيلهما جنباً إلى جنب على نفس الخادم دون أي تعارض.
 *
 * التشغيل:
 *   node whatsapp-worker.mjs
 *   أو: bun whatsapp-worker.mjs
 *   أو عبر PM2: pm2 start whatsapp-worker.mjs --name moodchat-wa
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ log: ['error'] });

// ============================
// الإعدادات
// ============================

const WA_API_VERSION = process.env.WA_API_VERSION || 'v21.0';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '1180359958489968';
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';

const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const MAX_HISTORY = 20;
const POLL_INTERVAL = parseInt(process.env.WA_POLL_INTERVAL || '3000', 10);
const HEARTBEAT_INTERVAL = 30000;
const BATCH_SIZE = 5;
const GRAPH_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

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

// حماية من المعالجة المزدوجة
const processingIds = new Set();
let lastHeartbeat = Date.now();

// ============================
// WhatsApp Cloud API primitives
// ============================

async function waSend(path, body) {
  if (!WA_ACCESS_TOKEN) throw new Error('WA_ACCESS_TOKEN not configured');
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    throw new Error(`WA ${err?.code || res.status}: ${err?.message || 'HTTP error'}`);
  }
  return data;
}

function normalizePhone(p) {
  let s = String(p || '').trim().replace(/[^\d]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  return s;
}

async function sendTextMessage(phone, text) {
  return waSend(`${WA_PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(phone),
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

/** تقسيم الرسائل الطويلة تلقائياً (واتساب حد النص 4096 حرف). */
async function sendLongTextMessage(phone, text) {
  const MAX = 3800;
  if (text.length <= MAX) return [await sendTextMessage(phone, text)];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', MAX);
    if (cut < MAX * 0.5) cut = remaining.lastIndexOf(' ', MAX);
    if (cut < MAX * 0.5) cut = MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const suffix = chunks.length > 1 ? `\n\n_${i + 1}/${chunks.length}_` : '';
    try {
      const r = await sendTextMessage(phone, chunks[i] + suffix);
      results.push(r);
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`[WA-Worker] chunk ${i + 1} failed:`, e.message);
      results.push({ error: e.message });
    }
  }
  return results;
}

/** تنزيل وسائط واتساب عبر media id. */
async function downloadMedia(mediaId) {
  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${WA_ACCESS_TOKEN}` },
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const url = meta?.url;
    const mimeType = meta?.mime_type || 'application/octet-stream';
    const filename = meta?.filename;
    if (!url) return null;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${WA_ACCESS_TOKEN}` } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, mimeType, filename };
  } catch (e) {
    console.error(`[WA-Worker] downloadMedia(${mediaId}) failed:`, e.message);
    return null;
  }
}

// ============================
// Z-AI SDK call (نفس منطق تيليجرام)
// ============================

async function callZAI(messages, maxTokens = 4000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 60000);
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
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
        signal: ctrl.signal,
        body: JSON.stringify({
          messages,
          temperature: 0.7,
          max_tokens: maxTokens,
          thinking: { type: 'disabled' },
        }),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < 2) continue;
        throw new Error(`Z-AI ${res.status}`);
      }
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
      throw new Error('Empty AI response');
    } catch (e) {
      if (attempt === 2) throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================
// Z-AI VLM (تحليل الصور)
// ============================

async function analyzeImageWithVLM(imageBase64, mimeType, userPrompt) {
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT + '\n\nأنت الآن تحلل صورة أرسلها المستخدم. صفها بدقة وتفصيل، واستخرج كل المعلومات الممكنة.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt || 'صف هذه الصورة بدقة وتفصيل.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];
  return callZAI(messages, 2000);
}

// ============================
// ASR (تفريغ الصوت)
// ============================

async function transcribeAudio(buffer, mimeType) {
  try {
    // Z-AI SDK يدعم ASR عبر endpoint خاص
    const formData = new FormData();
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp3') ? 'mp3' : 'ogg';
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');
    const res = await fetch(`${ZAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Chat-Id': ZAI_CHAT_ID,
        'X-User-Id': ZAI_USER_ID,
        'X-Token': ZAI_TOKEN,
      },
      body: formData,
    });
    if (!res.ok) {
      console.warn(`[WA-Worker] ASR failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.text?.trim() || null;
  } catch (e) {
    console.error('[WA-Worker] ASR error:', e.message);
    return null;
  }
}

// ============================
// استخراج النص من الملفات
// ============================

async function extractTextFromPDF(buffer) {
  try {
    // محاولة استخدام pdfjs-dist إن كان متوفراً
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n\n';
    }
    return text;
  } catch (e) {
    console.error('[WA-Worker] PDF extract failed:', e.message);
    return `[PDF file - ${buffer.length} bytes - فشل استخراج النص: ${e.message}]`;
  }
}

async function extractTextFromDOCX(buffer) {
  try {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: buffer });
    return r.value;
  } catch (e) {
    return `[DOCX - فشل الاستخراج: ${e.message}]`;
  }
}

async function extractTextFromExcel(buffer) {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheets = wb.SheetNames.map(name => {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_csv(sheet);
      return `=== Sheet: ${name} ===\n${rows}`;
    });
    return sheets.join('\n\n');
  } catch (e) {
    return `[Excel - فشل الاستخراج: ${e.message}]`;
  }
}

function extractTextFromPlain(buffer) {
  try {
    return buffer.toString('utf8');
  } catch {
    return '[Text file - cannot decode]';
  }
}

async function extractTextFromFile(buffer, fileName, mimeType) {
  const mt = (mimeType || '').toLowerCase();
  const fn = (fileName || '').toLowerCase();
  if (mt.includes('pdf') || fn.endsWith('.pdf')) {
    return { text: await extractTextFromPDF(buffer), isImage: false, isAudio: false };
  }
  if (mt.includes('word') || mt.includes('docx') || fn.endsWith('.docx') || fn.endsWith('.doc')) {
    return { text: await extractTextFromDOCX(buffer), isImage: false, isAudio: false };
  }
  if (mt.includes('sheet') || mt.includes('excel') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) {
    return { text: await extractTextFromExcel(buffer), isImage: false, isAudio: false };
  }
  if (mt.startsWith('audio/') || mt.includes('ogg') || fn.endsWith('.mp3') || fn.endsWith('.ogg') || fn.endsWith('.m4a')) {
    return { text: '', isImage: false, isAudio: true };
  }
  if (mt.startsWith('image/')) {
    return { text: '', isImage: true, isAudio: false };
  }
  return { text: extractTextFromPlain(buffer), isImage: false, isAudio: false };
}

// ============================
// معالجة رسالة واحدة
// ============================

async function processPendingMessage(msg) {
  const { id, whatsappPhone, content, imageUrl, fileName, fileType, mimeType } = msg;

  if (processingIds.has(id)) return;
  if (!whatsappPhone) {
    await db.message.update({ where: { id }, data: { status: 'failed' } });
    return;
  }
  processingIds.add(id);

  try {
    // تحديث الحالة فوراً لمنع المعالجة المزدوجة
    await db.message.update({ where: { id }, data: { status: 'processing' } });

    const dbMessages = await db.message.findMany({
      where: { whatsappPhone, status: 'done', platform: 'whatsapp' },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    let userContent = content;
    let isImage = false;
    let isAudio = false;

    // معالجة الوسائط إن وُجدت
    if (imageUrl) {
      const media = await downloadMedia(imageUrl);
      if (media) {
        if (fileType === 'image' || (mimeType || '').startsWith('image/')) {
          isImage = true;
          const base64 = media.buffer.toString('base64');
          const captionMatch = content.match(/^(?:.*\n)*?(?=.{0,500}$)/s);
          const caption = (content || '').split('\n').slice(-1)[0] || '';
          const aiReply = await analyzeImageWithVLM(base64, media.mimeType, caption || 'صف هذه الصورة بدقة وتفصيل.');
          userContent = `[صورة - تم تحليلها بواسطة VLM]\nالوصف: ${aiReply}`;
        } else if (fileType === 'voice' || fileType === 'audio' || (mimeType || '').startsWith('audio/')) {
          isAudio = true;
          const transcription = await transcribeAudio(media.buffer, media.mimeType);
          if (transcription) {
            userContent = `${content}\n\nالنص المستخرج من الصوت:\n${transcription}`;
          } else {
            userContent = `${content}\n\n[تعذّر تفريغ الصوت]`;
          }
        } else {
          // مستند — استخراج النص
          const extracted = await extractTextFromFile(media.buffer, fileName || media.filename, media.mimeType || mimeType);
          if (extracted.isImage) {
            isImage = true;
            const base64 = media.buffer.toString('base64');
            const caption = (content || '').split('\n').slice(-1)[0] || '';
            const aiReply = await analyzeImageWithVLM(base64, media.mimeType, caption);
            userContent = `[صورة - تم تحليلها]\n${aiReply}`;
          } else if (extracted.isAudio) {
            isAudio = true;
            const transcription = await transcribeAudio(media.buffer, media.mimeType);
            userContent = `${content}\n\nالنص المستخرج من الصوت:\n${transcription || '[تعذّر التفريغ]'}`;
          } else if (extracted.text) {
            const truncated = extracted.text.length > 8000
              ? extracted.text.slice(0, 8000) + '\n...[تم اقتطاع النص]'
              : extracted.text;
            userContent = `${content}\n\nمحتوى الملف:\n${truncated}`;
          }
        }
      }
    }

    // بناء سياق المحادثة
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...dbMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ];

    // استدعاء Z-AI
    const aiReply = await callZAI(messages, 4000);

    // حفظ الرد في نفس السجل
    await db.message.update({ where: { id }, data: { status: 'done' } });
    await db.message.create({
      data: {
        platform: 'whatsapp',
        whatsappPhone,
        userId: null,
        role: 'assistant',
        content: aiReply,
        modelUsed: 'moodchat-wa-worker',
        status: 'done',
        chatId: null,
      },
    });

    // إرسال الرد عبر واتساب (مع تقسيم تلقائي للرسائل الطويلة)
    await sendLongTextMessage(whatsappPhone, aiReply);

    // نبضة حياة
    lastHeartbeat = Date.now();
    await db.botConfig.upsert({
      where: { key: 'wa_worker_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'wa_worker_heartbeat', value: new Date().toISOString() },
    }).catch(() => {});

    console.log(`[WA-Worker] ✅ ${whatsappPhone}: "${aiReply.substring(0, 50)}..."`);
  } catch (error) {
    console.error(`[WA-Worker] ❌ ${id} (${whatsappPhone}):`, error.message);
    await db.message.update({ where: { id }, data: { status: 'failed' } }).catch(() => {});
    try {
      await sendTextMessage(whatsappPhone, '⚠️ عذراً، حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى.');
    } catch {}
  } finally {
    processingIds.delete(id);
  }
}

// ============================
// حلقة الاستقصاء
// ============================

let isPolling = false;

async function poll() {
  if (isPolling) return;
  isPolling = true;
  try {
    const pending = await db.message.findMany({
      where: {
        platform: 'whatsapp',
        status: 'pending',
        whatsappPhone: { not: null },
      },
      orderBy: { timestamp: 'asc' },
      take: BATCH_SIZE,
    });
    if (pending.length > 0) {
      console.log(`[WA-Worker] 📨 ${pending.length} pending WhatsApp message(s)`);
      for (const msg of pending) {
        await processPendingMessage(msg);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  } catch (error) {
    console.error('[WA-Worker] Poll error:', error.message);
  } finally {
    isPolling = false;
  }
}

async function heartbeat() {
  try {
    await db.botConfig.upsert({
      where: { key: 'wa_worker_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'wa_worker_heartbeat', value: new Date().toISOString() },
    });
  } catch {}
}

// حماية من الأعطال
process.on('uncaughtException', (err) => console.error('[WA-Worker] Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('[WA-Worker] Unhandled:', err));

console.log('🟢 مود شات - عامل خلفية واتساب');
console.log(`📱 Phone Number ID: ${WA_PHONE_NUMBER_ID}`);
console.log(`📡 API: ${WA_API_VERSION}`);
console.log(`🤖 Z-AI: ${ZAI_BASE_URL}`);
console.log(`⏱️ فترة الاستقصاء: ${POLL_INTERVAL}ms`);
if (!WA_ACCESS_TOKEN) {
  console.warn('⚠️  WA_ACCESS_TOKEN غير مضبوط! سيفشل الإرسال.');
}
console.log('🟢 جاهز لاستقبال رسائل واتساب...\n');

setInterval(poll, POLL_INTERVAL);
setInterval(heartbeat, HEARTBEAT_INTERVAL);
poll();
heartbeat();
