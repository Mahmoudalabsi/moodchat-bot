/**
 * WhatsApp Users API
 * ===================
 * GET  /api/whatsapp-users                  → قائمة بكل مستخدمي واتساب
 * GET  /api/whatsapp-users?phone=9705...    → تفاصيل مستخدم محدد
 * POST /api/whatsapp-users                  → تحديث حالة مستخدم (approve/block/unblock)
 *   Body: { phone: string, action: 'approve'|'block'|'unblock'|'delete' }
 *
 * منفصل عن /api/users (الخاص بتيليجرام) ولا يلمسه.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTextMessage, normalizePhone } from '@/lib/whatsapp-cloud';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (phone) {
      const user = await db.whatsAppUser.findUnique({
        where: { phone: normalizePhone(phone) },
        include: { _count: { select: { messages: true, joinLogs: true } } },
      });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      return NextResponse.json(user);
    }

    const users = await db.whatsAppUser.findMany({
      orderBy: { lastActive: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json({ users, total: users.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { phone, action } = await request.json();
    if (!phone || !action) {
      return NextResponse.json({ error: 'phone and action are required' }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(phone);
    const user = await db.whatsAppUser.findUnique({ where: { phone: normalizedPhone } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await db.whatsAppUser.update({
        where: { phone: normalizedPhone },
        data: { isApproved: true, approvedAt: new Date(), isBlocked: false, waitingForPassword: false },
      });
      try {
        await sendTextMessage(normalizedPhone, '🎉 تمت الموافقة على حسابك من قبل المسؤول!\n\nيمكنك الآن محادثة مود شات بحرية. أرسل أي سؤال وسأجيبك فوراً.');
      } catch {}
      return NextResponse.json({ ok: true, action: 'approved' });
    }

    if (action === 'block') {
      await db.whatsAppUser.update({
        where: { phone: normalizedPhone },
        data: { isBlocked: true, isApproved: false },
      });
      try {
        await sendTextMessage(normalizedPhone, '🚫 تم حظر حسابك من استخدام مود شات من قبل المسؤول.');
      } catch {}
      return NextResponse.json({ ok: true, action: 'blocked' });
    }

    if (action === 'unblock') {
      await db.whatsAppUser.update({
        where: { phone: normalizedPhone },
        data: { isBlocked: false, isApproved: false, waitingForPassword: true, joinAttempts: 0 },
      });
      try {
        await sendTextMessage(normalizedPhone, '🔓 تم رفع الحظر عن حسابك.\n\nالرجاء إرسال كلمة المرور مرة أخرى لتفعيل حسابك.');
      } catch {}
      return NextResponse.json({ ok: true, action: 'unblocked' });
    }

    if (action === 'delete') {
      await db.whatsAppUser.delete({ where: { phone: normalizedPhone } });
      return NextResponse.json({ ok: true, action: 'deleted' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
