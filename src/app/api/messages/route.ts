/**
 * Messages API - GET /api/messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '50');

    if (userId) {
      // Get messages for specific user
      const messages = await db.message.findMany({
        where: { userId: parseInt(userId) },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return NextResponse.json({ messages });
    }

    if (search) {
      // Search messages
      const messages = await db.message.findMany({
        where: { content: { contains: search } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: { user: { select: { firstName: true, username: true, userId: true } } },
      });
      return NextResponse.json({ messages });
    }

    // Get all recent messages
    const messages = await db.message.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: { user: { select: { firstName: true, username: true, userId: true } } },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
