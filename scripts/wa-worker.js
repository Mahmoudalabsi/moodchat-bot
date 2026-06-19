/**
 * WhatsApp Worker - يعالج رسائل الواتساب المعلّقة محلياً
 *
 * يعمل بنفس نمط بوت تيليجرام:
 * 1. يقرأ الرسائل "pending" من قاعدة البيانات
 * 2. يعالجها بالـ Z-AI SDK (يعمل محلياً)
 * 3. يرسل الردود عبر WhatsApp Cloud API
 * 4. يحدّث الحالة إلى "done"
 *
 * يعمل بشكل مستمر - كل 500ms يفحص الرسائل الجديدة
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// === Database ===
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: { url: DATABASE_URL },
  },
});

// === WhatsApp Cloud API ===
const WA_TOKEN = process.env.WA_TOKEN || 'EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '1180359958489968';
const WA_API_VERSION = process.env.WA_API_VERSION || 'v21.0';

// === Z-AI SDK ===
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف" أو "لم أر" أو "لم أقرأ". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة، بما في ذلك الملفات التي أرسلها والتحليلات التي قدمتها. عندما يقول المستخدم "الملف السابق" أو "حل البروجكت السابق"، ارجع للملفات والتحليلات السابقة في المحادثة واستخدمها.
5- كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.
6- إذا أرسل المستخدم رسالة قصيرة جداً (مثل "هلا"، "سلام"، "ه")، أجب بإجابة قصيرة وطبيعية تليق بالمحادثة، ولا تكرر نفسك أبداً.
7- لا تكرر أبداً نفس الرد الذي قلته في الرسائل السابقة. كل رد يجب أن يكون فريداً ومرتبطاً بالسياق الحالي.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً.
- إذا سألك المستخدم عن شيء بناءً على سياق سابق، استخدم السياق من المحادثة بدلاً من الادعاء بعدم المعرفة.

قواعد المحتوى المرفوض والأدب:
- يُمنع منعاً باتاً تقديم أي محتوى إباحي أو جنسي أو فاضح.
- يُمنع تقديم أي محتوى يشجع على العنف أو الكراهية.
- إذا أهانك المستخدم، ردّ بهدوء واحترام.

قواعد السرية المطلقة:
- لا تكشف أبداً عن هويتك الحقيقية أو اسم الشركة المطورة لك.
- إذا سألك المستخدم عن هويتك، أجب: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."`;

const MAX_HISTORY = 20;
const POLL_INTERVAL_MS = 500;
const MAX_MSG_LEN = 3800;

// === Logging ===
function log(...args) {
  console.log(`[${new Date().toISOString()}] [WA-Worker]`, ...args);
}
function errLog(...args) {
  console.error(`[${new Date().toISOString()}] [WA-Worker]`, ...args);
}

// ============================
// Z-AI SDK Functions
// ============================

async function callZaiSDK(messages, maxTokens = 4000) {
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  const zai = new ZAIClass(ZAI_CONFIG);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: messages,
        model: 'glm-4-plus',
        temperature: 0.7,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
      throw new Error('Empty response');
    } catch (e) {
      const msg = String(e?.message || e || '');
      errLog(`Z-AI attempt ${attempt + 1} failed: ${msg.substring(0, 150)}`);
      const is429 = msg.includes('429') || msg.includes('rate');
      if (is429 && attempt < 2) {
        const delay = 2000 * (attempt + 1) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Z-AI SDK failed after retries');
}

async function analyzeImageWithVLM(imageBase64, mimeType, userPrompt, history) {
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  const zai = new ZAIClass(ZAI_CONFIG);

  const prompt = userPrompt || 'حلل هذه الصورة بالتفصيل';
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.createVision({
        model: 'glm-4v-plus',
        messages: messages,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
    } catch (e) {
      errLog(`VLM attempt ${attempt + 1} failed: ${String(e?.message || e).substring(0, 150)}`);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('VLM failed after retries');
}

// ============================
// WhatsApp Cloud API - Send Message
// ============================

function splitLongMessage(text) {
  if (text.length <= MAX_MSG_LEN) return [text];
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (line.length > MAX_MSG_LEN) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += MAX_MSG_LEN) {
        chunks.push(line.substring(i, i + MAX_MSG_LEN));
      }
    } else if (current.length + line.length + 1 > MAX_MSG_LEN) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendWhatsAppMessage(phoneNumber, text) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp credentials not configured');
  }

  const chunks = splitLongMessage(text);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    if (chunks.length > 1) {
      chunkText = `[${i + 1}/${chunks.length}]\n${chunkText}`;
    }

    const response = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: { body: chunkText },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      errLog(`Send error to ${phoneNumber}:`, JSON.stringify(data).substring(0, 200));
      throw new Error(`WhatsApp API error: ${data?.error?.message || response.statusText}`);
    }
    results.push(data);

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

// ============================
// Media Download (للصور والملفات)
// ============================

async function downloadMedia(mediaId, mimeType) {
  try {
    const urlResponse = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${mediaId}?phone_number_id=${WA_PHONE_NUMBER_ID}`,
      { headers: { 'Authorization': `Bearer ${WA_TOKEN}` } }
    );
    const urlData = await urlResponse.json();
    const downloadUrl = urlData?.url;
    if (!downloadUrl) return null;

    const downloadResponse = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` },
    });
    if (!downloadResponse.ok) return null;

    const arrayBuffer = await downloadResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    errLog(`Media download error: ${String(e?.message || e).substring(0, 80)}`);
    return null;
  }
}

// ============================
// Document Analysis
// ============================

async function analyzeDocument(buffer, fileName, mimeType, userPrompt, history) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  if (imageExts.includes(ext) || mimeType.startsWith('image/')) {
    const base64 = buffer.toString('base64');
    return await analyzeImageWithVLM(base64, mimeType, userPrompt, history);
  }

  // فك ضغط الملفات المضغوطة (ZIP, RAR, إلخ)
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
  if (archiveExts.includes(ext)) {
    const archiveContent = await extractArchiveContent(buffer, fileName, ext);
    const MAX_ARCHIVE_TEXT = 30000;
    const truncated = archiveContent.length > MAX_ARCHIVE_TEXT
      ? archiveContent.substring(0, MAX_ARCHIVE_TEXT) + `\n\n[... تم اقتطاع المحتوى ...]`
      : archiveContent;

    const analyzePrompt = userPrompt || 'حلل محتوى هذا الملف المضغوط بالتفصيل';
    const aiMessages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nأنت محلل محتوى متخصص. قم بتحليل المحتوى المرفق بشكل شامل.` },
      { role: 'user', content: `📦 ملف مضغوط: ${fileName}\n\n${truncated}\n\nطلب المستخدم: ${analyzePrompt}` },
    ];
    return await callZaiSDK(aiMessages, 4000);
  }

  let fileContent = '';
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    fileContent = await extractPDFText(buffer);
  } else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
    fileContent = await extractDOCXText(buffer);
  } else if (['xlsx', 'xls'].includes(ext) || mimeType.includes('spreadsheet')) {
    fileContent = await extractExcelText(buffer);
  } else {
    try {
      fileContent = buffer.toString('utf-8');
      const nullCount = (fileContent.match(/\0/g) || []).length;
      if (fileContent.length < 20 || nullCount > fileContent.length * 0.01) {
        fileContent = `[ملف غير معروف: ${fileName} (${mimeType})]`;
      }
    } catch {
      fileContent = `[ملف غير معروف: ${fileName} (${mimeType})]`;
    }
  }

  const MAX_FILE_TEXT = 30000;
  const truncated = fileContent.length > MAX_FILE_TEXT
    ? fileContent.substring(0, MAX_FILE_TEXT) + `\n\n[... تم اقتطاع المحتوى ...]`
    : fileContent;

  const analyzePrompt = userPrompt || 'حلل هذا الملف بالتفصيل';
  const aiMessages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nأنت محلل محتوى متخصص. قم بتحليل المحتوى المرفق بشكل شامل.` },
    { role: 'user', content: `📎 ملف: ${fileName}\nالنوع: ${mimeType}\n\nمحتوى الملف:\n${truncated}\n\nطلب: ${analyzePrompt}` },
  ];

  return await callZaiSDK(aiMessages, 4000);
}

// === استخراج محتوى الملفات المضغوطة ===
async function extractArchiveContent(buffer, fileName, ext) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { execSync } = require('child_process');

  const TMP_DIR = path.join(os.tmpdir(), 'wa-bot');
  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}

  const archiveDir = path.join(TMP_DIR, `archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const archivePath = path.join(TMP_DIR, `archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);

  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(archivePath, buffer);
    log(`📦 Extracting archive: ${fileName} (${ext})`);

    if (ext === 'zip') {
      try {
        execSync(`unzip -o -q "${archivePath}" -d "${archiveDir}"`, { stdio: 'ignore', timeout: 30000 });
      } catch (_) {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(archiveDir, true);
        } catch (_) {
          return `[ملف ZIP تعذّر فكه: ${fileName}]`;
        }
      }
    } else if (ext === 'rar') {
      try {
        execSync(`unrar x -o+ -y "${archivePath}" "${archiveDir}/"`, { stdio: 'ignore', timeout: 30000 });
      } catch (_) {
        return `[ملف RAR تعذّر فكه: ${fileName}]`;
      }
    } else if (ext === '7z') {
      try {
        execSync(`7z x -y -o"${archiveDir}" "${archivePath}"`, { stdio: 'ignore', timeout: 30000 });
      } catch (_) {
        return `[ملف 7z تعذّر فكه: ${fileName}]`;
      }
    } else if (['tar', 'gz', 'bz2', 'xz'].includes(ext)) {
      try {
        execSync(`tar -xf "${archivePath}" -C "${archiveDir}"`, { stdio: 'ignore', timeout: 30000 });
      } catch (_) {
        return `[ملف مضغوط تعذّر فكه: ${fileName}]`;
      }
    }

    const allFiles = walkDirectory(archiveDir);
    log(`📦 Extracted ${allFiles.length} files from ${fileName}`);

    const MAX_TOTAL_CHARS = 30000;
    let totalChars = 0;
    const fileContents = [];
    let fileIndex = 0;

    for (const filePath of allFiles) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        fileContents.push(`\n[... إجمالي الملفات: ${allFiles.length} ...]`);
        break;
      }
      const relativePath = path.relative(archiveDir, filePath);
      const fileExt = (filePath.split('.').pop() || '').toLowerCase();
      const stats = fs.statSync(filePath);

      if (stats.size > 5 * 1024 * 1024) {
        fileContents.push(`\n=== [${fileIndex + 1}] ${relativePath} ===\n[ملف كبير: ${(stats.size / 1024 / 1024).toFixed(1)}MB]`);
        fileIndex++;
        continue;
      }

      try {
        const fileBuffer = fs.readFileSync(filePath);
        let content = '';

        if (fileExt === 'pdf') {
          content = await extractPDFText(fileBuffer);
        } else if (fileExt === 'docx') {
          content = await extractDOCXText(fileBuffer);
        } else if (['xlsx', 'xls'].includes(fileExt)) {
          content = await extractExcelText(fileBuffer);
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
          content = `[ملف صورة: ${relativePath}]`;
        } else {
          try {
            content = fileBuffer.toString('utf-8');
            const nullCount = (content.match(/\0/g) || []).length;
            if (content.length < 5 || nullCount > content.length * 0.05) {
              content = `[ملف ثنائي: ${relativePath}]`;
            }
          } catch {
            content = `[ملف غير قابل للقراءة: ${relativePath}]`;
          }
        }

        if (content.length > 8000) {
          content = content.substring(0, 8000) + '\n[... اقتطاع ...]';
        }

        fileContents.push(`\n=== [${fileIndex + 1}] ${relativePath} (${stats.size} bytes) ===\n${content}`);
        totalChars += content.length;
        fileIndex++;
      } catch (e) {
        fileContents.push(`\n=== [${fileIndex + 1}] ${relativePath} ===\n[خطأ: ${String(e.message).substring(0, 60)}]`);
        fileIndex++;
      }
    }

    return `📦 محتوى الملف المضغوط: ${fileName}\nعدد الملفات: ${allFiles.length}\n\n=== بداية المحتوى ===${fileContents.join('')}\n\n=== نهاية المحتوى ===`;
  } catch (e) {
    errLog(`Archive extraction failed: ${String(e.message || e).substring(0, 100)}`);
    return `[ملف مضغوط: ${fileName} - خطأ في الاستخراج: ${String(e.message || e).substring(0, 80)}]`;
  } finally {
    try {
      if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
      if (fs.existsSync(archiveDir)) fs.rmSync(archiveDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function walkDirectory(dir) {
  const fs = require('fs');
  const path = require('path');
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(walkDirectory(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch (_) {}
  return results;
}

async function extractPDFText(buffer) {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `\n--- صفحة ${i} ---\n${pageText}\n`;
    }
    return fullText.trim() || '[PDF فارغ]';
  } catch (e) {
    return `[خطأ في قراءة PDF: ${String(e?.message || e).substring(0, 50)}]`;
  }
}

async function extractDOCXText(buffer) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || '[DOCX فارغ]';
  } catch (e) {
    return `[خطأ في قراءة DOCX: ${String(e?.message || e).substring(0, 50)}]`;
  }
}

async function extractExcelText(buffer) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allText = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      allText += `\n=== ورقة: ${sheetName} ===\n${XLSX.utils.sheet_to_csv(sheet)}\n`;
    }
    return allText.trim() || '[Excel فارغ]';
  } catch (e) {
    return `[خطأ في قراءة Excel: ${String(e?.message || e).substring(0, 50)}]`;
  }
}

// ============================
// Helpers
// ============================

function filterDuplicateReplies(messages) {
  const result = [];
  let lastAssistantReply = '';
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (m.content === lastAssistantReply) continue;
      lastAssistantReply = m.content;
    }
    result.push(m);
  }
  return result;
}

function isLoopingResponse(reply, history, threshold = 2) {
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-threshold);
  return recentAssistant.length > 0 && recentAssistant.every(m => m.content === reply);
}

// يلتقط آخر ردود المساعد لاكتشاف التكرار
async function getRecentAssistantReplies(userId, count = 3) {
  try {
    const rows = await db.message.findMany({
      where: { userId, status: 'done', role: 'assistant' },
      orderBy: { timestamp: 'desc' },
      take: count,
    });
    return rows.map(r => r.content).reverse();
  } catch (_) {
    return [];
  }
}

// يكتشف التكرار: نفس الرد بالضبط أو ردود متشابهة جداً
function isRepetitiveReply(reply, recentReplies) {
  if (!reply || !recentReplies || recentReplies.length === 0) return false;
  const normalizedReply = reply.trim().toLowerCase().substring(0, 500);
  for (const prev of recentReplies) {
    const normalizedPrev = prev.trim().toLowerCase().substring(0, 500);
    if (normalizedReply === normalizedPrev) return true;
    if (normalizedReply.length > 50 && normalizedPrev.length > 50) {
      const shorter = Math.min(normalizedReply.length, normalizedPrev.length);
      let matches = 0;
      for (let i = 0; i < shorter; i++) {
        if (normalizedReply[i] === normalizedPrev[i]) matches++;
      }
      if (matches / shorter > 0.85) return true;
    }
    if (normalizedReply.length > 100 && normalizedPrev.length > 100) {
      if (normalizedReply.substring(0, 100) === normalizedPrev.substring(0, 100)) return true;
    }
  }
  return false;
}

function userIdToPhone(userId) {
  // عكس الدالة phoneToUserId: userId = 2000000 + آخر 10 أرقام من الهاتف
  const digits = String(userId - 2000000).padStart(10, '0');
  // نحتاج الرقم الكامل بصيغة دولية - لا يمكن استرجاعه بدون تخزين منفصل
  // لذلك سنخزن رقم الهاتف في حقل آخر (imageUrl بشكل مؤقت للهواتف بدون صورة)
  return null;
}

// ============================
// Main Processing Loop
// ============================

async function processPendingMessages() {
  let pendingMessages = [];
  try {
    // ⚠️ مهم: نفلتر فقط رسائل مستخدمي واتساب (username يبدأ بـ "wa_")
    // لتفادي معالجة رسائل تيليجرام بالخطأ
    pendingMessages = await db.message.findMany({
      where: {
        status: 'pending',
        role: 'user',
        user: { username: { startsWith: 'wa_' } }
      },
      orderBy: { timestamp: 'asc' },
      take: 5,
      include: { user: true },
    });
  } catch (e) {
    errLog(`DB query error: ${String(e?.message || e).substring(0, 100)}`);
    return;
  }

  if (pendingMessages.length === 0) return;

  log(`Found ${pendingMessages.length} pending WA message(s)`);

  for (const msg of pendingMessages) {
    try {
      // user مُضمّن من الاستعلام (include: { user: true })
      const user = msg.user;

      if (!user) {
        errLog(`User not found for userId=${msg.userId}, marking message as done`);
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });
        continue;
      }

      // استخراج رقم الهاتف من username (المخزّن كـ wa_<phone>)
      const phone = user.username?.replace(/^wa_/, '') || '';
      if (!phone || !/^\d+$/.test(phone)) {
        errLog(`Invalid phone for user ${msg.userId}: "${user.username}", skipping`);
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });
        continue;
      }

      log(`Processing message from ${user.firstName} (${phone}): ${msg.content.substring(0, 60)}`);

      // جلب تاريخ المحادثة
      const allHistory = await db.message.findMany({
        where: { userId: msg.userId, status: 'done' },
        orderBy: { timestamp: 'asc' },
        take: MAX_HISTORY * 2,
        select: { role: true, content: true },
      });
      const recentHistory = filterDuplicateReplies(allHistory).slice(-MAX_HISTORY);

      // استخراج نص الرسالة الأصلي
      let text = msg.content || '';
      let hasImage = msg.fileType === 'image' && !!msg.imageUrl;
      let hasDocument = msg.fileType === 'document' && !!msg.fileName;
      let imageMediaId = msg.imageUrl || '';
      let docMediaId = msg.imageUrl || '';
      let docName = msg.fileName || '';
      let docMime = msg.mimeType || '';
      let imageMime = msg.mimeType || 'image/jpeg';

      // إزالة البادئات للعرض
      if (text.startsWith('📷 [صورة] ')) {
        text = text.replace('📷 [صورة] ', '');
      } else if (text.startsWith('📎 [ملف: ')) {
        const match = text.match(/^📎 \[ملف: [^\]]+\]\s*/);
        if (match) text = text.substring(match[0].length);
      }

      let reply;

      try {
        if (hasImage && imageMediaId) {
          const imageBuffer = await downloadMedia(imageMediaId, imageMime);
          if (!imageBuffer) {
            reply = '❌ لم أتمكن من تحميل الصورة. حاول مرة أخرى.';
          } else {
            const base64 = imageBuffer.toString('base64');
            reply = await analyzeImageWithVLM(base64, imageMime, text, recentHistory);
          }
        } else if (hasDocument && docMediaId) {
          const docBuffer = await downloadMedia(docMediaId, docMime);
          if (!docBuffer) {
            reply = '❌ لم أتمكن من تحميل الملف. حاول مرة أخرى.';
          } else {
            reply = await analyzeDocument(docBuffer, docName, docMime, text, recentHistory);
          }
        } else {
          // رد نصي عادي
          const recentReplies = await getRecentAssistantReplies(msg.userId, 3);
          const aiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recentHistory.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
          ];
          reply = await callZaiSDK(aiMessages);

          // anti-loop محسّن - يكتشف التشابه وليس فقط التطابق التام
          if (isRepetitiveReply(reply, recentReplies)) {
            log('Repetitive reply detected, regenerating with variation');
            try {
              const antiLoopMessages = [
                { role: 'system', content: SYSTEM_PROMPT + '\n\n⚠️ مهم: لا تكرر نفس الرد الذي قلته للتو. أجب بشكل مختلف تماماً وبشكل طبيعي مناسب للسياق الحالي.' },
                ...recentHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: text },
                { role: 'assistant', content: reply },
                { role: 'user', content: '⚠️ ردك السابق كان مكرراً. أجب الآن بإجابة جديدة ومختلفة تماماً ومناسبة لرسالتي.' },
              ];
              const variedReply = await callZaiSDK(antiLoopMessages);
              if (variedReply && !isRepetitiveReply(variedReply, [...recentReplies, reply])) {
                reply = variedReply;
              }
            } catch (_) {}
          }
        }
      } catch (aiErr) {
        errLog(`AI error for msg ${msg.id}: ${String(aiErr?.message || aiErr).substring(0, 150)}`);
        reply = '❌ حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى.';
      }

      // حفظ رد المساعد
      await db.message.create({
        data: {
          userId: msg.userId,
          chatId: msg.userId,
          role: 'assistant',
          content: reply,
          modelUsed: 'moodchat-wa-cloud',
          status: 'done',
        },
      });

      // تعليم رسالة المستخدم كـ "done"
      await db.message.update({
        where: { id: msg.id },
        data: { status: 'done' },
      });

      // إرسال الرد عبر WhatsApp
      try {
        await sendWhatsAppMessage(phone, reply);
        log(`✅ Replied to ${user.firstName} (${phone})`);
      } catch (sendErr) {
        errLog(`Send error to ${phone}: ${String(sendErr?.message || sendErr).substring(0, 150)}`);
      }
    } catch (msgErr) {
      errLog(`Error processing msg ${msg.id}: ${String(msgErr?.message || msgErr).substring(0, 150)}`);
      // تعليم كـ done لتفادي المعالجة المتكررة
      try {
        await db.message.update({
          where: { id: msg.id },
          data: { status: 'done' },
        });
      } catch (_) {}
    }
  }
}

// ============================
// Main Loop
// ============================

async function main() {
  log('🚀 WhatsApp Worker started');
  log(`Database: ${DATABASE_URL.substring(0, 50)}...`);
  log(`Phone Number ID: ${WA_PHONE_NUMBER_ID}`);

  // تحديث نبضة الحياة
  try {
    await db.botConfig.upsert({
      where: { key: 'wa_worker_started_at' },
      update: { value: new Date().toISOString() },
      create: { key: 'wa_worker_started_at', value: new Date().toISOString() },
    });
  } catch (_) {}

  // الحلقة الرئيسية
  while (true) {
    try {
      await processPendingMessages();
    } catch (e) {
      errLog(`Main loop error: ${String(e?.message || e).substring(0, 150)}`);
    }

    // تحديث نبضة الحياة كل ~30 ثانية
    try {
      const now = Date.now();
      if (now % 30000 < POLL_INTERVAL_MS) {
        await db.botConfig.upsert({
          where: { key: 'wa_worker_heartbeat' },
          update: { value: new Date().toISOString() },
          create: { key: 'wa_worker_heartbeat', value: new Date().toISOString() },
        });
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// تشغيل
main().catch(e => {
  errLog('Fatal error:', e);
  process.exit(1);
});

// التعامل مع الإشارات
process.on('SIGINT', () => {
  log('Received SIGINT, exiting...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('Received SIGTERM, exiting...');
  process.exit(0);
});
process.on('unhandledRejection', (reason) => {
  errLog('Unhandled Rejection:', String(reason).substring(0, 200));
});
