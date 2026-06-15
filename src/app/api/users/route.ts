/**
 * Users API - GET /api/users
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};

    if (filter === 'approved') where.isApproved = true;
    if (filter === 'blocked') where.isBlocked = true;
    if (filter === 'pending') where.isApproved = false;

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { username: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    const users = await db.telegramUser.findMany({
      where,
      orderBy: { lastActive: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { messages: true } },
      },
    });

    const total = await db.telegramUser.count({ where });

    return NextResponse.json({ users, total, page, limit });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Block/unblock/approve user
export async function PUT(request: NextRequest) {
  try {
    const { userId, action } = await request.json();

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    if (action === 'block') {
      await db.telegramUser.update({ where: { userId }, data: { isBlocked: true } });
    } else if (action === 'unblock') {
      await db.telegramUser.update({ where: { userId }, data: { isBlocked: false } });
    } else if (action === 'approve') {
      await db.telegramUser.update({ where: { userId }, data: { isApproved: true, approvedAt: new Date() } });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Delete user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get('userId') || '0');

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    await db.message.deleteMany({ where: { userId } });
    await db.joinLog.deleteMany({ where: { userId } });
    await db.telegramUser.delete({ where: { userId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
