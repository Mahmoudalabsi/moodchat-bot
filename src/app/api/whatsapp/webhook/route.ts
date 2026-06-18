import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook, verifySignature, handleWhatsAppMessage } from '@/whatsapp-cloud';

/**
 * WhatsApp Webhook - GET /api/whatsapp/webhook
 * Verification endpoint called by Meta to verify webhook ownership
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!mode || !token || !challenge) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const result = verifyWebhook(mode, token, challenge);
  if (result !== null) {
    // إرجاع challenge كـ نص (مطلوب من Meta)
    return new NextResponse(result, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * WhatsApp Webhook - POST /api/whatsapp/webhook
 * Receives messages and status updates from WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    // تحقق من التوقيع (أمان)
    // ملاحظة: في وضع التطوير يمكن تعطيل هذا التحقق
    // const isValid = verifySignature(rawBody, signature);
    // if (!isValid) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }

    const payload = JSON.parse(rawBody);
    await handleWhatsAppMessage(payload);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Error:', error?.message?.substring(0, 100));
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
