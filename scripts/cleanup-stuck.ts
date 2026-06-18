import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require' } } });
async function main() {
  const r = await prisma.message.updateMany({ where: { status: { in: ['pending', 'failed'] } }, data: { status: 'failed' } });
  console.log(`✅ Cleaned ${r.count} stuck messages`);
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
