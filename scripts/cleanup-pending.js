const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = new PrismaClient();
(async () => {
  const result = await db.message.updateMany({
    where: { status: { in: ['pending', 'processing'] } },
    data: { status: 'done' },
  });
  console.log(`Cleaned up ${result.count} stuck pending/processing messages`);
  await db.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
