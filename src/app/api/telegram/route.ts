/**
 * Telegram Webhook Endpoint - POST /api/telegram
 * يعمل على Vercel Serverless Functions
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate, setWebhook, getWebhookInfo, deleteWebhook } from '@/lib/telegram-bot';

// استقبال تحديثات تيليجرام
export async function POST(request: NextRequest) {
  try {
    const update = await request.json();
    const result = await handleTelegramUpdate(update);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Webhook POST error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// إدارة الـ Webhook
export async function PUT(request: NextRequest) {
  try {
    const { action, url } = await request.json();

    if (action === 'set' && url) {
      const result = await setWebhook(url);
      return NextResponse.json({ webhookUrl: url, result });
    }
    if (action === 'delete') {
      const result = await deleteWebhook();
      return NextResponse.json(result);
    }
    if (action === 'info') {
      const result = await getWebhookInfo();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action. Use: set, delete, info' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// فحص حالة الـ Webhook
export async function GET() {
  try {
    const info = await getWebhookInfo();
    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
