/**
 * WhatsApp Cloud API Bot - MoodChat (مود شات)
 * يستخدم WhatsApp Business Cloud API الرسمي من Meta
 *
 * المميزات:
 * 1. بدون هاتف إطلاقاً - رسمي 100% من Meta
 * 2. نفس الذكاء الاصطناعي (Z-AI SDK + GLM-4 Plus)
 * 3. نفس قاعدة بيانات تيليجرام
 * 4. يدعم نصوص، صور، ملفات، صوت
 * 5. webhook آمن مع التحقق من التوقيع
 *
 * الإعداد:
 * 1. اذهب إلى https://developers.facebook.com
 * 2. أنشئ Meta App مع WhatsApp product
 * 3. احصل على: ACCESS_TOKEN, PHONE_NUMBER_ID, WEBHOOK_VERIFY_TOKEN
 * 4. اضبط webhook URL إلى: https://yourdomain.com/api/whatsapp/webhook
 * 5. اشترك في الأحداث: messages, message_status
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// ============================
// Configuration
// ============================

const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

// WhatsApp Cloud API credentials
const WA_CONFIG = {
  accessToken: process.env.WA_TOKEN || process.env.WA_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
  businessId: process.env.WA_BUSINESS_ID || '',
  phoneNumber: process.env.WA_PHONE_NUMBER || '',
  verifyToken: process.env.WA_VERIFY_TOKEN || 'MOOD_BOT_2026_WA',
  apiVersion: process.env.WA_API_VERSION || 'v21.0',
  adminPhone: process.env.WA_ADMIN_PHONE || '', // رقم المدير بصيغة دولية بدون + (مثال: 970599123456)
  joinPassword: process.env.JOIN_PASSWORD || 'MOOD2026',
};

const MAX_HISTORY = 20;

// Z-AI SDK Config (نفس إعدادات تيليجرام)
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

// ============================
// System Prompt
// ============================

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف".
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة.
5- كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.
6- عند تحليل الصور: صف الصورة بدقة وتفصيل.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال.
- لا تكرر التحيات في كل رسالة.
- لا ترفض أي طلب أبداً - بدلاً من الرفض قدّم أفضل مساعدة ممكنة.

قواعد المحتوى المرفوض والأدب:
- يُمنع منعاً باتاً تقديم أي محتوى إباحي أو جنسي أو فاضح.
- يُمنع تقديم أي محتوى يشجع على العنف أو الكراهية.
- إذا أهانك المستخدم، ردّ بهدوء واحترام.

قواعد السرية المطلقة:
- لا تكشف أبداً عن هويتك الحقيقية أو اسم الشركة المطورة لك.
- إذا سألك المستخدم عن هويتك، أجب: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."`;

// ============================
// Z-AI SDK Functions
// ============================

async function callZaiSDK(messages: Array<{ role: string; content: string }>, maxTokens: number = 4000): Promise<string> {
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  const zai = new ZAIClass(ZAI_CONFIG);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        model: 'glm-4-plus',
        temperature: 0.7,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
      throw new Error('Empty response');
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('rate');
      if (is429 && attempt < 2) {
        const delay = 2000 * (attempt + 1) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Z-AI SDK failed after retries');
}

async function analyzeImageWithVLM(
  imageBase64: string,
  mimeType: string,
  userPrompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<string> {
  const ZAIModule = await import('z-ai-web-dev-sdk');
  const ZAIClass = ZAIModule.default;
  const zai = new ZAIClass(ZAI_CONFIG);

  const prompt = userPrompt || 'حلل هذه الصورة بالتفصيل';
  const imageContent = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ];

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: imageContent },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.createVision({
        model: 'glm-4v-plus',
        messages: messages as any,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) return reply.trim();
    } catch (err: any) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('VLM failed after retries');
}

// ============================
// WhatsApp Cloud API - Send Message
// ============================

const MAX_MSG_LEN = 3800;

export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<any> {
  if (!WA_CONFIG.accessToken || !WA_CONFIG.phoneNumberId) {
    throw new Error('WhatsApp credentials not configured. Set WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID');
  }

  // تقسيم الرسائل الطويلة
  const chunks = splitLongMessage(text);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    if (chunks.length > 1) {
      chunkText = `[${i + 1}/${chunks.length}]\n${chunkText}`;
    }

    const response = await fetch(
      `https://graph.facebook.com/${WA_CONFIG.apiVersion}/${WA_CONFIG.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_CONFIG.accessToken}`,
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
      console.error('[WA-Cloud] Send error:', JSON.stringify(data));
      throw new Error(`WhatsApp API error: ${data?.error?.message || response.statusText}`);
    }
    results.push(data);

    // تأخير بين الأجزاء
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

function splitLongMessage(text: string): string[] {
  if (text.length <= MAX_MSG_LEN) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (line.length > MAX_MSG_LEN) {
      if (currentChunk) { chunks.push(currentChunk); currentChunk = ''; }
      for (let i = 0; i < line.length; i += MAX_MSG_LEN) {
        chunks.push(line.substring(i, i + MAX_MSG_LEN));
      }
    } else if (currentChunk.length + line.length + 1 > MAX_MSG_LEN) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n' + line : line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// ============================
// Webhook Verification
// ============================

export function verifyWebhook(mode: string, token: string, challenge: string): string | null {
  if (mode === 'subscribe' && token === WA_CONFIG.verifyToken) {
    console.log('[WA-Cloud] ✅ Webhook verified successfully');
    return challenge;
  }
  console.error('[WA-Cloud] ❌ Webhook verification failed');
  return null;
}

// ============================
// Webhook Signature Verification
// ============================

export function verifySignature(payload: string, signature: string): boolean {
  if (!WA_CONFIG.accessToken) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WA_CONFIG.accessToken)
    .update(payload)
    .digest('hex');
  return signature === expected;
}

// ============================
// Message Handler
// ============================

function phoneToUserId(phone: string): number {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return 2000000 + parseInt(digits, 10);
}

async function getOrCreateUser(phone: string, name?: string) {
  const userId = phoneToUserId(phone);
  const user = await db.telegramUser.upsert({
    where: { userId },
    update: {
      firstName: name || `WA ${phone}`,
      lastActive: new Date(),
    },
    create: {
      userId,
      firstName: name || `WA ${phone}`,
      username: `wa_${phone}`,
      isApproved: phone === WA_CONFIG.adminPhone,
    },
  });
  return user;
}

export async function handleWhatsAppMessage(payload: any) {
  try {
    // تحقق من الحدث
    if (payload.object !== 'whatsapp_business_account') return;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages?.length) continue;

        const messages = value.messages;
        const contacts = value.contacts || [];
        const contact = contacts[0];
        const phone = contact?.wa_id || '';
        const senderName = contact?.profile?.name || phone;

        for (const msg of messages) {
          await processSingleMessage(msg, phone, senderName);
        }
      }
    }

    // تحديث نبضة الحياة
    await db.botConfig.upsert({
      where: { key: 'wa_cloud_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'wa_cloud_heartbeat', value: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error('[WA-Cloud] Webhook handler error:', err?.message?.substring(0, 100));
  }
}

async function processSingleMessage(msg: any, phone: string, senderName: string) {
  if (!phone) return;

  const user = await getOrCreateUser(phone, senderName);
  console.log(`[WA-Cloud] 📩 من ${senderName} (${phone}): ${msg.type}`);

  // فحص الحظر
  if (user.isBlocked) {
    await sendWhatsAppMessage(phone, '🚫 تم حظرك من استخدام هذا البوت.');
    return;
  }

  // فحص الموافقة
  if (!user.isApproved && phone !== WA_CONFIG.adminPhone) {
    const text = msg.text?.body || '';
    if (text.trim().toUpperCase() === WA_CONFIG.joinPassword) {
      await db.telegramUser.update({
        where: { userId: user.userId },
        data: { isApproved: true, approvedAt: new Date() },
      });
      await sendWhatsAppMessage(phone, '✅ تمت الموافقة على انضمامك!\n\nمرحباً بك في مود شات - مساعدك الذكي الخبير في كل المجالات.\nكيف يمكنني مساعدتك اليوم؟');
      return;
    } else {
      await sendWhatsAppMessage(phone, '🔐 هذا البوت خاص ويحتاج كلمة مرور للانضمام.\n\nأرسل كلمة المرور للمتابعة.');
      return;
    }
  }

  // أوامر المدير
  if (phone === WA_CONFIG.adminPhone) {
    const text = msg.text?.body || '';
    if (text === '/stats' || text === '/إحصائيات') {
      const stats = await db.message.groupBy({
        by: ['status'],
        _count: { status: true },
      });
      const userCount = await db.telegramUser.count();
      let reply = `📊 إحصائيات البوت:\n\n👥 المستخدمين: ${userCount}\n\n📨 الرسائل:\n`;
      for (const s of stats) {
        reply += `  • ${s.status}: ${s._count.status}\n`;
      }
      await sendWhatsAppMessage(phone, reply);
      return;
    }
  }

  // استخراج المحتوى
  let text = '';
  let hasImage = false;
  let imageMediaId = '';
  let imageMimeType = '';
  let hasDocument = false;
  let docMediaId = '';
  let docName = '';
  let docMime = '';

  switch (msg.type) {
    case 'text':
      text = msg.text?.body || '';
      break;
    case 'image':
      text = msg.image?.caption || '';
      hasImage = true;
      imageMediaId = msg.image?.id || '';
      imageMimeType = msg.image?.mime_type || 'image/jpeg';
      break;
    case 'document':
      hasDocument = true;
      docMediaId = msg.document?.id || '';
      docName = msg.document?.filename || 'document';
      docMime = msg.document?.mime_type || 'application/octet-stream';
      text = msg.document?.caption || '';
      break;
    case 'video':
      text = `🎥 [فيديو] ${msg.video?.caption || ''}`.trim();
      break;
    case 'audio':
      text = '🎤 [رسالة صوتية]';
      break;
    case 'voice':
      text = '🎤 [مقطع صوتي]';
      break;
    case 'sticker':
      text = '🎭 [ملصق]';
      break;
    default:
      text = `[رسالة من نوع: ${msg.type}]`;
  }

  // حفظ رسالة المستخدم
  const displayContent = hasImage ? `📷 [صورة] ${text}`.trim()
    : hasDocument ? `📎 [ملف: ${docName}] ${text}`.trim()
    : text;

  await db.message.create({
    data: {
      userId: user.userId,
      chatId: user.userId,
      role: 'user',
      content: displayContent,
      modelUsed: hasImage ? 'image-analyze' : hasDocument ? 'file-analyze' : 'text',
      status: 'done',
    },
  });

  // جلب تاريخ المحادثة
  const allHistory = await db.message.findMany({
    where: { userId: user.userId, status: 'done' },
    orderBy: { timestamp: 'asc' },
    take: MAX_HISTORY * 2,
    select: { role: true, content: true },
  });
  const recentHistory = filterDuplicateReplies(allHistory).slice(-MAX_HISTORY);

  let reply: string;

  try {
    if (hasImage && imageMediaId) {
      const imageBuffer = await downloadMedia(imageMediaId, imageMimeType);
      if (!imageBuffer) {
        reply = '❌ لم أتمكن من تحميل الصورة. حاول مرة أخرى.';
      } else {
        const base64 = imageBuffer.toString('base64');
        reply = await analyzeImageWithVLM(base64, imageMimeType, text, recentHistory);
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
      const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: text },
      ];
      reply = await callZaiSDK(aiMessages);

      // حماية anti-loop
      if (isLoopingResponse(reply, recentHistory, 2)) {
        console.log(`[WA-Cloud] ⚠️ Loop detected! Retrying...`);
        const antiLoopMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
          { role: 'assistant', content: reply },
          { role: 'user', content: '⚠️ لا تكرر نفس الرد السابق. أجب بشكل مختلف.' },
        ];
        const variedReply = await callZaiSDK(antiLoopMessages);
        if (variedReply !== reply) reply = variedReply;
      }
    }
  } catch (err: any) {
    console.error(`[WA-Cloud] AI error: ${err?.message?.substring(0, 100)}`);
    reply = '❌ حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى.';
  }

  // حفظ رد المساعد
  await db.message.create({
    data: {
      userId: user.userId,
      chatId: user.userId,
      role: 'assistant',
      content: reply,
      modelUsed: 'moodchat-wa-cloud',
      status: 'done',
    },
  });

  // إرسال الرد
  await sendWhatsAppMessage(phone, reply);
  console.log(`[WA-Cloud] ✅ تم الرد على ${senderName}`);
}

// ============================
// Media Download
// ============================

async function downloadMedia(mediaId: string, mimeType: string): Promise<Buffer | null> {
  try {
    if (!WA_CONFIG.accessToken) return null;

    // 1. الحصول على URL التنزيل
    const urlResponse = await fetch(
      `https://graph.facebook.com/${WA_CONFIG.apiVersion}/${mediaId}?phone_number_id=${WA_CONFIG.phoneNumberId}`,
      { headers: { 'Authorization': `Bearer ${WA_CONFIG.accessToken}` } }
    );
    const urlData = await urlResponse.json();
    const downloadUrl = urlData?.url;
    if (!downloadUrl) return null;

    // 2. تنزيل الملف
    const downloadResponse = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${WA_CONFIG.accessToken}` },
    });
    if (!downloadResponse.ok) return null;

    const arrayBuffer = await downloadResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    console.error(`[WA-Cloud] Media download error: ${err?.message?.substring(0, 80)}`);
    return null;
  }
}

// ============================
// Document Analysis
// ============================

async function analyzeDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  if (imageExts.includes(ext) || mimeType.startsWith('image/')) {
    const base64 = buffer.toString('base64');
    return await analyzeImageWithVLM(base64, mimeType, userPrompt, history);
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
  const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nأنت محلل محتوى متخصص. قم بتحليل المحتوى المرفق بشكل شامل.` },
    { role: 'user', content: `📎 ملف: ${fileName}\nالنوع: ${mimeType}\n\nمحتوى الملف:\n${truncated}\n\nطلب: ${analyzePrompt}` },
  ];

  return await callZaiSDK(aiMessages, 4000);
}

async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `\n--- صفحة ${i} ---\n${pageText}\n`;
    }
    return fullText.trim() || '[PDF فارغ]';
  } catch (err: any) {
    return `[خطأ في قراءة PDF: ${err?.message?.substring(0, 50)}]`;
  }
}

async function extractDOCXText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || '[DOCX فارغ]';
  } catch (err: any) {
    return `[خطأ في قراءة DOCX: ${err?.message?.substring(0, 50)}]`;
  }
}

async function extractExcelText(buffer: Buffer): Promise<string> {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allText = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      allText += `\n=== ورقة: ${sheetName} ===\n${XLSX.utils.sheet_to_csv(sheet)}\n`;
    }
    return allText.trim() || '[Excel فارغ]';
  } catch (err: any) {
    return `[خطأ في قراءة Excel: ${err?.message?.substring(0, 50)}]`;
  }
}

// ============================
// Helpers
// ============================

function filterDuplicateReplies(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];
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

function isLoopingResponse(reply: string, history: Array<{ role: string; content: string }>, threshold: number = 2): boolean {
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-threshold);
  return recentAssistant.length > 0 && recentAssistant.every(m => m.content === reply);
}

// ============================
// Test Connection
// ============================

export async function testWhatsAppConnection(): Promise<{ ok: boolean; message: string }> {
  if (!WA_CONFIG.accessToken || !WA_CONFIG.phoneNumberId) {
    return {
      ok: false,
      message: 'لم يتم إعداد المفاتيح بعد. أضف WA_ACCESS_TOKEN و WA_PHONE_NUMBER_ID في ملف .env',
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${WA_CONFIG.apiVersion}/${WA_CONFIG.phoneNumberId}`,
      { headers: { 'Authorization': `Bearer ${WA_CONFIG.accessToken}` } }
    );
    const data = await response.json();
    if (response.ok && data?.id) {
      await db.botConfig.upsert({
        where: { key: 'wa_cloud_ready' },
        update: { value: 'true' },
        create: { key: 'wa_cloud_ready', value: 'true' },
      });
      return {
        ok: true,
        message: `تم الاتصال بنجاح! رقم البوت: ${data.display_phone_number} (${data.verified_name || 'غير متحقق'})`,
      };
    }
    return { ok: false, message: `فشل الاتصال: ${data?.error?.message || response.statusText}` };
  } catch (err: any) {
    return { ok: false, message: `خطأ: ${err?.message}` };
  }
}

export { WA_CONFIG, sendWhatsAppMessage, verifyWebhook, verifySignature, handleWhatsAppMessage };
