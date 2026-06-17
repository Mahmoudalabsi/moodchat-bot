/**
 * Self-Loop Processor (daemon-loop/route.ts)
 * ============================================
 * GET/POST /api/daemon-loop
 *
 * يعمل كـ "daemon" على Vercel: يستدعي نفسه تلقائياً كل 5 ثوانٍ.
 * بمجرد تشغيله مرة واحدة، يستمر في العمل بشكل دائم.
 *
 * كيف يعمل:
 *  1. يعالج رسالة واحدة (TG أو WA — أيهما معلق أولاً)
 *  2. ينتظر 3 ثوانٍ
 *  3. يستدعي نفسه عبر fetch fire-and-forget (لا ينتظر الرد)
 *  4. يُنهي request الحالي
 *
 * النتيجة: سلسلة لا نهائية من المعالجة تعمل على Vercel infrastructure.
 *
 * لتفعيله: قم بزيارة /api/daemon-loop مرة واحدة (أو استدعِه من pinger).
 * لإيقافه: استدعِ /api/daemon-loop?stop=1
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SELF_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://my-project-green-ten.vercel.app';

const LOOP_DELAY_MS = 3000;
const STOP_FLAG_KEY = 'daemon_loop_stopped';
const HEARTBEAT_KEY = 'daemon_loop_heartbeat';

export async function GET(req: NextRequest) {
  return runLoop(req);
}

export async function POST(req: NextRequest) {
  return runLoop(req);
}

async function runLoop(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const url = new URL(req.url);
  const stopFlag = url.searchParams.get('stop');

  try {
    // Stop flag
    if (stopFlag === '1') {
      await db.botConfig.upsert({
        where: { key: STOP_FLAG_KEY },
        update: { value: 'true' },
        create: { key: STOP_FLAG_KEY, value: 'true' },
      }).catch(() => {});
      return NextResponse.json({ ok: true, message: 'Daemon loop will stop within a few seconds.' });
    }

    // Reset stop flag if explicitly requested
    if (stopFlag === '0' || stopFlag === 'start') {
      await db.botConfig.upsert({
        where: { key: STOP_FLAG_KEY },
        update: { value: 'false' },
        create: { key: STOP_FLAG_KEY, value: 'false' },
      }).catch(() => {});
    }

    // Check stop flag
    const stopCfg = await db.botConfig.findUnique({ where: { key: STOP_FLAG_KEY } }).catch(() => null);
    if (stopCfg?.value === 'true') {
      return NextResponse.json({ ok: true, message: 'Daemon is stopped. Visit /api/daemon-loop?start=1 to resume.' });
    }

    // Update heartbeat
    await db.botConfig.upsert({
      where: { key: HEARTBEAT_KEY },
      update: { value: new Date().toISOString() },
      create: { key: HEARTBEAT_KEY, value: new Date().toISOString() },
    }).catch(() => {});

    // Find oldest pending message (either platform)
    const pending = await db.message.findFirst({
      where: {
        status: 'pending',
        OR: [
          { platform: 'telegram', chatId: { not: null } },
          { platform: 'whatsapp', whatsappPhone: { not: null } },
        ],
      },
      orderBy: { timestamp: 'asc' },
    });

    let processed = 0;
    let platform = 'none';
    let messageId: string | null = null;

    if (pending) {
      platform = pending.platform || 'unknown';
      messageId = pending.id;
      const processorPath = pending.platform === 'whatsapp'
        ? '/api/process-wa-messages'
        : '/api/process-tg-messages';
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 25000);
        await fetch(`${SELF_URL}${processorPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'daemon-loop', messageId: pending.id }),
          signal: ctrl.signal,
        }).catch(() => null);
        clearTimeout(t);
        processed = 1;
      } catch {
        processed = 0;
      }
    }

    // Schedule next iteration (fire and forget)
    setTimeout(() => {
      fetch(`${SELF_URL}/api/daemon-loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'daemon-loop-self' }),
      }).catch(() => {
        // Silent — will retry on next external trigger
      });
    }, LOOP_DELAY_MS);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      pendingFound: !!pending,
      platform,
      messageId,
      processed,
      nextLoopIn: `${LOOP_DELAY_MS}ms`,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[Daemon-Loop] error:', err);
    setTimeout(() => {
      fetch(`${SELF_URL}/api/daemon-loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'daemon-loop-error-recovery' }),
      }).catch(() => {});
    }, 10000);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
