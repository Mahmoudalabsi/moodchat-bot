import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require' } } });
async function main() {
  const recent = await prisma.message.findMany({
    orderBy: { timestamp: 'desc' }, take: 10,
    select: { role: true, content: true, status: true, modelUsed: true, timestamp: true }
  });
  console.log('Last 10 messages:');
  recent.reverse().forEach(m => {
    const time = new Date(m.timestamp).toISOString().substring(11, 19);
    const content = m.content?.substring(0, 100).replace(/\n/g, ' ') || '';
    console.log(`  ${time} | ${m.role.padEnd(9)} | ${(m.modelUsed||'').padEnd(28)} | "${content}"`);
  });
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
