import { NextResponse } from 'next/server';
import { testWhatsAppConnection, WA_CONFIG } from '@/whatsapp-cloud';

/**
 * WhatsApp Test - GET /api/whatsapp/test
 * Tests the WhatsApp Cloud API connection
 */
export async function GET() {
  const result = await testWhatsAppConnection();
  return NextResponse.json({
    ...result,
    configured: !!(WA_CONFIG.accessToken && WA_CONFIG.phoneNumberId),
    phoneNumberId: WA_CONFIG.phoneNumberId ? '***' + WA_CONFIG.phoneNumberId.slice(-4) : null,
    verifyToken: WA_CONFIG.verifyToken,
  });
}
