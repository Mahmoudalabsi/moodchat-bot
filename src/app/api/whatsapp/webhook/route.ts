/**
 * WhatsApp Cloud API Webhook Endpoint
 * =====================================
 *  • GET  /api/whatsapp/webhook  → التحقق من hub.verify_token (يُرجع challenge نصياً)
 *  • POST /api/whatsapp/webhook  → استقبال الرسائل وتحديثات الحالة من Meta
 *
 * هذا المسار مستقل تماماً عن /api/telegram ولا يلمسه.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook, handleWhatsAppWebhook, type WhatsAppWebhookPayload } from '@/lib/whatsapp-cloud';

// التحقق من الـ Webhook عند إضافته في Meta Dashboard
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams;
  const { status, body } = verifyWebhook(query);
  // Meta يتوقع challenge كنص عادي (وليس JSON)
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// استقبال الرسائل وتحديثات الحالة
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WhatsAppWebhookPayload;
    // نُرجع 200 فوراً لتفادي إعادة إرسال Meta، ثم نعالج في الخلفية
    const result = await handleWhatsAppWebhook(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[WA Webhook] POST error:', error);
    // نُرجع 200 حتى في حال الخطأ لتفادي إعادة الإرسال المتكرر
    return NextResponse.json({ ok: true, error: String(error) });
  }
}
