/**
 * Bot management API - GET /api/bot
 */

import { NextResponse } from 'next/server';
import { getWebhookInfo, setWebhook, deleteWebhook } from '@/lib/telegram-bot';

export async function GET() {
  try {
    const info = await getWebhookInfo();
    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Set webhook to current domain
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : '';
    
    if (!baseUrl) {
      return NextResponse.json({ error: 'No base URL configured' }, { status: 400 });
    }

    const webhookUrl = `${baseUrl}/api/telegram`;
    const result = await setWebhook(webhookUrl);
    return NextResponse.json({ webhookUrl, result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await deleteWebhook();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
