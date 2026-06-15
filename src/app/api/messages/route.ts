/**
 * Messages API - GET /api/messages
 * Supports pagination and full message retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '9999');
    const cursor = searchParams.get('cursor') || undefined;
    const page = parseInt(searchParams.get('page') || '1');

    const includeUser = {
      user: { select: { firstName: true, username: true, userId: true, photoUrl: true } },
    };

    if (userId) {
      // Get messages for specific user with pagination
      const where = { userId: parseInt(userId) };

      const [messages, total] = await Promise.all([
        db.message.findMany({
          where,
          orderBy: { timestamp: 'asc' },
          take: limit,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
        db.message.count({ where }),
      ]);

      return NextResponse.json({
        messages,
        total,
        hasMore: messages.length === limit,
        nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
      });
    }

    if (search) {
      // Search messages
      const messages = await db.message.findMany({
        where: { content: { contains: search } },
        orderBy: { timestamp: 'asc' },
        take: limit,
        include: includeUser,
      });

      return NextResponse.json({ messages, total: messages.length });
    }

    // Get all recent messages with pagination
    const where = {};

    const [messages, total] = await Promise.all([
      db.message.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: includeUser,
      }),
      db.message.count({ where }),
    ]);

    return NextResponse.json({
      messages,
      total,
      hasMore: messages.length === limit,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
