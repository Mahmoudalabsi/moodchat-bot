// Quick smoke test for db-shim
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { PrismaShim } = require('./db-shim');

(async () => {
  const db = new PrismaShim(process.env.DATABASE_URL);

  // 1. Test $queryRaw
  try {
    const r = await db.$queryRaw`SELECT 1 as ok`;
    console.log('✅ $queryRaw works:', JSON.stringify(r));
  } catch (e) {
    console.error('❌ $queryRaw failed:', e.message);
  }

  // 2. Test findMany on Message
  try {
    const pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 5,
    });
    console.log('✅ message.findMany works:', pending.length, 'rows');
    if (pending[0]) console.log('   sample:', JSON.stringify(pending[0]).substring(0, 200));
  } catch (e) {
    console.error('❌ message.findMany failed:', e.message);
  }

  // 3. Test botConfig.findUnique
  try {
    const cfg = await db.botConfig.findUnique({ where: { key: 'pollinations_fallback_enabled' } });
    console.log('✅ botConfig.findUnique works:', JSON.stringify(cfg));
  } catch (e) {
    console.error('❌ botConfig.findUnique failed:', e.message);
  }

  // 4. Test getHistory pattern (userId filter + role IN)
  try {
    const hist = await db.message.findMany({
      where: { userId: 1429407129, status: 'done', role: { in: ['user', 'assistant'] } },
      orderBy: { timestamp: 'asc' },
      take: 30,
    });
    console.log('✅ getHistory pattern works:', hist.length, 'rows');
  } catch (e) {
    console.error('❌ getHistory pattern failed:', e.message);
  }

  await db.$disconnect();
  console.log('✅ $disconnect works');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
