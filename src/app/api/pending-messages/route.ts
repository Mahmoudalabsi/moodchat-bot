import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Pending Messages API - GET /api/pending-messages
 * Returns all pending, processing, and failed messages + worker status
 */
export async function GET(request: NextRequest) {
  try {
    const [pending, processing, failed, stats, workerHeartbeat, workerStats, workerPaused] = await Promise.all([
      db.message.findMany({
        where: { status: 'pending', role: 'user' },
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { firstName: true, username: true, userId: true, photoUrl: true } } },
      }),
      db.message.findMany({
        where: { status: 'processing', role: 'user' },
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { firstName: true, username: true, userId: true, photoUrl: true } } },
      }),
      db.message.findMany({
        where: { status: 'failed', role: 'user' },
        orderBy: { timestamp: 'desc' },
        take: 20,
        include: { user: { select: { firstName: true, username: true, userId: true, photoUrl: true } } },
      }),
      db.message.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      db.botConfig.findUnique({ where: { key: 'worker_heartbeat' } }),
      db.botConfig.findUnique({ where: { key: 'worker_stats' } }),
      db.botConfig.findUnique({ where: { key: 'worker_paused' } }),
    ]);

    // حساب حالة الـ Worker
    const lastHeartbeat = workerHeartbeat?.value ? new Date(workerHeartbeat.value) : null;
    const secondsSinceHeartbeat = lastHeartbeat ? Math.round((Date.now() - lastHeartbeat.getTime()) / 1000) : null;
    const isWorkerAlive = secondsSinceHeartbeat !== null && secondsSinceHeartbeat < 60;
    const isWorkerPaused = workerPaused?.value === 'true';

    let parsedStats = null;
    try {
      parsedStats = workerStats?.value ? JSON.parse(workerStats.value) : null;
    } catch {}

    return NextResponse.json({
      pending,
      processing,
      failed,
      stats: stats.map(s => ({ status: s.status, count: s._count.status })),
      worker: {
        alive: isWorkerAlive,
        paused: isWorkerPaused,
        lastHeartbeat: workerHeartbeat?.value || null,
        secondsSinceHeartbeat,
        totalProcessed: parsedStats?.totalProcessed || 0,
        totalFailed: parsedStats?.totalFailed || 0,
        lastActivity: parsedStats?.lastActivity || null,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/pending-messages - Actions on pending/failed messages
 * Body: { action: 'retry' | 'delete' | 'retryAll', messageId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, messageId } = body;

    if (action === 'retry' && messageId) {
      // إعادة محاولة رسالة فاشلة - تحويلها إلى pending
      await db.message.update({
        where: { id: messageId },
        data: { status: 'pending' },
      });
      return NextResponse.json({ ok: true, action: 'retry' });
    }

    if (action === 'delete' && messageId) {
      // حذف رسالة فاشلة
      await db.message.delete({
        where: { id: messageId },
      });
      return NextResponse.json({ ok: true, action: 'delete' });
    }

    if (action === 'retryAll') {
      // إعادة محاولة جميع الرسائل الفاشلة
      const result = await db.message.updateMany({
        where: { status: 'failed', role: 'user' },
        data: { status: 'pending' },
      });
      return NextResponse.json({ ok: true, action: 'retryAll', count: result.count });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
