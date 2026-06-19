// Check current users in DB and any traces of deleted users
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

async function main() {
  console.log('=== Current TelegramUser records ===');
  const users = await db.telegramUser.findMany({
    orderBy: { firstSeen: 'desc' },
    select: { id: true, userId: true, firstName: true, username: true, isApproved: true, isBlocked: true, totalMessages: true, firstSeen: true, lastActive: true }
  });
  console.table(users);

  console.log('\n=== Total messages in DB ===');
  const msgCount = await db.message.count();
  console.log('Total messages:', msgCount);

  console.log('\n=== Messages without matching user (orphans from cascade) ===');
  // After cascade delete, there should be no orphans, but check
  const orphans = await db.message.findMany({
    distinct: ['userId'],
    select: { userId: true },
    take: 50,
  });
  console.log('Distinct userIds in messages:', orphans.map(o => o.userId));

  console.log('\n=== JoinLog entries (also cascaded) ===');
  const logs = await db.joinLog.count();
  console.log('JoinLog count:', logs);

  console.log('\n=== BotConfig keys (might contain backup info) ===');
  const cfg = await db.botConfig.findMany({ select: { key: true, value: true } });
  console.table(cfg);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
