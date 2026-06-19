import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/whatsapp-evolution';

/**
 * WhatsApp Send (Evolution API) - POST /api/whatsapp/send
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

    // Accept any of these auth methods
    const authHeader = request.headers.get('authorization') || '';
    const apiKey = request.headers.get('apikey') || '';
    const expectedToken = process.env.WA_VERIFY_TOKEN || 'moodchat_verify_2026';
    const expectedEvoKey = process.env.EVO_API_KEY || '04623565e9bb5e88af74758bd9db9acd';

    if (authHeader !== `Bearer ${expectedToken}` && apiKey !== expectedEvoKey && apiKey !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await sendWhatsAppMessage(phone, message);
    return NextResponse.json({ ok: true, sent: true });
  } catch (error: any) {
    console.error('[WA-Send] Error:', error?.message?.substring(0, 200));
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
