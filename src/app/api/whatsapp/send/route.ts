import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, WA_CONFIG } from '@/whatsapp-cloud';

/**
 * WhatsApp Send - POST /api/whatsapp/send
 * Send a message to a phone number (admin only)
 * Body: { phone: string, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json({ error: 'phone and message required' }, { status: 400 });
    }

    // فحص المفتاح (admin only)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${WA_CONFIG.verifyToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await sendWhatsAppMessage(phone, message);
    return NextResponse.json({ ok: true, sent: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
