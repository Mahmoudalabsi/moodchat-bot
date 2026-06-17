/**
 * Check DB for pending messages and bot config
 */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = new PrismaClient();

(async () => {
  try {
    const pending = await db.message.findMany({
      where: { status: { in: ['pending', 'processing'] }, role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 10,
    });
    console.log(`Pending/processing messages: ${pending.length}`);
    pending.forEach(m => console.log(`  [${m.id}] ${m.status} from ${m.userId}: "${(m.content || '').substring(0, 60)}..."`));

    const cfg = await db.botConfig.findMany();
    console.log(`\nBotConfig keys: ${cfg.length}`);
    cfg.forEach(c => console.log(`  ${c.key} = ${c.value}`));

    // Make sure pollinations_fallback_enabled exists (default false)
    if (!cfg.find(c => c.key === 'pollinations_fallback_enabled')) {
      await db.botConfig.create({ data: { key: 'pollinations_fallback_enabled', value: 'false' } });
      console.log('\nCreated pollinations_fallback_enabled = false');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.$disconnect();
  }
})();
