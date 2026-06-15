/**
 * Auth API - Persistent authentication using signed cookies
 * Uses HMAC-based session tokens stored in cookies
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'MOOD2026ADMIN';
const SECRET_KEY = process.env.AUTH_SECRET || 'moodchat-secret-key-2026-stable';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function generateSessionToken(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  const payload = `${timestamp}:${random}`;
  const signature = createHmac('sha256', SECRET_KEY).update(payload).digest('hex').substring(0, 32);
  return `${payload}:${signature}`;
}

function isValidToken(token: string): boolean {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return false;

    const timestamp = parts[0];
    const random = parts[1];
    const signature = parts[2];

    // Verify signature
    const payload = `${timestamp}:${random}`;
    const expectedSig = createHmac('sha256', SECRET_KEY).update(payload).digest('hex').substring(0, 32);

    try {
      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expectedBuf.length) return false;
      if (!timingSafeEqual(sigBuf, expectedBuf)) return false;
    } catch {
      return false;
    }

    // Check expiration
    const createdAt = parseInt(timestamp, 36);
    if (Date.now() - createdAt > SESSION_DURATION) return false;

    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, action } = body;

    // Login
    if (action === 'login') {
      if (password === DASHBOARD_PASSWORD) {
        const token = generateSessionToken();
        const response = NextResponse.json({ ok: true });
        response.cookies.set('moodchat_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 86400,
          path: '/',
        });
        return response;
      } else {
        return NextResponse.json({ ok: false, error: 'كلمة المرور خاطئة' }, { status: 401 });
      }
    }

    // Verify session
    if (action === 'verify') {
      const token = request.cookies.get('moodchat_session')?.value;
      if (token && isValidToken(token)) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: 'جلسة غير صالحة' }, { status: 401 });
    }

    // Logout
    if (action === 'logout') {
      const response = NextResponse.json({ ok: true });
      response.cookies.set('moodchat_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET: Verify session
export async function GET(request: NextRequest) {
  const token = request.cookies.get('moodchat_session')?.value;
  if (token && isValidToken(token)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
