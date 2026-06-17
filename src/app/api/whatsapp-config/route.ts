/**
 * WhatsApp Config API
 * =====================
 * GET /api/whatsapp-config
 * يُرجع إعدادات بوت واتساب العامة (بدون كشف الـ Access Token).
 */

import { NextResponse } from 'next/server';
import { getWhatsAppConfig } from '@/lib/whatsapp-cloud';

export async function GET() {
  return NextResponse.json(getWhatsAppConfig());
}
