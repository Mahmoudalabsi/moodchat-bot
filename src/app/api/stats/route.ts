/**
 * Stats API - GET /api/stats
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const totalUsers = await db.telegramUser.count();
    const approvedUsers = await db.telegramUser.count({ where: { isApproved: true } });
    const blockedUsers = await db.telegramUser.count({ where: { isBlocked: true } });
    const pendingUsers = await db.telegramUser.count({ where: { isApproved: false, isBlocked: false } });
    const totalMessages = await db.message.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await db.message.count({ where: { timestamp: { gte: today } } });
    const newUsersToday = await db.telegramUser.count({ where: { firstSeen: { gte: today } } });

    // Active users (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const activeUsers7d = await db.telegramUser.count({
      where: { lastActive: { gte: weekAgo } },
    });

    // Top users
    const topUsers = await db.telegramUser.findMany({
      where: { isApproved: true },
      orderBy: { totalMessages: 'desc' },
      take: 5,
    });

    // Recent join attempts
    const recentJoins = await db.joinLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: { user: true },
    });

    // Daily messages (last 7 days)
    const dailyMessages = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const count = await db.message.count({
        where: { timestamp: { gte: day, lt: nextDay } },
      });
      dailyMessages.push({
        date: day.toISOString().split('T')[0],
        count,
      });
    }

    return NextResponse.json({
      totalUsers,
      approvedUsers,
      blockedUsers,
      pendingUsers,
      totalMessages,
      messagesToday,
      newUsersToday,
      activeUsers7d,
      topUsers,
      recentJoins,
      dailyMessages,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
