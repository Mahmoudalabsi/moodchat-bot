import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

/**
 * Meta Cloud API Webhook — GET /api/whatsapp/meta-webhook
 *
 * Handles Meta's webhook verification challenge:
 * GET ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'moodchat_verify_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    console.log('[Meta-Webhook] ✅ Verification successful');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn(`[Meta-Webhook] ❌ Verification failed (mode=${mode}, token=${token?.substring(0, 6)}...)`);
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Meta Cloud API Webhook — POST /api/whatsapp/meta-webhook
 *
 * Receives messages from Meta in the standard WhatsApp Cloud API format:
 * {
 *   object: 'whatsapp_business_account',
 *   entry: [{
 *     changes: [{
 *       value: {
 *         messages: [{ from, text, type, image?, document?, ... }],
 *         contacts: [{ wa_id, profile: { name } }]
 *       }
 *     }]
 *   }]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    console.log(`[Meta-Webhook] 📨 Received: ${rawBody.substring(0, 300)}`);

    // Validate Meta webhook structure
    if (!payload?.entry || !Array.isArray(payload.entry)) {
      console.log('[Meta-Webhook] ⚠️ Not a valid Meta webhook payload');
      return NextResponse.json({ ok: true });
    }

    const db = new PrismaClient({
      log: ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL || '',
        },
      },
    });

    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          await handleMetaMessage(msg, contacts, db);
        }
      }
    }

    await db.$disconnect();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Meta-Webhook] Error:', error?.message?.substring(0, 300));
    // Always return 200 to Meta (otherwise Meta retries)
    return NextResponse.json({ ok: true });
  }
}

/**
 * Process a single WhatsApp message from Meta Cloud API
 */
async function handleMetaMessage(msg: any, contacts: any[], db: any) {
  try {
    // Extract phone number
    const phone = msg.from || '';
    if (!phone) return;

    // Get contact name
    const contact = contacts.find((c: any) => c.wa_id === phone);
    const senderName = contact?.profile?.name || phone;

    // Get or create user
    const userId = phoneToUserId(phone);

    // Upsert user
    await db.telegramUser.upsert({
      where: { userId },
      update: {
        firstName: senderName,
        username: `wa_${phone}`,
        lastActive: new Date(),
      },
      create: {
        userId,
        firstName: senderName,
        username: `wa_${phone}`,
        isApproved: true,
        approvedAt: new Date(),
      },
    });

    // Determine message type and extract content
    let content = '';
    let fileType: string | null = null;
    let imageUrl: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;

    if (msg.type === 'text' && msg.text?.body) {
      content = msg.text.body;
    } else if (msg.type === 'image') {
      fileType = 'image';
      imageUrl = msg.image?.id || '';
      mimeType = msg.image?.mime_type || 'image/jpeg';
      content = `📷 [صورة] ${msg.image?.caption || ''}`;
      fileName = `image.${mimeType?.split('/')[1] || 'jpg'}`;
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      fileType = 'audio';
      imageUrl = (msg.audio || msg.voice)?.id || '';
      mimeType = (msg.audio || msg.voice)?.mime_type || 'audio/ogg';
      content = `🎤 [رسالة صوتية]`;
    } else if (msg.type === 'document') {
      fileType = 'document';
      imageUrl = msg.document?.id || '';
      fileName = msg.document?.filename || 'document';
      mimeType = msg.document?.mime_type || 'application/octet-stream';
      content = `📎 [ملف: ${fileName}] ${msg.document?.caption || ''}`;
    } else if (msg.type === 'video') {
      fileType = 'video';
      imageUrl = msg.video?.id || '';
      mimeType = msg.video?.mime_type || 'video/mp4';
      content = `🎬 [فيديو] ${msg.video?.caption || ''}`;
    } else if (msg.type === 'sticker') {
      fileType = 'sticker';
      imageUrl = msg.sticker?.id || '';
      content = `🎯 [ملصق]`;
    } else if (msg.type === 'location') {
      content = `📍 [موقع: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
    } else if (msg.type === 'reaction') {
      // Skip reactions — don't create messages for them
      return;
    } else {
      content = `[${msg.type || 'unknown'}]`;
    }

    console.log(`[Meta-Webhook] 📩 ${senderName} (${phone}): ${content.substring(0, 80)}`);

    // Save message to DB as 'pending' for the polling worker to pick up
    await db.message.create({
      data: {
        userId,
        role: 'user',
        content: content.substring(0, 4000),
        status: 'pending', // ← This is the key: the polling worker looks for pending messages
        modelUsed: 'whatsapp-meta',
        fileType: fileType || undefined,
        imageUrl: imageUrl || undefined,
        fileName: fileName || undefined,
        mimeType: mimeType || undefined,
      },
    });

    console.log(`[Meta-Webhook] ✅ Saved as pending for ${senderName}`);
  } catch (err: any) {
    console.error(`[Meta-Webhook] Message handler error: ${err?.message?.substring(0, 200)}`);
  }
}

/**
 * Convert WhatsApp phone number to userId (same formula as wa-worker.js)
 * userId = 2000000 + last 10 digits of phone
 */
function phoneToUserId(phone: string): number {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return 2000000 + parseInt(digits, 10);
}
