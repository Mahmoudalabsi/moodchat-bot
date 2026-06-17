import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require' } } });
async function main() {
  const configs = await prisma.botConfig.findMany({
    where: { key: { contains: 'auto_proc' } }
  });
  console.log('Auto-proc configs:');
  configs.forEach(c => console.log(`  ${c.key}: ${c.value}`));
  
  // Also create some pending messages for the auto-proc to handle
  console.log('\nCreating test pending message...');
  const r = await prisma.message.create({
    data: { userId: 1429407129, role: 'user', content: 'مرحبا، اختبر الـ auto processor', modelUsed: 'moodchat', status: 'pending', chatId: 1429407129 }
  });
  console.log(`Created pending message: ${r.id}`);
  
  const pendingCount = await prisma.message.count({ where: { status: 'pending' } });
  console.log(`Pending count: ${pendingCount}`);
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
