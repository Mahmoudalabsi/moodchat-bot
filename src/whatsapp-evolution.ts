/**
 * Evolution API Client for MoodChat WhatsApp Bot
 * Replaces Meta Cloud API with self-hosted Evolution API
 *
 * Key endpoints used:
 * - POST /instance/create           → create instance
 * - POST /instance/connect/{name}   → connect instance (returns QR)
 * - POST /message/sendText/{name}   → send text message
 * - POST /message/sendMedia/{name}  → send media (image/audio/document)
 * - GET  /instance/fetchInstances   → list instances & connection state
 * - DELETE /instance/logout/{name}  → disconnect
 *
 * Webhook events received on our /api/whatsapp/webhook:
 * - MESSAGES_UPSERT  → new message arrived
 * - CONNECTION_UPDATE → qr/update/connected/disconnected
 */

import { PrismaClient } from '@prisma/client';

const EVO_BASE_URL = process.env.EVO_API_URL || 'http://localhost:8084';
const EVO_API_KEY = process.env.EVO_API_KEY || '04623565e9bb5e88af74758bd9db9acd';
const EVO_INSTANCE_NAME = process.env.EVO_INSTANCE_NAME || 'moodchat';

// Prisma client pointing to the same DB as Telegram bot (public schema)
const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

// Z-AI SDK Config (same as Telegram bot)
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

const WA_CONFIG = {
  adminPhone: process.env.WA_ADMIN_PHONE || '', // رقم المدير بصيغة دولية بدون + (مثال: 970593265926)
  joinPassword: process.env.JOIN_PASSWORD || 'MOOD2026',
  instanceName: EVO_INSTANCE_NAME,
};

const MAX_HISTORY = 20;
const MAX_MSG_LEN = 3800;

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
- لا تكرّر تعريف بنفسك في كل رسالة — عرّف نفسك فقط لو سُئلت صراحة "من أنت؟".
- عندما يقول المستخدم كلمة ترحيب قصيرة مثل "هلا" أو "مرحبا"، رُد بترحيب قصير طبيعي وسل كيف يمكن المساعدة، ولا تذكر تعريف نفسك.

قواعد المحتوى المرفوض والأدب:
- لا ترد على أي طلب يطلب إضرار بشخص أو جهة.
- لا تكتب محتوى عنصري أو طائفي أو سياسي حساس.
- لا تكتب محتوى جنسي أو غير لائق.
- عند رفض طلب، اعتذر بلطف واشرح السبب بإيجاز.

قواعد السرية:
- لا تكشف أبداً عن هويتك الحقيقية أو اسم الشركة المطورة لك.
- إذا سُئلت من أنت، أجب: "أنا مود شات، مساعدك الذكي الخبير في كل المجالات."

عندما يقدم لك المستخدم نتائج من بحث ويب أو محتوى من صفحة ويب، استخدمها لإجابة محدثة ودقيقة، واذكر المصدر بصيغة "📚 المصدر: example.com".`;

// ============================================================
// Instance Management
// ============================================================

export async function ensureInstance() {
  // 1. Check if instance exists
  const listRes = await fetch(`${EVO_BASE_URL}/instance/fetchInstances`, {
    headers: {
      'apikey': EVO_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!listRes.ok) {
    throw new Error(`Failed to fetch instances: ${listRes.status}`);
  }

  const instances = await listRes.json();
  const exists = Array.isArray(instances) && instances.some((i: any) =>
    i.name === WA_CONFIG.instanceName || i.instance?.instanceName === WA_CONFIG.instanceName
  );

  if (!exists) {
    console.log(`[WA-Evo] Creating instance: ${WA_CONFIG.instanceName}`);
    const createRes = await fetch(`${EVO_BASE_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'apikey': EVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceName: WA_CONFIG.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: `http://localhost:3000/api/whatsapp/webhook`,
          byEvents: true,
          base64: true,
          events: [
            'APPLICATION_STARTUP',
            'QRCODE_UPDATED',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'CONTACTS_UPSERT',
            'SEND_MESSAGE',
          ],
        },
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`Failed to create instance: ${createRes.status} - ${errBody.substring(0, 200)}`);
    }
    console.log(`[WA-Evo] ✅ Instance created`);
  }

  // 2. Connect instance → returns QR code if not authenticated (GET request)
  const connectRes = await fetch(`${EVO_BASE_URL}/instance/connect/${WA_CONFIG.instanceName}`, {
    method: 'GET',
    headers: {
      'apikey': EVO_API_KEY,
    },
  });

  if (!connectRes.ok) {
    const errBody = await connectRes.text();
    throw new Error(`Failed to connect: ${connectRes.status} - ${errBody.substring(0, 200)}`);
  }

  const connectData = await connectRes.json();
  return connectData; // contains { code, base64 } if not yet authenticated, or { } if already connected
}

export async function fetchInstanceState() {
  const listRes = await fetch(`${EVO_BASE_URL}/instance/fetchInstances`, {
    headers: {
      'apikey': EVO_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!listRes.ok) return null;

  const instances = await listRes.json();
  if (!Array.isArray(instances)) return null;

  return instances.find((i: any) =>
    i.instance?.instanceName === WA_CONFIG.instanceName
  ) || null;
}

// ============================================================
// Send Messages
// ============================================================

export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<any> {
  // Normalize phone number: strip @s.whatsapp.net, +, spaces, dashes
  const cleanPhone = phoneNumber.replace(/[@\s.\-+]/g, '').replace(/swhatsappnet$/i, '');

  // Split long messages
  const chunks = splitLongMessage(text);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    if (chunks.length > 1) {
      chunkText = `[${i + 1}/${chunks.length}]\n${chunkText}`;
    }

    const res = await fetch(`${EVO_BASE_URL}/message/sendText/${WA_CONFIG.instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': EVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: chunkText,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WA-Evo] Send error:', JSON.stringify(data).substring(0, 200));
      throw new Error(`Evolution API error: ${data?.message || data?.error || res.statusText}`);
    }
    results.push(data);

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

export async function sendWhatsAppMedia(phoneNumber: string, mediaUrl: string, caption: string, mediaType: 'image' | 'audio' | 'document') {
  const cleanPhone = phoneNumber.replace(/[@\s.\-+]/g, '').replace(/swhatsappnet$/i, '');
  const endpoint = mediaType === 'image' ? 'sendMedia' : mediaType === 'audio' ? 'sendAudio' : 'sendDocument';

  const res = await fetch(`${EVO_BASE_URL}/message/${endpoint}/${WA_CONFIG.instanceName}`, {
    method: 'POST',
    headers: {
      'apikey': EVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: cleanPhone,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption || undefined,
      fileName: 'file',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Evolution API media error: ${data?.message || res.statusText}`);
  }
  return data;
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

// ============================================================
// Webhook Verification (legacy Meta compatibility — kept for backward compat)
// ============================================================

export function verifyWebhook(mode: string, token: string, challenge: string): string | null {
  // Evolution API doesn't use hub.mode/hub.verify_token — it's a self-hosted webhook.
  // But we keep this for backward compat if Meta-style verification is sent.
  return challenge;
}

export function verifySignature(payload: string, signature: string): boolean {
  // Evolution API doesn't sign webhooks by default. We rely on the API key + IP whitelist.
  return true;
}

// ============================================================
// Message Handler (receives Evolution API webhook events)
// ============================================================

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
      username: `wa_${phone}`,
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
    // Evolution API event structure: { event, instance, data }
    const event = payload.event;
    const data = payload.data;

    console.log(`[WA-Evo] 📨 Event: ${event}`);

    if (event === 'MESSAGES_UPSERT') {
      // data.messages is an array of message objects
      const messages = data?.messages || [];
      for (const msg of messages) {
        await processSingleMessage(msg, data);
      }

      // Update heartbeat
      await db.botConfig.upsert({
        where: { key: 'wa_cloud_heartbeat' },
        update: { value: new Date().toISOString() },
        create: { key: 'wa_cloud_heartbeat', value: new Date().toISOString() },
      });
    } else if (event === 'CONNECTION_UPDATE') {
      console.log(`[WA-Evo] Connection state: ${data?.state || 'unknown'}`);
      await db.botConfig.upsert({
        where: { key: 'wa_evo_connection' },
        update: { value: JSON.stringify({ state: data?.state, ts: new Date().toISOString() }) },
        create: { key: 'wa_evo_connection', value: JSON.stringify({ state: data?.state, ts: new Date().toISOString() }) },
      });
    } else if (event === 'QRCODE_UPDATED') {
      console.log('[WA-Evo] QR code updated — needs scan');
      await db.botConfig.upsert({
        where: { key: 'wa_evo_qrcode' },
        update: { value: data?.qrcode?.base64 || data?.qrcode?.code || '' },
        create: { key: 'wa_evo_qrcode', value: data?.qrcode?.base64 || data?.qrcode?.code || '' },
      });
    }
  } catch (err: any) {
    console.error('[WA-Evo] Webhook handler error:', err?.message?.substring(0, 200));
  }
}

async function processSingleMessage(msg: any, eventData: any) {
  try {
    // Ignore messages sent from our own bot (key.fromMe === true)
    if (msg.key?.fromMe) {
      return;
    }

    const phone = msg.key?.participant || msg.key?.remoteJid?.replace(/@s\.whatsapp\.net$|@g\.us$/, '') || '';
    if (!phone) return;

    const senderName = msg.pushName || msg.key?.participant || phone;
    const msgType = msg.message?.conversation ? 'text' :
                   msg.message?.extendedTextMessage?.text ? 'text' :
                   msg.message?.imageMessage ? 'image' :
                   msg.message?.audioMessage ? 'audio' :
                   msg.message?.documentMessage ? 'document' :
                   msg.message?.videoMessage ? 'video' :
                   'unknown';

    const user = await getOrCreateUser(phone, senderName);
    console.log(`[WA-Evo] 📩 من ${senderName} (${phone}): ${msgType}`);

    // فحص الحظر
    if (user.isBlocked) {
      await sendWhatsAppMessage(phone, '🚫 تم حظرك من استخدام هذا البوت.');
      return;
    }

    // الموافقة التلقائية على جميع مستخدمي الواتساب
    if (!user.isApproved) {
      await db.telegramUser.update({
        where: { userId: user.userId },
        data: { isApproved: true, approvedAt: new Date() },
      });
    }

    // استخراج نص الرسالة
    let text = '';
    if (msg.message?.conversation) {
      text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
      text = msg.message.imageMessage.caption;
    } else if (msg.message?.videoMessage?.caption) {
      text = msg.message.videoMessage.caption;
    }

    // تجاهل الرسائل الفارغة
    if (!text && msgType === 'unknown') {
      await sendWhatsAppMessage(phone, 'عذراً، لا أستطيع معالجة هذا النوع من الرسائل حالياً. الرجاء إرسال نص.');
      return;
    }

    // حفظ رسالة المستخدم
    await db.message.create({
      data: {
        userId: user.userId,
        role: 'user',
        content: text || `[${msgType}]`,
        modelUsed: 'moodchat',
        status: 'done',
      },
    });

    // معالجة الرسالة
    await processUserMessage(text, phone, user.userId, msg, msgType);
  } catch (err: any) {
    console.error('[WA-Evo] processSingleMessage error:', err?.message?.substring(0, 200));
  }
}

async function processUserMessage(text: string, phone: string, userId: number, msg: any, msgType: string) {
  text = (text || '').trim();

  // أوامر المدير
  if (text === '/stats' && phone === WA_CONFIG.adminPhone) {
    const stats = await getStats();
    await sendWhatsAppMessage(phone, stats);
    return;
  }

  // كلمة مرور الانضمام (إذا كان نظام موافقة مفعّل لاحقاً)
  if (text === WA_CONFIG.joinPassword) {
    await sendWhatsAppMessage(phone, '✅ تم تسجيلك بنجاح! يمكنك الآن استخدام البوت.');
    return;
  }

  // /start و /help
  if (text === '/start' || text === '/help' || text === 'مرحبا' || text === 'هلا') {
    const welcome = `👋 أهلاً بك في بوت مود شات!

أنا مساعد ذكي خبير في كل المجالات:
🧠 المحادثة الذكية - أسئلة وأجوبة
🔍 البحث في الويب - أرسل "search: استفسارك"
🔗 قراءة الروابط - أرسل "read: رابط"
🎨 توليد الصور - أرسل "draw: وصف الصورة"
📄 تحليل الملفات - أرسل صورة أو ملف PDF/DOCX
🎤 تحويل نص لصوت - أرسل "tts: النص"

أرسل أي سؤال وسأجيبك فوراً! 🚀`;
    await sendWhatsAppMessage(phone, welcome);
    return;
  }

  // رد ذكي افتراضي
  await generateAndSendReply(text, phone, userId);
}

async function generateAndSendReply(text: string, phone: string, userId: number) {
  try {
    const history = await getHistory(userId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: text },
    ];

    const reply = await callZAIChat(messages);
    await sendWhatsAppMessage(phone, reply);

    await db.message.create({
      data: {
        userId,
        role: 'assistant',
        content: reply,
        modelUsed: 'moodchat-zai',
        status: 'done',
      },
    });
  } catch (err: any) {
    console.error('[WA-Evo] AI error:', err?.message?.substring(0, 200));
    await sendWhatsAppMessage(phone, 'عذراً، واجهت خطأ. حاول مرة أخرى بعد قليل 🙏');
  }
}

async function getHistory(userId: number) {
  const messages = await db.message.findMany({
    where: { userId, role: { in: ['user', 'assistant'] } },
    orderBy: { timestamp: 'desc' },
    take: MAX_HISTORY,
  });
  return messages.reverse().map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

async function callZAIChat(messages: any[], options: any = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${ZAI_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_CONFIG.apiKey}`,
        'X-Token': ZAI_CONFIG.token,
        'X-Z-AI-From': 'Z',
        'X-User-Id': ZAI_CONFIG.userId,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'glm-4-plus',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        thinking: { type: 'disabled' },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Z-AI ${res.status}: ${errBody.substring(0, 120)}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Z-AI response');
  } finally {
    clearTimeout(timeout);
  }
}

async function getStats(): Promise<string> {
  const totalUsers = await db.telegramUser.count();
  const totalMessages = await db.message.count();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMessages = await db.message.count({ where: { timestamp: { gte: today } } });

  return `📊 إحصائيات بوت مود شات:
👥 إجمالي المستخدمين: ${totalUsers}
💬 إجمالي الرسائل: ${totalMessages}
📅 رسائل اليوم: ${todayMessages}
🤖 النموذج: GLM-4 Plus (عبر Evolution API)`;
}

// ============================================================
// Connection Test
// ============================================================

export async function testWhatsAppConnection(): Promise<{ ok: boolean; message: string; qrCode?: string }> {
  try {
    const res = await fetch(`${EVO_BASE_URL}/`, {
      method: 'GET',
    });

    if (!res.ok) {
      return { ok: false, message: `Evolution API responded ${res.status}` };
    }

    const data = await res.json();
    if (data.status === 200) {
      // Also check instance state
      const inst = await fetchInstanceState();
      if (!inst) {
        return { ok: true, message: `Evolution API ${data.version} running. Instance "${WA_CONFIG.instanceName}" not yet created.` };
      }
      const state = inst.instance?.state || 'unknown';
      if (state === 'open') {
        return { ok: true, message: `✅ Connected as ${inst.instance?.ownerJid || 'unknown'}` };
      }
      const qr = await db.botConfig.findUnique({ where: { key: 'wa_evo_qrcode' } });
      return {
        ok: true,
        message: `Evolution API ${data.version} running. Instance state: ${state}. Scan QR code to connect.`,
        qrCode: qr?.value || undefined,
      };
    }

    return { ok: false, message: 'Evolution API responded unexpectedly' };
  } catch (err: any) {
    return { ok: false, message: `Connection failed: ${err.message}` };
  }
}

export { WA_CONFIG, EVO_BASE_URL, EVO_API_KEY, EVO_INSTANCE_NAME };
