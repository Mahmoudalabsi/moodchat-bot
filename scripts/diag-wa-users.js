// أداة تشخيص: تعرض المستخدمين المسجلين ويراقبون الرسائل الجديدة
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  },
});

(async () => {
  try {
    // 1. البحث عن المستخدم Mahmoud
    const users = await db.telegramUser.findMany({
      where: {
        OR: [
          { firstName: { contains: 'Mahmoud' } },
          { username: 'Its_m7moud' },
        ]
      },
    });
    console.log('=== Users named Mahmoud ===');
    users.forEach(u => {
      console.log(`userId=${u.userId} name=${u.firstName} username=${u.username} approved=${u.isApproved} lastActive=${u.lastActive?.toISOString()}`);
    });

    // 2. عرض آخر 30 رسالة (أي مستخدم)
    const recentMsgs = await db.message.findMany({
      orderBy: { timestamp: 'desc' },
      take: 30,
      select: {
        id: true,
        userId: true,
        role: true,
        content: true,
        modelUsed: true,
        status: true,
        timestamp: true,
        imageUrl: true,
        fileType: true,
      },
    });
    console.log('\n=== آخر 30 رسالة ===');
    recentMsgs.forEach(m => {
      console.log(`[${m.timestamp.toISOString()}] user=${m.userId} role=${m.role} model=${m.modelUsed} status=${m.status} fileType=${m.fileType || '-'}`);
      console.log(`  content: ${(m.content || '').substring(0, 80)}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.$disconnect();
  }
})();
