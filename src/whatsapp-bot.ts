/**
 * WhatsApp Bot - MoodChat (مود شات)
 * يعمل باستخدام Baileys (WhatsApp Web API غير الرسمي)
 *
 * المميزات:
 * 1. ربط واتساب عبر QR Code
 * 2. ردود ذكية باستخدام Z-AI SDK (نفس نظام مود شات)
 * 3. تحليل الصور باستخدام VLM
 * 4. تحليل الملفات (PDF, DOCX, Excel, نص)
 * 5. حفظ الرسائل في نفس قاعدة بيانات تيليجرام
 * 6. نظام موافقة المستخدمين (مثل تيليجرام)
 * 7. أوامر إدارية (/approve, /block, /stats)
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

// ============================
// Configuration
// ============================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '970599123456'; // ضع رقمك هنا بصيغة دولية بدون +
const JOIN_PASSWORD = process.env.JOIN_PASSWORD || 'MOOD2026';
const MAX_HISTORY = 20;

// Z-AI SDK Config (نفس إعدادات تيليجرام)
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

// Database
const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

// ============================
// System Prompts
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
        console.log(`[WA-Bot] Z-AI rate limited, retrying in ${Math.round(delay)}ms...`);
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
// WhatsApp Connection
// ============================

let sock: WASocket | null = null;
let isReady = false;

async function startWhatsAppBot() {
  console.log('\n========================================');
  console.log('  مود شات - WhatsApp Bot');
  console.log('  الذكاء الاصطناعي: GLM-4 Plus');
  console.log('========================================\n');

  // اختبار قاعدة البيانات
  try {
    await db.$queryRaw`SELECT 1`;
    console.log('[WA-Bot] ✅ Database connection: OK');
  } catch (err: any) {
    console.error(`[WA-Bot] ❌ Database FAILED: ${err?.message?.substring(0, 80)}`);
    process.exit(1);
  }

  // اختبار Z-AI SDK
  try {
    console.log('[WA-Bot] Testing Z-AI SDK...');
    const testReply = await callZaiSDK([{ role: 'user', content: 'say ok' }]);
    console.log(`[WA-Bot] ✅ Z-AI SDK: OK (${testReply.substring(0, 30)})`);
  } catch (err: any) {
    console.error(`[WA-Bot] ❌ Z-AI SDK FAILED: ${err?.message?.substring(0, 80)}`);
  }

  // إعداد حالة المصادقة
  const { state, saveCreds } = await useMultiFileAuthState('./whatsapp-session');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['MoodChat Bot', 'Chrome', '1.0.0'],
  });

  // عرض QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n');
      console.log('═══════════════════════════════════════════════');
      console.log('  📱 امسح QR Code بتطبيق واتساب على هاتفك');
      console.log('  الإعدادات → الأجهزة المرتبطة → ربط جهاز');
      console.log('═══════════════════════════════════════════════');
      console.log('\n');

      // حفظ QR Code كصورة PNG لسهولة المسح
      try {
        const qrImagePath = '/home/z/my-project/download/whatsapp-qr.png';
        await QRCode.toFile(qrImagePath, qr, {
          width: 800,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        console.log(`📸 تم حفظ QR Code كصورة: ${qrImagePath}`);
        console.log('   افتح الصورة على هاتفك أو شاشة أكبر وامسحها بواسطة واتساب\n');
      } catch (err) {
        console.log('⚠️ تعذر حفظ صورة QR، استخدم QR المطبوع في الطرفية');
      }

      // عرض QR في الطرفية أيضاً
      qrcode.generate(qr, { small: true });
      console.log('\n⏳ في انتظار المسح...\n');

      // حفظ QR string في قاعدة البيانات لعرضه في اللوحة
      try {
        await db.botConfig.upsert({
          where: { key: 'wa_qr_code' },
          update: { value: qr },
          create: { key: 'wa_qr_code', value: qr },
        });
      } catch {}
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA-Bot] ❌ Connection closed (code ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(() => startWhatsAppBot(), 3000);
      }
    } else if (connection === 'open') {
      console.log('\n');
      console.log('═══════════════════════════════════════════════');
      console.log('  ✅ تم ربط واتساب بنجاح!');
      console.log('  🤖 مود شات جاهز لاستقبال الرسائل');
      console.log('═══════════════════════════════════════════════');
      console.log('\n');
      isReady = true;
      // حفظ حالة الجاهزية وحذف QR
      try {
        await db.botConfig.upsert({
          where: { key: 'wa_bot_ready' },
          update: { value: 'true' },
          create: { key: 'wa_bot_ready', value: 'true' },
        });
        await db.botConfig.deleteMany({ where: { key: 'wa_qr_code' } });
      } catch {}
    }
  });

  // حفظ بيانات المصادقة
  sock.ev.on('creds.update', saveCreds);

  // استقبال الرسائل
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      try {
        await handleMessage(msg);
      } catch (err: any) {
        console.error(`[WA-Bot] Error handling message: ${err?.message?.substring(0, 100)}`);
      }
    }
  });

  return sock;
}

// ============================
// Message Handler
// ============================

function getPhoneNumber(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

function phoneToUserId(phone: string): number {
  // تحويل رقم الهاتف إلى userId رقمي (للدمج مع نظام تيليجرام)
  // نضيف 1 مليون لتفادي التعارض مع Telegram IDs
  const digits = phone.replace(/\D/g, '').slice(-10);
  return 1000000 + parseInt(digits, 10);
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
      isApproved: phone === ADMIN_PHONE, // المدير معتمد تلقائياً
    },
  });
  return user;
}

async function handleMessage(msg: proto.IWebMessageInfo) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid!;
  if (!jid.endsWith('@s.whatsapp.net')) return; // فقط الرسائل الخاصة (ليست مجموعات)

  const phone = getPhoneNumber(jid);
  const senderName = msg.pushName || phone;
  const user = await getOrCreateUser(phone, senderName);

  // استخراج نوع المحتوى والنص
  let text = '';
  let hasImage = false;
  let imageBuffer: Buffer | null = null;
  let imageMimeType = 'image/jpeg';
  let hasDocument = false;
  let docBuffer: Buffer | null = null;
  let docName = '';
  let docMime = '';

  if (msg.message.conversation) {
    text = msg.message.conversation;
  } else if (msg.message.extendedTextMessage) {
    text = msg.message.extendedTextMessage.text || '';
  } else if (msg.message.imageMessage) {
    text = msg.message.imageMessage.caption || '';
    hasImage = true;
    imageMimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
  } else if (msg.message.documentMessage) {
    text = '';
    hasDocument = true;
    docName = msg.message.documentMessage.fileName || 'document';
    docMime = msg.message.documentMessage.mimetype || 'application/octet-stream';
  } else if (msg.message.videoMessage) {
    text = msg.message.videoMessage.caption || '🎥 [فيديو]';
  } else if (msg.message.audioMessage) {
    text = '🎤 [رسالة صوتية]';
  } else if (msg.message.stickerMessage) {
    text = '🎭 [ملصق]';
  } else {
    // نوع غير مدعوم
    return;
  }

  console.log(`[WA-Bot] 📩 من ${senderName} (${phone}): ${text.substring(0, 80) || '[صورة/ملف]'}`);

  // فحص الحظر
  if (user.isBlocked) {
    await sock!.sendMessage(jid, { text: '🚫 تم حظرك من استخدام هذا البوت.' });
    return;
  }

  // فحص الموافقة (إلا المدير)
  if (!user.isApproved && phone !== ADMIN_PHONE) {
    // التحقق من كلمة المرور
    if (text.trim().toUpperCase() === JOIN_PASSWORD) {
      await db.telegramUser.update({
        where: { userId: user.userId },
        data: { isApproved: true, approvedAt: new Date() },
      });
      await sock!.sendMessage(jid, {
        text: '✅ تمت الموافقة على انضمامك!\n\nمرحباً بك في مود شات - مساعدك الذكي الخبير في كل المجالات.\nكيف يمكنني مساعدتك اليوم؟',
      });
      return;
    } else {
      await sock!.sendMessage(jid, {
        text: '🔐 هذا البوت خاص ويحتاج كلمة مرور للانضمام.\n\nأرسل كلمة المرور للمتابعة.',
      });
      return;
    }
  }

  // أوامر المدير
  if (phone === ADMIN_PHONE) {
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
      await sock!.sendMessage(jid, { text: reply });
      return;
    }

    if (text.startsWith('/approve ')) {
      const targetPhone = text.split(' ')[1];
      const targetUserId = phoneToUserId(targetPhone);
      try {
        await db.telegramUser.update({
          where: { userId: targetUserId },
          data: { isApproved: true, approvedAt: new Date() },
        });
        await sock!.sendMessage(jid, { text: `✅ تمت الموافقة على المستخدم: ${targetPhone}` });
      } catch {
        await sock!.sendMessage(jid, { text: `❌ المستخدم غير موجود: ${targetPhone}` });
      }
      return;
    }

    if (text.startsWith('/block ')) {
      const targetPhone = text.split(' ')[1];
      const targetUserId = phoneToUserId(targetPhone);
      try {
        await db.telegramUser.update({
          where: { userId: targetUserId },
          data: { isBlocked: true },
        });
        await sock!.sendMessage(jid, { text: `🚫 تم حظر المستخدم: ${targetPhone}` });
      } catch {
        await sock!.sendMessage(jid, { text: `❌ المستخدم غير موجود: ${targetPhone}` });
      }
      return;
    }
  }

  // إرسال "يكتب..."
  await sock!.sendPresenceUpdate('composing', jid);

  // حفظ رسالة المستخدم
  const userMsg = await db.message.create({
    data: {
      userId: user.userId,
      chatId: user.userId,
      role: 'user',
      content: hasImage ? `📷 [صورة] ${text}`.trim() : hasDocument ? `📎 [ملف: ${docName}] ${text}`.trim() : text,
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
    if (hasImage) {
      // تحميل الصورة
      const buffer = await downloadMediaMessage(msg, 'image');
      if (!buffer) {
        reply = '❌ لم أتمكن من تحميل الصورة. حاول مرة أخرى.';
      } else {
        const base64 = buffer.toString('base64');
        reply = await analyzeImageWithVLM(base64, imageMimeType, text, recentHistory);
      }
    } else if (hasDocument) {
      const buffer = await downloadMediaMessage(msg, 'document');
      if (!buffer) {
        reply = '❌ لم أتمكن من تحميل الملف. حاول مرة أخرى.';
      } else {
        reply = await analyzeDocument(buffer, docName, docMime, text, recentHistory);
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
        console.log(`[WA-Bot] ⚠️ Loop detected! Retrying with variation...`);
        const antiLoopMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
          { role: 'assistant', content: reply },
          { role: 'user', content: '⚠️ لا تكرر نفس الرد السابق. أجب بشكل مختلف ومناسب لسؤالي.' },
        ];
        const variedReply = await callZaiSDK(antiLoopMessages);
        if (variedReply !== reply) reply = variedReply;
      }
    }
  } catch (err: any) {
    console.error(`[WA-Bot] AI error: ${err?.message?.substring(0, 100)}`);
    reply = '❌ حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى.';
  }

  // حفظ رد المساعد
  await db.message.create({
    data: {
      userId: user.userId,
      chatId: user.userId,
      role: 'assistant',
      content: reply,
      modelUsed: 'moodchat-wa',
      status: 'done',
    },
  });

  // إرسال الرد (مع تقسيم الرسائل الطويلة)
  await sendLongMessage(jid, reply);
  console.log(`[WA-Bot] ✅ تم الرد على ${senderName}`);
}

// ============================
// Media Download Helper
// ============================

async function downloadMediaMessage(msg: proto.IWebMessageInfo, type: 'image' | 'document' | 'video' | 'audio'): Promise<Buffer | null> {
  try {
    if (!sock) return null;
    const result: any = await (sock as any).downloadMediaMessage(msg);
    if (!result) return null;
    if (Buffer.isBuffer(result)) return result;
    if (result instanceof Uint8Array) return Buffer.from(result);
    if (result instanceof ArrayBuffer) return Buffer.from(result);
    return Buffer.from(result);
  } catch (err: any) {
    console.error(`[WA-Bot] Media download error: ${err?.message?.substring(0, 80)}`);
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

  // إذا كانت صورة مرسلة كمستند
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  if (imageExts.includes(ext) || mimeType.startsWith('image/')) {
    const base64 = buffer.toString('base64');
    return await analyzeImageWithVLM(base64, mimeType, userPrompt, history);
  }

  // استخراج النص من الملف
  let fileContent = '';
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    fileContent = await extractPDFText(buffer);
  } else if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
    fileContent = await extractDOCXText(buffer);
  } else if (['xlsx', 'xls'].includes(ext) || mimeType.includes('spreadsheet')) {
    fileContent = await extractExcelText(buffer);
  } else {
    // محاولة قراءة كنص
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

const MAX_MSG_LEN = 3800;

async function sendLongMessage(jid: string, text: string) {
  if (text.length <= MAX_MSG_LEN) {
    await sock!.sendMessage(jid, { text });
    return;
  }

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

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    if (chunks.length > 1) {
      chunkText = `[${i + 1}/${chunks.length}]\n${chunkText}`;
    }
    await sock!.sendMessage(jid, { text: chunkText });
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ============================
// Main
// ============================

async function main() {
  await startWhatsAppBot();

  // نبضة حياة كل 30 ثانية
  setInterval(async () => {
    try {
      await db.botConfig.upsert({
        where: { key: 'wa_bot_heartbeat' },
        update: { value: new Date().toISOString() },
        create: { key: 'wa_bot_heartbeat', value: new Date().toISOString() },
      });
    } catch {}
  }, 30000);

  // إيقاف آمن
  const shutdown = async (signal: string) => {
    console.log(`\n[WA-Bot] Received ${signal}, shutting down...`);
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.stdin.resume();
}

main().catch(err => {
  console.error('[WA-Bot] Fatal error:', err);
  process.exit(1);
});
