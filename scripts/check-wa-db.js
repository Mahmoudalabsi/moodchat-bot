// التحقق من رسائل الواتساب في قاعدة البيانات
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

(async () => {
  try {
    // 1. BotConfig الخاص بالواتساب
    const waConfigs = await db.botConfig.findMany({
      where: { key: { startsWith: 'wa_' } },
    });
    console.log('=== WA BotConfig ===');
    waConfigs.forEach(c => console.log(`${c.key}: ${c.value}`));

    // 2. آخر 20 رسالة
    const recentMsgs = await db.message.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        id: true,
        userId: true,
        role: true,
        content: true,
        modelUsed: true,
        status: true,
        timestamp: true,
      },
    });
    console.log('\n=== آخر 20 رسالة في قاعدة البيانات ===');
    recentMsgs.forEach(m => {
      console.log(`[${m.timestamp.toISOString()}] user=${m.userId} role=${m.role} model=${m.modelUsed} status=${m.status}`);
      console.log(`  content: ${(m.content || '').substring(0, 100)}`);
    });

    // 3. المستخدمين
    const users = await db.telegramUser.findMany({
      orderBy: { lastActive: 'desc' },
      take: 10,
      select: { userId: true, firstName: true, username: true, isApproved: true, isBlocked: true, lastActive: true },
    });
    console.log('\n=== آخر 10 مستخدمين ===');
    users.forEach(u => {
      console.log(`userId=${u.userId} name=${u.firstName} username=${u.username} approved=${u.isApproved} blocked=${u.isBlocked} lastActive=${u.lastActive?.toISOString()}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.$disconnect();
  }
})();
