import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppMessage } from '@/whatsapp-evolution';
import { PrismaClient } from '@prisma/client';

/**
 * WhatsApp Webhook — GET /api/whatsapp/webhook
 *
 * Handles BOTH:
 * 1. Meta Cloud API verification (hub.mode=subscribe&hub.verify_token=...&hub.challenge=...)
 * 2. Evolution API health checks / backward compatibility
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'moodchat_verify_2026';

  // Meta Cloud API webhook verification
  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    console.log('[WA-Webhook] ✅ Meta webhook verified');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Evolution API or generic token
  if (token) {
    return new NextResponse(token, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({
    ok: true,
    message: 'MoodChat WhatsApp webhook (Meta + Evolution API)',
    timestamp: new Date().toISOString(),
  });
}

/**
 * WhatsApp Webhook — POST /api/whatsapp/webhook
 *
 * Auto-detects and handles BOTH formats:
 * 
 * 1. Meta Cloud API format:
 * {
 *   object: 'whatsapp_business_account',
 *   entry: [{ changes: [{ value: { messages: [...], contacts: [...] } }] }]
 * }
 *
 * 2. Evolution API format:
 * {
 *   event: 'MESSAGES_UPSERT' | 'CONNECTION_UPDATE' | ...,
 *   instance: 'moodchat',
 *   data: { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Auto-detect format
    if (payload?.entry && Array.isArray(payload.entry)) {
      // Meta Cloud API format
      console.log(`[WA-Webhook] 📨 Meta format detected`);
      await handleMetaWebhook(payload);
    } else if (payload?.event) {
      // Evolution API format
      console.log(`[WA-Webhook] 📨 Evolution API format: ${payload.event}`);
      await handleWhatsAppMessage(payload);
    } else {
      console.log(`[WA-Webhook] ⚠️ Unknown format: ${rawBody.substring(0, 200)}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[WA-Webhook] Error:', error?.message?.substring(0, 300));
    // Always return 200 to Meta (Meta retries on non-200)
    return NextResponse.json({ ok: true });
  }
}

// ============================================================
// Meta Cloud API Message Handler
// ============================================================

async function handleMetaWebhook(payload: any) {
  const db = new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL || '',
      },
    },
  });

  try {
    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        // Handle status updates (delivered, read, etc.) — just log them
        const statuses = value.statuses || [];
        for (const status of statuses) {
          console.log(`[WA-Webhook] 📊 Status: msg=${status.id} status=${status.status}`);
        }

        for (const msg of messages) {
          await saveMetaMessage(msg, contacts, db);
        }
      }
    }
  } finally {
    await db.$disconnect();
  }
}

function phoneToUserId(phone: string): number {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return 2000000 + parseInt(digits, 10);
}

async function saveMetaMessage(msg: any, contacts: any[], db: any) {
  try {
    const phone = msg.from || '';
    if (!phone) return;

    // Find contact name
    const contact = contacts.find((c: any) => c.wa_id === phone);
    const senderName = contact?.profile?.name || phone;

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

    // Determine message type
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
    } else if (msg.type === 'reaction' || msg.type === 'unsupported') {
      // Skip reactions — don't create DB entries for them
      return;
    } else {
      content = `[${msg.type || 'unknown'}]`;
    }

    console.log(`[WA-Webhook] 📩 ${senderName} (${phone}): ${content.substring(0, 80)}`);

    // Save as 'pending' for wa-worker.js to pick up
    await db.message.create({
      data: {
        userId,
        role: 'user',
        content: content.substring(0, 4000),
        status: 'pending',
        modelUsed: 'whatsapp-meta',
        fileType: fileType || undefined,
        imageUrl: imageUrl || undefined,
        fileName: fileName || undefined,
        mimeType: mimeType || undefined,
      },
    });

    console.log(`[WA-Webhook] ✅ Saved pending message from ${senderName}`);
  } catch (err: any) {
    console.error(`[WA-Webhook] Message save error: ${err?.message?.substring(0, 200)}`);
  }
}
