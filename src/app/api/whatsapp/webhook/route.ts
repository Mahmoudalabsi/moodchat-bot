import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppMessage } from '@/whatsapp-evolution';

/**
 * WhatsApp Webhook (Evolution API) - GET /api/whatsapp/webhook
 *
 * Evolution API doesn't use Meta's hub.mode/hub.verify_token flow.
 * The webhook is registered directly via the API key when creating/connecting an instance.
 * We keep this GET endpoint for backward compatibility and health checks.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // If Evolution API sends a verification token, accept it
  const token = searchParams.get('token') || searchParams.get('hub.verify_token');
  if (token) {
    return new NextResponse(token, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return NextResponse.json({
    ok: true,
    message: 'MoodChat WhatsApp webhook (Evolution API)',
    timestamp: new Date().toISOString(),
  });
}

/**
 * WhatsApp Webhook (Evolution API) - POST /api/whatsapp/webhook
 *
 * Receives events from Evolution API in the format:
 * {
 *   event: 'MESSAGES_UPSERT' | 'CONNECTION_UPDATE' | 'QRCODE_UPDATED' | ...,
 *   instance: 'moodchat',
 *   data: { ... event-specific data ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Log incoming events for debugging
    console.log(`[WA-Webhook] Received event: ${payload?.event || 'unknown'}`);

    await handleWhatsAppMessage(payload);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[WA-Webhook] Error:', error?.message?.substring(0, 200));
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
