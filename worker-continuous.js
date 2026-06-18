/**
 * MoodChat Worker v2 - Continuous loop for PM2
 *
 * يدعم كل قدرات Z-AI SDK:
 *  - محادثة ذكية (chat completions)
 *  - بحث في الويب (web_search)
 *  - قراءة صفحات الويب (page_reader)
 *  - توليد الصور (images.generations)
 *  - تحويل النص إلى كلام (TTS)
 *  - تفريغ الصوت (ASR) - للرسائل الصوتية
 *  - تحليل الصور (VLM)
 *
 * يستخدم الأوامر التالية في الرسائل:
 *  - "[text]"                            → رد ذكي
 *  - "search:[query]"                    → بحث ويب + تلخيص
 *  - "read:[url]"                        → قراءة صفحة + تلخيص
 *  - "draw:[prompt]"                     → توليد صورة
 *  - "tts:[text]"                        → تحويل نص إلى صوت
 *  - "vlm:[prompt]|url=[url]"            → تحليل صورة بالـ VLM
 *  - "asr_url:[url]"                     → تفريغ صوتي من URL
 *  - "vlm_url:[prompt]|url=[url]"        → تحليل صورة من URL
 *
 * أو يكتشف تلقائياً: روابط URL → قراءة الويب
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// === Config ===
const POLL_INTERVAL_MS = 2000;
const MAX_PER_BATCH = 5;
const MAX_HISTORY = 30;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

// مسار حفظ الملفات المؤقتة
const TMP_DIR = '/tmp/moodchat-bot';
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة.
5- كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً.

قواعد السرية:
- لا تكشف أبداً عن هويتك الحقيقية أو اسم الشركة المطورة لك.
- إذا سُئلت من أنت، أجب: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."

عندما يقدم لك المستخدم نتائج من بحث ويب أو محتوى من صفحة ويب، استخدمها لإجابة محدثة ودقيقة، واذكر المصدر بصيغة "📚 المصدر: example.com".`;

// === DB ===
let db = null;
let dbFailures = 0;

async function getDb() {
  if (db) return db;
  for (let i = 0; i < 5; i++) {
    try {
      const client = new PrismaClient({ log: ['error'] });
      await client.$queryRaw`SELECT 1`;
      db = client;
      dbFailures = 0;
      console.log(`[${ts()}] ✅ DB connected`);
      return db;
    } catch (e) {
      console.error(`[${ts()}] DB connect attempt ${i+1}/5 failed: ${e.message.substring(0, 80)}`);
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error('DB connection failed after 5 retries');
}

async function resetDb() {
  if (db) { await db.$disconnect().catch(() => {}); db = null; }
}

// === Helpers ===
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString();

async function fetchWithRetry(url, options, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// === Z-AI Common Headers ===
function zaiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Token': ZAI_TOKEN,
    'X-Z-AI-From': 'Z',
  };
  if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
  return headers;
}

// === Z-AI Providers ===

async function callZAIChat(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Z-AI ${res.status}: ${errBody.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Z-AI response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages) {
  const res = await fetchWithRetry('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'openai',
      temperature: 0.7,
      seed: Math.floor(Math.random() * 10000),
    }),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (reply?.trim()) return reply.trim();
  throw new Error('Empty Pollinations response');
}

// === Z-AI Web Search ===
async function zaiWebSearch(query, num = 6) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/functions/invoke`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({ function_name: 'web_search', arguments: { query, num } }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`web_search ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    // The API returns { result: [...] } - extract the result
    const results = Array.isArray(data) ? data : (data.result || data.data || []);
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

// === Z-AI Page Reader ===
async function zaiPageReader(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/functions/invoke`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({ function_name: 'page_reader', arguments: { url } }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`page_reader ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    // The API returns { result: {...} }
    const result = data.result || data.data || data;
    return {
      title: result.title || data.title || '',
      html: result.html || data.html || '',
      url: result.url || url,
      publishedTime: result.publishedTime || result.publish_time || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Convert HTML to plain text (very basic, sufficient for summarization)
function htmlToText(html) {
  if (!html) return '';
  let t = html;
  // Remove scripts and styles
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  t = t.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  // Convert breaks and paragraphs
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/p>/gi, '\n\n');
  t = t.replace(/<\/div>/gi, '\n');
  t = t.replace(/<li[^>]*>/gi, '• ');
  // Strip remaining tags
  t = t.replace(/<[^>]+>/g, '');
  // Decode a few common entities
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Collapse whitespace
  t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return t;
}

// === Z-AI Image Generation ===
async function zaiImageGeneration(prompt, size = '1024x1024') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // image gen can be slow
  try {
    const res = await fetch(`${ZAI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({ prompt, size }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`images.gen ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    const item = data.data?.[0];
    if (!item) throw new Error('No image in response');
    // Response may be either { base64 } or { url }
    if (item.base64) return Buffer.from(item.base64, 'base64');
    if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item.url) {
      // Download the image from the URL
      console.log(`[${ts()}]   Downloading generated image from URL: ${item.url.substring(0, 80)}...`);
      const imgRes = await fetchWithRetry(item.url, {});
      if (!imgRes.ok) throw new Error(`img download ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (!buf || buf.length < 100) throw new Error('Empty image download');
      return buf;
    }
    throw new Error('No image data in response');
  } finally {
    clearTimeout(timeout);
  }
}

// === Z-AI TTS ===
async function zaiTTS(input, voice = 'tongtong', speed = 1.0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/audio/tts`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        input,
        voice,
        speed,
        response_format: 'wav',
        stream: false,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`tts ${res.status}: ${err.substring(0, 100)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf || buf.length < 100) throw new Error('Empty audio response');
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}

// === Z-AI VLM (vision) ===
async function zaiVLM(prompt, imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions/vision`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`vlm ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply === 'string') return reply.trim();
    if (Array.isArray(reply)) {
      // join text items
      return reply.map(x => x.text || '').join('').trim();
    }
    throw new Error('Empty VLM response');
  } finally {
    clearTimeout(timeout);
  }
}

// === Telegram send helpers ===

async function sendTelegram(chatId, text) {
  let safe = text;
  safe = safe.replace(/^#{1,6}\s+/gm, '');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  safe = safe.replace(/~~[^~]+~~/g, '');
  safe = safe.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const starCount = (safe.match(/\*/g) || []).length;
  if (starCount % 2 !== 0) safe = safe.replace(/\*([^*]*)$/, '$1');
  const btCount = (safe.match(/`/g) || []).length;
  if (btCount % 2 !== 0) safe += '`';
  if (safe.length > 4096) safe = safe.substring(0, 4090) + '...';

  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: safe,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (errBody.includes('parse') || errBody.includes('format')) {
      const res2 = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text.substring(0, 4096), disable_web_page_preview: true }),
      });
      if (!res2.ok) throw new Error(`Telegram ${res2.status}`);
      return res2.json();
    }
    throw new Error(`Telegram ${res.status}: ${errBody.substring(0, 150)}`);
  }
  return res.json();
}

async function sendPhoto(chatId, photoPath, caption = '') {
  const fs2 = require('fs');
  const buf = fs2.readFileSync(photoPath);
  const blob = new Blob([buf], { type: 'image/png' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.substring(0, 1024));
  form.append('photo', blob, 'image.png');

  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`sendPhoto ${res.status}: ${err.substring(0, 150)}`);
  }
  return res.json();
}

async function sendVoice(chatId, audioPath) {
  const fs2 = require('fs');
  const buf = fs2.readFileSync(audioPath);
  const blob = new Blob([buf], { type: 'audio/ogg' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('voice', blob, 'voice.ogg');

  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`sendVoice ${res.status}: ${err.substring(0, 150)}`);
  }
  return res.json();
}

async function sendAudio(chatId, audioPath, title = '') {
  const fs2 = require('fs');
  const buf = fs2.readFileSync(audioPath);
  const blob = new Blob([buf], { type: 'audio/ogg' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (title) form.append('title', title.substring(0, 64));
  form.append('audio', blob, 'audio.ogg');

  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`sendAudio ${res.status}: ${err.substring(0, 150)}`);
  }
  return res.json();
}

async function sendTyping(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch (_) {}
}

async function sendUploadPhotoAction(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'upload_photo' }),
    });
  } catch (_) {}
}

async function sendUploadVoiceAction(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'upload_voice' }),
    });
  } catch (_) {}
}

// === File downloading (for VLM/ASR with Telegram file URLs) ===
async function downloadFile(url, dest) {
  const res = await fetchWithRetry(url, {});
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

// Convert local file to base64 data URL
function fileToDataUrl(filePath, mime = 'image/jpeg') {
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

// === Telegram file downloader (by file_id) ===
// Returns { buffer, fileName, mimeType } or null on failure
async function downloadTelegramFileBuffer(fileId) {
  try {
    // 1. Get file path from Telegram
    const metaRes = await fetchWithRetry(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
      {}
    );
    if (!metaRes.ok) throw new Error(`getFile ${metaRes.status}`);
    const meta = await metaRes.json();
    if (!meta.ok || !meta.result?.file_path) throw new Error('no file_path');
    const filePath = meta.result.file_path;
    const fileName = filePath.split('/').pop() || `file_${fileId.substring(0, 10)}`;

    // 2. Download actual content
    const dlRes = await fetchWithRetry(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
      {}
    );
    if (!dlRes.ok) throw new Error(`download ${dlRes.status}`);
    const buffer = Buffer.from(await dlRes.arrayBuffer());

    // 3. Guess MIME type from extension
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypeMap = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
      json: 'application/json', xml: 'application/xml', html: 'text/html',
      py: 'text/x-python', js: 'text/javascript', ts: 'text/typescript',
      tsx: 'text/typescript', jsx: 'text/javascript',
      java: 'text/x-java-source', c: 'text/x-c', cpp: 'text/x-c++',
      go: 'text/x-go', rs: 'text/x-rust', rb: 'text/x-ruby', php: 'text/x-php',
      swift: 'text/x-swift', kt: 'text/x-kotlin', sql: 'text/x-sql',
      sh: 'text/x-shellscript', ps1: 'text/x-powershell',
      yml: 'text/yaml', yaml: 'text/yaml',
      mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
      mp4: 'video/mp4', avi: 'video/avi', mov: 'video/quicktime',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      zip: 'application/zip', rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
    };
    const mimeType = mimeTypeMap[ext] || 'application/octet-stream';
    return { buffer, fileName, mimeType };
  } catch (err) {
    console.error(`[${ts()}]   Telegram file download error: ${err.message.substring(0, 100)}`);
    return null;
  }
}

// === PDF text extraction (multi-engine with fallback) ===
async function extractTextFromPDF(buffer) {
  let bestText = '';

  // Method 1: pdfjs-dist with enhanced text ordering
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: false,
    }).promise;
    const numPages = doc.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      // Sort items by position to improve Arabic/English reading order
      const items = textContent.items
        .filter(item => item.str && item.str.trim())
        .sort((a, b) => {
          const yDiff = Math.abs(a.transform[5] - b.transform[5]);
          if (yDiff > 5) return b.transform[5] - a.transform[5]; // different rows
          return a.transform[4] - b.transform[4]; // same row: left to right
        });

      let currentY = -1;
      let lineText = '';
      let pageText = '';
      for (const item of items) {
        const itemY = Math.round(item.transform[5]);
        if (currentY !== -1 && Math.abs(itemY - currentY) > 5) {
          pageText += lineText.trim() + '\n';
          lineText = '';
        }
        lineText += item.str + ' ';
        currentY = itemY;
      }
      if (lineText.trim()) pageText += lineText.trim();
      fullText += `\n--- صفحة ${i}/${numPages} ---\n${pageText}\n`;
    }

    bestText = fullText.trim();
    if (bestText.length > 100) {
      console.log(`[${ts()}]   📄 PDF extracted (pdfjs-dist): ${bestText.length} chars, ${numPages} pages`);
      return bestText;
    }
  } catch (err) {
    console.error(`[${ts()}]   PDF pdfjs-dist error: ${err.message?.substring(0, 80)}`);
  }

  // Method 2: pdf-parse as fallback
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    if (data.text && data.text.trim().length > bestText.length) {
      bestText = data.text.trim();
      console.log(`[${ts()}]   📄 PDF extracted (pdf-parse): ${bestText.length} chars, ${data.numpages} pages`);
    }
  } catch (err) {
    console.error(`[${ts()}]   PDF pdf-parse error: ${err.message?.substring(0, 80)}`);
  }

  if (bestText.length > 50) return bestText;
  return '[PDF لا يحتوي على نص قابل للقراءة - قد يكون صورة ممسوحة ضوئياً. حاول إرسال صور صفحات الكتاب لتحليلها بالذكاء الاصطناعي]';
}

// === DOCX text extraction ===
async function extractTextFromDOCX(buffer) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || '[ملف DOCX فارغ]';
  } catch (err) {
    console.error(`[${ts()}]   DOCX parse error: ${err.message?.substring(0, 80)}`);
    return '[خطأ في قراءة ملف DOCX]';
  }
}

// === Excel text extraction ===
async function extractTextFromExcel(buffer) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allText = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csvContent = XLSX.utils.sheet_to_csv(sheet);
      const rowCount = csvContent.split('\n').filter(r => r.trim()).length;
      allText += `\n=== ورقة: ${sheetName} (${rowCount} صف) ===\n${csvContent}\n`;
    }
    return allText.trim() || '[ملف Excel فارغ]';
  } catch (err) {
    console.error(`[${ts()}]   Excel parse error: ${err.message?.substring(0, 80)}`);
    return '[خطأ في قراءة ملف Excel]';
  }
}

// === Plain text extraction ===
function extractTextFromPlain(buffer) {
  try {
    const text = buffer.toString('utf-8').trim();
    return text || '[ملف فارغ]';
  } catch {
    return '[خطأ في قراءة الملف النصي]';
  }
}

// === Dispatch file to appropriate extractor ===
// Returns { text, isImage, isAudio, isVideo }
async function extractTextFromFile(buffer, fileName, mimeType) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  // Images → VLM
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif'];
  if (imageExts.includes(ext) || mimeType.startsWith('image/')) {
    return { text: '', isImage: true, isAudio: false, isVideo: false };
  }

  // Audio → ASR
  const audioExts = ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'aac', 'wma', 'opus'];
  if (audioExts.includes(ext) || mimeType.startsWith('audio/')) {
    return { text: '', isImage: false, isAudio: true, isVideo: false };
  }

  // Video
  const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', '3gp'];
  if (videoExts.includes(ext) || mimeType.startsWith('video/')) {
    return { text: `[ملف فيديو: ${fileName} - ${mimeType}]`, isImage: false, isAudio: false, isVideo: true };
  }

  // PDF
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const text = await extractTextFromPDF(buffer);
    return { text, isImage: false, isAudio: false, isVideo: false };
  }

  // DOCX
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
    const text = await extractTextFromDOCX(buffer);
    return { text, isImage: false, isAudio: false, isVideo: false };
  }

  // Excel
  if (['xlsx', 'xls'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    const text = await extractTextFromExcel(buffer);
    return { text, isImage: false, isAudio: false, isVideo: false };
  }

  // Text and code files
  const textExts = [
    'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'css',
    'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'c', 'cpp', 'h', 'hpp',
    'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua', 'perl', 'pl',
    'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'log', 'rtf', 'diff', 'patch',
    'vue', 'svelte',
  ];
  const textMimes = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/x-'];
  if (textExts.includes(ext) || textMimes.some(m => mimeType.startsWith(m))) {
    return { text: extractTextFromPlain(buffer), isImage: false, isAudio: false, isVideo: false };
  }

  // Old DOC format
  if (ext === 'doc') {
    const text = extractTextFromPlain(buffer);
    if (text.length > 50 && !text.includes('\0')) {
      return { text, isImage: false, isAudio: false, isVideo: false };
    }
    return { text: '[ملف DOC قديم - يُنصح بتحويله إلى DOCX]', isImage: false, isAudio: false, isVideo: false };
  }

  // Archives
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
  if (archiveExts.includes(ext)) {
    return { text: `[ملف مضغوط: ${fileName} - ${mimeType}]`, isImage: false, isAudio: false, isVideo: false };
  }

  // Unknown — try as text
  try {
    const text = buffer.toString('utf-8').trim();
    const nullCount = (text.match(/\0/g) || []).length;
    if (text.length > 20 && nullCount < text.length * 0.01) {
      return { text, isImage: false, isAudio: false, isVideo: false };
    }
  } catch {}

  return { text: `[ملف غير معروف: ${fileName} (${mimeType})]`, isImage: false, isAudio: false, isVideo: false };
}

// === Z-AI ASR (speech-to-text) ===
async function zaiASR(audioBuffer, mimeType = 'audio/ogg', lang = 'ar') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const base64Audio = audioBuffer.toString('base64');
    const body = {
      model: 'glm-asr',
      file_base64: base64Audio,
      file: `audio.${(mimeType.split('/')[1] || 'ogg').split(';')[0]}`,
    };
    const res = await fetch(`${ZAI_BASE_URL}/audio/asr`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`asr ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    const text = data.text || data.result?.text || data.transcript || '';
    if (text.trim()) return text.trim();
    throw new Error('Empty ASR response');
  } finally {
    clearTimeout(timeout);
  }
}

// === Z-AI VLM with base64 image ===
async function zaiVLMBase64(prompt, base64Image, mimeType = 'image/jpeg') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions/vision`, {
      method: 'POST',
      headers: zaiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`vlm ${res.status}: ${err.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply === 'string') return reply.trim();
    if (Array.isArray(reply)) {
      return reply.map(x => x.text || '').join('').trim();
    }
    throw new Error('Empty VLM response');
  } finally {
    clearTimeout(timeout);
  }
}

// === Main message processor ===

async function processMessage(msg, db, pollinationsEnabled) {
  const chatId = msg.chatId || msg.userId;
  const content = msg.content || '';
  const modelUsed = msg.modelUsed || '';

  await sendTyping(chatId);

  // ============================================================
  // 1. AI Conversation (default - normal chat)
  // ============================================================
  if (modelUsed === 'moodchat' || modelUsed === '' || modelUsed === null) {
    // Check for URL in content → use web reader automatically
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      console.log(`[${ts()}]   🔗 Detected URL, reading page: ${url.substring(0, 80)}`);
      try {
        const page = await zaiPageReader(url);
        const text = htmlToText(page.html).substring(0, 6000);
        const augmented = `المستخدم سأل: ${content}\n\nتم استخراج المحتوى من ${url}:\nالعنوان: ${page.title}\n\n${text}\n\nبناءً على المحتوى أعلاه، أجب على سؤال المستخدم.`;
        const history = await getHistory(db, msg.userId);
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nاستخدم المحتوى المرفق للإجابة، واذكر المصدر.' },
          ...history,
          { role: 'user', content: augmented },
        ];
        const reply = await callZAIChat(messages);
        await replyAndSave(db, msg, chatId, reply, 'moodchat-webreader');
        return;
      } catch (e) {
        console.error(`[${ts()}]   ⚠️ Page reader failed: ${e.message.substring(0, 80)} - falling back to chat`);
        // fall through to normal chat
      }
    }

    // Normal chat
    const history = await getHistory(db, msg.userId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content },
    ];

    let reply;
    let modelTag = 'moodchat-zai';
    try {
      reply = await callZAIChat(messages);
    } catch (e) {
      console.error(`[${ts()}]   Z-AI failed: ${e.message.substring(0, 80)}`);
      if (pollinationsEnabled) {
        try {
          reply = await callPollinations(messages);
          modelTag = 'moodchat-pollinations';
        } catch (e2) {
          console.error(`[${ts()}]   Pollinations failed: ${e2.message.substring(0, 80)}`);
          reply = "عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏";
          modelTag = 'moodchat-fallback';
        }
      } else {
        reply = "عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏";
        modelTag = 'moodchat-fallback';
      }
    }
    await replyAndSave(db, msg, chatId, reply, modelTag);
    return;
  }

  // ============================================================
  // 2. Image Generation: modelUsed = 'bot-draw'
  // ============================================================
  if (modelUsed === 'bot-draw') {
    const prompt = content.replace(/^draw:/i, '').trim() || content;
    await sendUploadPhotoAction(chatId);
    try {
      const buf = await zaiImageGeneration(prompt, '1024x1024');
      const filePath = path.join(TMP_DIR, `img_${Date.now()}_${Math.random().toString(36).slice(2,8)}.png`);
      fs.writeFileSync(filePath, buf);
      await sendPhoto(chatId, filePath, `🎨 ${prompt.substring(0, 900)}`);
      try { fs.unlinkSync(filePath); } catch (_) {}
      await db.message.create({
        data: { userId: msg.userId, role: 'assistant', content: `🎨 تم توليد صورة: ${prompt}`, modelUsed: 'moodchat-draw', status: 'done' },
      });
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      console.log(`[${ts()}]   🎨 Image generated for ${msg.userId}: ${prompt.substring(0, 50)}`);
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ Image gen failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل توليد الصورة: ${e.message.substring(0, 200)}\n\nحاول مرة أخرى بصياغة مختلفة.`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 3. Web Search: modelUsed = 'bot-search'
  // ============================================================
  if (modelUsed === 'bot-search') {
    const query = content.replace(/^search:/i, '').trim() || content;
    try {
      const results = await zaiWebSearch(query, 6);
      if (!results || results.length === 0) {
        await sendTelegram(chatId, `🔍 لا توجد نتائج للبحث: "${query}"`);
        await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
        return;
      }
      // Format results into a prompt
      const formatted = results.slice(0, 6).map((r, i) =>
        `${i+1}. ${r.name || ''}\n   المصدر: ${r.host_name || r.url || ''}\n   ${r.snippet || ''}`
      ).join('\n\n');

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + '\n\nاستخدم نتائج البحث التالية للإجابة. اذكر المصادر في نهاية الإجابة بصيغة "📚 المصادر:"' },
        { role: 'user', content: `سؤال المستخدم: ${query}\n\nنتائج البحث:\n${formatted}\n\nقدّم إجابة محدّثة ودقيقة بناءً على هذه النتائج.` },
      ];
      const reply = await callZAIChat(messages);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-search');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ Web search failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل البحث: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 4. Web Reader (explicit): modelUsed = 'bot-read'
  // ============================================================
  if (modelUsed === 'bot-read') {
    const url = content.replace(/^read:/i, '').trim() || content;
    try {
      const page = await zaiPageReader(url);
      const text = htmlToText(page.html).substring(0, 8000);
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + '\n\nلخص المحتوى التالي بدقة واذكر النقاط الرئيسية.' },
        { role: 'user', content: `الرابط: ${url}\nالعنوان: ${page.title}\n\nالمحتوى:\n${text}\n\nقدّم ملخصاً شاملاً مع النقاط الرئيسية.` },
      ];
      const reply = await callZAIChat(messages);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-read');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ Page reader failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل قراءة الصفحة: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 5. TTS: modelUsed = 'bot-tts'
  // ============================================================
  if (modelUsed === 'bot-tts') {
    const text = content.replace(/^tts:/i, '').trim() || content;
    await sendUploadVoiceAction(chatId);
    try {
      // TTS limit is 1024 chars - chunk if needed
      const chunks = chunkText(text, 1000);
      for (let i = 0; i < chunks.length; i++) {
        const buf = await zaiTTS(chunks[i]);
        const wavPath = path.join(TMP_DIR, `tts_${Date.now()}_${i}.wav`);
        const oggPath = wavPath.replace(/\.wav$/, '.ogg');
        fs.writeFileSync(wavPath, buf);

        // Convert WAV to OGG/OPUS so Telegram accepts it as voice
        const converted = convertWavToOgg(wavPath, oggPath);
        const sendPath = converted ? oggPath : wavPath;

        try {
          await sendVoice(chatId, sendPath);
        } catch (e) {
          console.log(`[${ts()}]   sendVoice failed, falling back to sendAudio: ${e.message.substring(0, 80)}`);
          await sendAudio(chatId, sendPath, `MoodChat TTS ${i+1}`);
        }
        try { fs.unlinkSync(wavPath); } catch (_) {}
        try { fs.unlinkSync(oggPath); } catch (_) {}
      }
      await db.message.create({
        data: { userId: msg.userId, role: 'assistant', content: `🎤 تم تحويل النص إلى صوت`, modelUsed: 'moodchat-tts', status: 'done' },
      });
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      console.log(`[${ts()}]   🎤 TTS for ${msg.userId}: ${text.substring(0, 50)}`);
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ TTS failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل تحويل النص إلى صوت: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 6. VLM (image analysis from URL): modelUsed = 'bot-vlm'
  // ============================================================
  if (modelUsed === 'bot-vlm') {
    // Format: "prompt|url=..." or just "url"
    let prompt = 'صف هذه الصورة بالتفصيل';
    let imageUrl = '';
    if (content.includes('|')) {
      const [p, u] = content.split('|');
      prompt = p.trim() || prompt;
      const m = u.match(/url=(\S+)/);
      imageUrl = m ? m[1] : u.trim();
    } else if (content.startsWith('http')) {
      imageUrl = content.trim();
    } else {
      const m = content.match(/url=(\S+)/);
      if (m) imageUrl = m[1];
      else { imageUrl = content.trim(); }
    }
    try {
      const reply = await zaiVLM(prompt, imageUrl);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-vlm');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ VLM failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل تحليل الصورة: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 7. Photo upload (direct): modelUsed = 'vlm'  (set by webhook for uploaded photos)
  // ============================================================
  if (modelUsed === 'vlm') {
    const fileId = msg.imageUrl || '';
    const userCaption = msg.content && !msg.content.startsWith('📷')
      ? msg.content.replace(/^📷\s*\[صورة\]\s*/, '').trim()
      : '';
    const prompt = userCaption || 'صف هذه الصورة بالتفصيل واستخرج كل المعلومات الممكنة منها';
    try {
      if (!fileId) throw new Error('no file_id on photo message');
      console.log(`[${ts()}]   📷 Downloading photo for VLM: ${fileId.substring(0, 20)}...`);
      const fileData = await downloadTelegramFileBuffer(fileId);
      if (!fileData) throw new Error('photo download failed');
      const base64 = fileData.buffer.toString('base64');
      const reply = await zaiVLMBase64(prompt, base64, fileData.mimeType || 'image/jpeg');
      await replyAndSave(db, msg, chatId, reply, 'moodchat-vlm');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ VLM (photo) failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل تحليل الصورة: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 8. Document analysis: modelUsed = 'file-analyze'
  // ============================================================
  if (modelUsed === 'file-analyze') {
    const fileId = msg.imageUrl || '';
    const fileName = msg.fileName || 'document';
    const mimeType = msg.mimeType || 'application/octet-stream';
    const userCaption = (msg.content && msg.content.includes('\n'))
      ? msg.content.split('\n').slice(1).join('\n').trim()
      : '';
    const analyzePrompt = userCaption || 'حلل هذا الملف بالتفصيل ولخص محتواه';

    try {
      if (!fileId) throw new Error('no file_id on document');
      console.log(`[${ts()}]   📎 Analyzing file: ${fileName} (${mimeType})`);
      const fileData = await downloadTelegramFileBuffer(fileId);
      if (!fileData) throw new Error('file download failed');

      const extracted = await extractTextFromFile(fileData.buffer, fileName, mimeType);

      // Image sent as document → VLM
      if (extracted.isImage) {
        console.log(`[${ts()}]   📷 File is image → VLM`);
        const base64 = fileData.buffer.toString('base64');
        const reply = await zaiVLMBase64(analyzePrompt, base64, mimeType.startsWith('image/') ? mimeType : 'image/jpeg');
        await replyAndSave(db, msg, chatId, reply, 'moodchat-vlm');
        return;
      }

      // Audio sent as document → ASR + chat
      if (extracted.isAudio) {
        console.log(`[${ts()}]   🎤 File is audio → ASR`);
        let transcription = '';
        try {
          transcription = await zaiASR(fileData.buffer, mimeType, 'ar');
        } catch (asrErr) {
          console.error(`[${ts()}]   ⚠️ ASR failed: ${asrErr.message.substring(0, 80)}`);
          transcription = `[تعذّر تفريغ الصوت: ${asrErr.message.substring(0, 60)}]`;
        }
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `🎤 تفريغ الصوت من ملف "${fileName}":\n${transcription}\n\nطلب المستخدم: ${analyzePrompt}` },
        ];
        const reply = await callZAIChat(messages);
        await replyAndSave(db, msg, chatId, reply, 'moodchat-asr');
        return;
      }

      // Video → inform user we can't process directly
      if (extracted.isVideo) {
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `🎬 استلمت ملف فيديو "${fileName}".\n${userCaption ? `طلب: ${userCaption}` : ''}\n\nملاحظة: لا أستطيع حالياً تحليل محتوى الفيديو مباشرة. اطلب من المستخدم وصف محتوى الفيديو لمساعدته.` },
        ];
        const reply = await callZAIChat(messages);
        await replyAndSave(db, msg, chatId, reply, 'moodchat-video');
        return;
      }

      // Text/document → extract content → AI analysis
      const fileContent = extracted.text || '';
      const MAX_FILE_TEXT = 30000;
      const truncatedContent = fileContent.length > MAX_FILE_TEXT
        ? fileContent.substring(0, MAX_FILE_TEXT) + `\n\n[... تم اقتطاع ${Math.round((fileContent.length - MAX_FILE_TEXT) / 1000)}K حرف ...]`
        : fileContent;

      const fileAnalysisSystemPrompt = SYSTEM_PROMPT + `

أنت الآن محلل محتوى متخصص. قم بتحليل المحتوى المرفق بشكل شامل ومفصل:
- إذا كان كتاباً أو ملف PDF: اشرح الأفكار الرئيسية، الفصول، الحجج، الاستنتاجات
- إذا كان تقريراً: لخّص النتائج والتوصيات
- إذا كان كوداً: اشرح الوظائف والبنية وأي مشاكل محتملة
- إذا كانت بيانات (Excel/CSV): حلل الأرقام والاتجاهات
- أجب بلغة المستخدم (العربية إذا كان الطلب بالعربية)
- كن شاملاً ومفصلاً في التحليل، اذكر التفاصيل المهمة`;

      const messages = [
        { role: 'system', content: fileAnalysisSystemPrompt },
        { role: 'user', content: `📎 ملف: ${fileName}\nالنوع: ${mimeType}\nعدد الأحرف: ${fileContent.length.toLocaleString()}\n\nمحتوى الملف:\n${truncatedContent}\n\nطلب المستخدم: ${analyzePrompt}` },
      ];

      const reply = await callZAIChat(messages);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-file');
      console.log(`[${ts()}]   ✅ File analyzed: ${fileName} (${fileContent.length} chars)`);
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ File analyze failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل تحليل الملف: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 9. Voice/audio analysis: modelUsed = 'voice-analyze' | 'audio-analyze'
  // ============================================================
  if (modelUsed === 'voice-analyze' || modelUsed === 'audio-analyze') {
    const fileId = msg.imageUrl || '';
    const userCaption = (msg.content && msg.content.includes('\n'))
      ? msg.content.split('\n').slice(1).join('\n').trim()
      : '';
    const audioPrompt = userCaption || 'حلل هذا المقطع الصوتي وقدم ملخصاً';
    try {
      if (!fileId) throw new Error('no file_id on audio');
      console.log(`[${ts()}]   🎤 Downloading audio for ASR: ${fileId.substring(0, 20)}...`);
      const fileData = await downloadTelegramFileBuffer(fileId);
      if (!fileData) throw new Error('audio download failed');

      let transcription = '';
      try {
        transcription = await zaiASR(fileData.buffer, fileData.mimeType || 'audio/ogg', 'ar');
      } catch (asrErr) {
        console.error(`[${ts()}]   ⚠️ ASR failed: ${asrErr.message.substring(0, 80)}`);
        transcription = `[تعذّر تفريغ الصوت: ${asrErr.message.substring(0, 60)}]`;
      }
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `🎤 تفريغ الصوت:\n${transcription}\n\n${audioPrompt}` },
      ];
      const reply = await callZAIChat(messages);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-asr');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ Audio analyze failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, `❌ فشل تحليل الصوت: ${e.message.substring(0, 200)}`);
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // 10. Video analysis: modelUsed = 'video-analyze'
  // ============================================================
  if (modelUsed === 'video-analyze') {
    const videoInfo = msg.content.replace(/^🎬\s*\[فيديو:\s*\d+ث\]\s*/, '').trim();
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `🎬 استلمت ملف فيديو منك.\n${videoInfo ? `طلب: ${videoInfo}` : ''}\n\nملاحظة: لا أستطيع حالياً تحليل محتوى الفيديو مباشرة، لكن يمكنني مساعدتك في أي سؤال يتعلق به. يمكنك وصف محتوى الفيديو وسأحلله لك.` },
    ];
    try {
      const reply = await callZAIChat(messages);
      await replyAndSave(db, msg, chatId, reply, 'moodchat-video');
      return;
    } catch (e) {
      console.error(`[${ts()}]   ❌ Video analyze failed: ${e.message.substring(0, 100)}`);
      await sendTelegram(chatId, '🎬 استلمت الفيديو. لا أستطيع تحليل الفيديو مباشرة حالياً، لكن صف لي محتواه وسأساعدك.');
      await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      return;
    }
  }

  // ============================================================
  // Fallback - treat as regular chat
  // ============================================================
  console.log(`[${ts()}]   Unknown modelUsed='${modelUsed}', treating as chat`);
  const history = await getHistory(db, msg.userId);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content },
  ];
  let reply;
  try {
    reply = await callZAIChat(messages);
  } catch (e) {
    reply = "عذراً، واجهت خطأ. حاول مرة أخرى 🙏";
  }
  await replyAndSave(db, msg, chatId, reply, 'moodchat-fallback');
}

// === Helpers ===

async function getHistory(db, userId) {
  try {
    const rows = await db.message.findMany({
      where: { userId, status: 'done', role: { in: ['user', 'assistant'] } },
      orderBy: { timestamp: 'asc' },
      take: MAX_HISTORY,
    });
    return rows
      .filter(m => m.modelUsed !== 'file-docx' && m.modelUsed !== 'file-code')
      .map(m => ({ role: m.role, content: m.content }));
  } catch (_) {
    return [];
  }
}

async function replyAndSave(db, msg, chatId, reply, modelTag) {
  await db.message.create({
    data: { userId: msg.userId, role: 'assistant', content: reply, modelUsed: modelTag, status: 'done' },
  });
  await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
  try {
    await sendTelegram(chatId, reply);
    console.log(`[${ts()}]   ✅ Replied to ${msg.userId} via ${modelTag}: "${reply.substring(0, 60)}..."`);
  } catch (e) {
    console.error(`[${ts()}]   ❌ Telegram send failed: ${e.message.substring(0, 100)}`);
  }
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  // Split by sentences then pack
  const sentences = text.match(/[^.!?؟。\n]+[.!?؟。\n]*/g) || [text];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > maxLen) {
      if (cur) chunks.push(cur.trim());
      // If single sentence is too long, hard-split
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) {
          chunks.push(s.substring(i, i + maxLen));
        }
        cur = '';
      } else {
        cur = s;
      }
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// Convert WAV to OGG/OPUS for Telegram voice messages
function convertWavToOgg(wavPath, oggPath) {
  try {
    execSync(`ffmpeg -y -i "${wavPath}" -c:a libopus -b:a 32k "${oggPath}" 2>/dev/null`, { stdio: 'ignore' });
    return fs.existsSync(oggPath);
  } catch (_) {
    return false;
  }
}

// === Main Loop ===

// Graceful shutdown state
let isShuttingDown = false;
let inFlightCount = 0;
let tickResolve; // for await-current-tick during shutdown

async function tick() {
  if (isShuttingDown) return;  // Don't pick up new work while shutting down
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error(`[${ts()}] DB unavailable, waiting...`);
    return;
  }

  let pending = [];
  let pollinationsEnabled = false;
  try {
    pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: MAX_PER_BATCH,
    });
    const cfg = await db.botConfig.findUnique({ where: { key: 'pollinations_fallback_enabled' } });
    pollinationsEnabled = cfg?.value === 'true';
  } catch (e) {
    console.error(`[${ts()}] DB query failed: ${e.message.substring(0, 80)}`);
    dbFailures++;
    if (dbFailures >= 3) {
      console.error(`[${ts()}] Too many DB failures, resetting connection`);
      await resetDb();
      dbFailures = 0;
    }
    return;
  }

  if (pending.length === 0) return;

  console.log(`[${ts()}] Processing ${pending.length} pending message(s)`);

  for (const msg of pending) {
    if (isShuttingDown) break;  // Stop picking up new messages during shutdown
    inFlightCount++;
    try {
      await processMessage(msg, db, pollinationsEnabled);
    } catch (e) {
      console.error(`[${ts()}]   ❌ Failed msg ${msg.id}: ${e.message.substring(0, 100)}`);
      try {
        await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
      } catch (_) {}
    } finally {
      inFlightCount--;
    }
  }
}

async function main() {
  console.log(`[${ts()}] 🚀 MoodChat Worker v2 started (full Z-AI SDK capabilities)`);
  console.log(`[${ts()}]    Bot token: ...${BOT_TOKEN.slice(-8)}`);
  console.log(`[${ts()}]    Z-AI base: ${ZAI_BASE_URL}`);
  console.log(`[${ts()}]    Capabilities: chat, web_search, page_reader, image_gen, TTS, VLM, ASR`);
  console.log(`[${ts()}]    Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Signal PM2 that we're ready (used with `wait_ready: true`)
  if (typeof process.send === 'function') {
    try { process.send('ready'); } catch (_) {}
  }

  while (!isShuttingDown) {
    try {
      await tick();
    } catch (e) {
      console.error(`[${ts()}] Tick error: ${e.message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  console.log(`[${ts()}] Main loop exited (shutdown complete)`);
}

// Graceful shutdown: stop accepting new work, finish in-flight, then exit
async function gracefulShutdown(signal) {
  console.log(`[${ts()}] Received ${signal}, shutting down gracefully...`);
  console.log(`[${ts()}]    in-flight messages: ${inFlightCount}`);
  isShuttingDown = true;

  // Wait up to 25 seconds for in-flight messages to finish (Vercel/PM2 default timeout is 30s)
  const deadline = Date.now() + 25000;
  while (inFlightCount > 0 && Date.now() < deadline) {
    console.log(`[${ts()}]    waiting for ${inFlightCount} in-flight message(s)...`);
    await sleep(500);
  }
  if (inFlightCount > 0) {
    console.warn(`[${ts()}]    ⚠️ ${inFlightCount} message(s) still in flight, force-exiting`);
  }

  await resetDb();
  console.log(`[${ts()}] Shutdown complete ✅`);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
// PM2 sends 'message' with 'shutdown' event when using `pm2 reload` with `shutdown_with_message: true`
process.on('message', (msg) => {
  if (msg === 'shutdown') gracefulShutdown('PM2-shutdown');
});

main().catch(e => {
  console.error(`[${ts()}] Fatal:`, e);
  process.exit(1);
});
