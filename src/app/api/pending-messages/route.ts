import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Pending Messages API - GET /api/pending-messages
 * Returns all pending and processing messages for the dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const [pending, processing, stats] = await Promise.all([
      db.message.findMany({
        where: { status: 'pending' },
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { firstName: true, username: true, userId: true, photoUrl: true } } },
      }),
      db.message.findMany({
        where: { status: 'processing' },
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { firstName: true, username: true, userId: true, photoUrl: true } } },
      }),
      db.message.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    return NextResponse.json({
      pending,
      processing,
      stats: stats.map(s => ({ status: s.status, count: s._count.status })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
