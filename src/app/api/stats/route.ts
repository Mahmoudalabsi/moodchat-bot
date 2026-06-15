/**
 * Stats API - GET /api/stats
 * محسّن: استعلام واحد بدل 13 استعلام تسلسلي
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// كاش للاحصائيات - يتجدد كل 30 ثانية
let statsCache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 ثانية

export async function GET() {
  try {
    // تحقق من الكاش
    if (statsCache && Date.now() - statsCache.timestamp < CACHE_TTL) {
      return NextResponse.json(statsCache.data);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // استعلامات متوازية بدل تسلسلية
    const [
      users,
      totalMessages,
      messagesToday,
      newUsersToday,
      activeUsers7d,
      topUsers,
      recentJoins,
      dailyMsgsRaw,
    ] = await Promise.all([
      // كل المستخدمين دفعة واحدة (بدل 4 استعلامات count)
      db.telegramUser.findMany({
        select: {
          isApproved: true,
          isBlocked: true,
        },
      }),
      db.message.count(),
      db.message.count({ where: { timestamp: { gte: today } } }),
      db.telegramUser.count({ where: { firstSeen: { gte: today } } }),
      db.telegramUser.count({ where: { lastActive: { gte: weekAgo } } }),
      db.telegramUser.findMany({
        where: { isApproved: true },
        orderBy: { totalMessages: 'desc' },
        take: 5,
      }),
      db.joinLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { user: true },
      }),
      // الرسائل اليومية - استعلام واحد بدل 7
      db.message.findMany({
        where: { timestamp: { gte: weekAgo } },
        select: { timestamp: true },
      }),
    ]);

    // حساب الإحصائيات من البيانات المحملة (بدل استعلامات إضافية)
    const totalUsers = users.length;
    const approvedUsers = users.filter(u => u.isApproved).length;
    const blockedUsers = users.filter(u => u.isBlocked).length;
    const pendingUsers = users.filter(u => !u.isApproved && !u.isBlocked).length;

    // تجميع الرسائل اليومية من البيانات المحملة
    const dailyMessages: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().split('T')[0];
      const count = dailyMsgsRaw.filter(m => {
        const msgDate = new Date(m.timestamp).toISOString().split('T')[0];
        return msgDate === dayStr;
      }).length;
      dailyMessages.push({ date: dayStr, count });
    }

    const result = {
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
    };

    // حفظ في الكاش
    statsCache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
