/**
 * WhatsApp Status API
 * =====================
 * GET /api/whatsapp-status
 * يُرجع حالة اتصال بوت واتساب + معلوماته + إحصائيات سريعة.
 */

import { NextResponse } from 'next/server';
import { getBotStatus, getWhatsAppConfig } from '@/lib/whatsapp-cloud';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [status, config] = await Promise.all([
      getBotStatus(),
      Promise.resolve(getWhatsAppConfig()),
    ]);
    let stats = null;
    try {
      const [users, approved, pending, blocked, messages, pendingMsgs] = await Promise.all([
        db.whatsAppUser.count(),
        db.whatsAppUser.count({ where: { isApproved: true } }),
        db.whatsAppUser.count({ where: { isApproved: false, isBlocked: false, waitingForPassword: false } }),
        db.whatsAppUser.count({ where: { isBlocked: true } }),
        db.message.count({ where: { platform: 'whatsapp' } }),
        db.message.count({ where: { platform: 'whatsapp', status: 'pending' } }),
      ]);
      stats = { users, approved, pending, blocked, messages, pendingMsgs };
    } catch (e) {
      console.error('[WA Status] stats error:', e);
    }
    return NextResponse.json({ ...status, config, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
