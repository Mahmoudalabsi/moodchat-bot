import { NextResponse, NextRequest } from 'next/server';
import { testWhatsAppConnection, ensureInstance, EVO_BASE_URL, EVO_INSTANCE_NAME } from '@/whatsapp-evolution';

/**
 * WhatsApp Test (Evolution API) - GET /api/whatsapp/test
 * Tests the Evolution API connection and instance state
 */
export async function GET() {
  try {
    const result = await testWhatsAppConnection();
    return NextResponse.json({
      ...result,
      provider: 'Evolution API (self-hosted, free)',
      apiUrl: EVO_BASE_URL,
      instanceName: EVO_INSTANCE_NAME,
      webhookUrl: '/api/whatsapp/webhook',
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      message: `Test failed: ${error?.message}`,
      provider: 'Evolution API',
    }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/test
 * Body: { action: 'ensure' | 'connect' }
 * - 'ensure': create instance if missing, return QR code if not authenticated
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'ensure';

    if (action === 'ensure') {
      const result = await ensureInstance();
      return NextResponse.json({
        ok: true,
        action,
        result,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[WA-Test POST] Error:', error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
