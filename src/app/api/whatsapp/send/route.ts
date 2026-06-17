/**
 * WhatsApp Send Message API
 * ===========================
 * POST /api/whatsapp/send
 * Body: { phone: string, text?: string, type?: 'text'|'image'|'document', mediaId?: string, mediaLink?: string, caption?: string }
 *
 * يستخدم لإرسال رسالة من اللوحة الإدارية إلى رقم واتساب محدد.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  sendTextMessage, sendLongTextMessage, sendImageMessage,
  sendDocumentMessage, normalizePhone,
} from '@/lib/whatsapp-cloud';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone || '');
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'phone is required' }, { status: 400 });
    }

    const type: string = body.type || 'text';

    if (type === 'text') {
      const text: string = body.text || '';
      if (!text) {
        return NextResponse.json({ ok: false, error: 'text is required for type=text' }, { status: 400 });
      }
      const results = text.length > 3800
        ? await sendLongTextMessage(phone, text)
        : [await sendTextMessage(phone, text)];
      return NextResponse.json({ ok: true, results });
    }

    if (type === 'image') {
      const r = await sendImageMessage(phone, {
        id: body.mediaId, link: body.mediaLink, caption: body.caption,
      });
      return NextResponse.json({ ok: true, result: r });
    }

    if (type === 'document') {
      const r = await sendDocumentMessage(phone, {
        id: body.mediaId, link: body.mediaLink,
        filename: body.filename, caption: body.caption,
      });
      return NextResponse.json({ ok: true, result: r });
    }

    return NextResponse.json({ ok: false, error: `Unsupported type: ${type}` }, { status: 400 });
  } catch (error: any) {
    console.error('[WA Send] error:', error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}

// إحصائيات سريعة عن رسائل واتساب (للأدمن)
export async function GET() {
  try {
    const [total, pending, failed, today] = await Promise.all([
      db.message.count({ where: { platform: 'whatsapp' } }),
      db.message.count({ where: { platform: 'whatsapp', status: 'pending' } }),
      db.message.count({ where: { platform: 'whatsapp', status: 'failed' } }),
      db.message.count({
        where: {
          platform: 'whatsapp',
          timestamp: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    return NextResponse.json({ total, pending, failed, today });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
