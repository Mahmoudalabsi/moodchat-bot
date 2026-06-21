// Check pending messages specifically
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require' },
  },
});

(async () => {
  try {
    const pending = await db.message.findMany({
      where: { status: 'pending' },
      orderBy: { timestamp: 'asc' },
      take: 10,
    });
    console.log('=== Pending Messages ===');
    console.log(`Count: ${pending.length}`);
    pending.forEach(m => {
      console.log(`- id=${m.id} userId=${m.userId} role=${m.role} status=${m.status} time=${m.timestamp.toISOString()}`);
      console.log(`  content: ${(m.content || '').substring(0, 80)}`);
    });

    // Check user
    const users = await db.telegramUser.findMany({
      where: { userId: { gte: 2000000 } },
      take: 10,
    });
    console.log('\n=== WA Users ===');
    users.forEach(u => {
      console.log(`- userId=${u.userId} name=${u.firstName} username=${u.username} approved=${u.isApproved}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.$disconnect();
  }
})();
