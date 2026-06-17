/**
 * WhatsApp Test API
 * ==================
 * POST /api/whatsapp/test  Body: { phone: string }
 * يرسل رسالة اختبار للتحقق من صحة الإعدادات.
 * GET /api/whatsapp/test   يتحقق من اتصال Cloud API (بدون إرسال رسالة).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendTestMessage, getBotStatus } from '@/lib/whatsapp-cloud';

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'phone is required' }, { status: 400 });
    }
    const result = await sendTestMessage(phone);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}

export async function GET() {
  const status = await getBotStatus();
  return NextResponse.json(status);
}
