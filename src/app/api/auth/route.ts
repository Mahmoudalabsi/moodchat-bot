/**
 * Auth API - POST /api/auth/login
 * نظام تسجيل دخول خاص بالمالك فقط
 */

import { NextRequest, NextResponse } from 'next/server';

// كلمة مرور لوحة التحكم - يمكن تغييرها من خلال متغير البيئة
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'MOOD2026ADMIN';

// جلسات بسيطة (في الذاكرة - تكفي لشخص واحد)
const sessions = new Map<string, { createdAt: number }>();

// مدة الجلسة: 24 ساعة
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, action } = body;

    // تسجيل الدخول
    if (action === 'login') {
      if (password === DASHBOARD_PASSWORD) {
        const sessionId = generateSessionId();
        sessions.set(sessionId, { createdAt: Date.now() });

        const response = NextResponse.json({ ok: true, sessionId });
        response.cookies.set('moodchat_session', sessionId, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 86400, // 24 ساعة
          path: '/',
        });
        return response;
      } else {
        return NextResponse.json({ ok: false, error: 'كلمة المرور خاطئة' }, { status: 401 });
      }
    }

    // التحقق من الجلسة
    if (action === 'verify') {
      const sessionId = body.sessionId || request.cookies.get('moodchat_session')?.value;
      if (sessionId && isValidSession(sessionId)) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: 'جلسة غير صالحة' }, { status: 401 });
    }

    // تسجيل الخروج
    if (action === 'logout') {
      const sessionId = request.cookies.get('moodchat_session')?.value;
      if (sessionId) sessions.delete(sessionId);
      const response = NextResponse.json({ ok: true });
      response.cookies.delete('moodchat_session');
      return response;
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET: التحقق من الجلسة
export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('moodchat_session')?.value;
  if (sessionId && isValidSession(sessionId)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}

function isValidSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_DURATION) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
