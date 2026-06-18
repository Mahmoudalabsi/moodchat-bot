/**
 * Check DB for any stuck file-analyze / vlm / voice-analyze messages
 * that might still be pending and re-queue them for the new handler.
 */
const { PrismaClient } = require('@prisma/client');

const DATABASE_URL = 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    // Find recent file-related messages (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db.message.findMany({
      where: {
        timestamp: { gte: since },
        modelUsed: { in: ['file-analyze', 'vlm', 'voice-analyze', 'audio-analyze', 'video-analyze', 'moodchat-fallback'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 15,
      select: { id: true, userId: true, content: true, modelUsed: true, status: true, fileName: true, imageUrl: true, timestamp: true },
    });

    console.log(`=== Recent file-related messages (last 24h): ${recent.length} ===\n`);
    for (const m of recent) {
      console.log(`  [${m.timestamp.toISOString()}] id=${m.id} user=${m.userId} model=${m.modelUsed} status=${m.status}`);
      console.log(`    content: ${(m.content || '').substring(0, 80)}`);
      console.log(`    file: ${m.fileName || '—'} fileId: ${m.imageUrl ? m.imageUrl.substring(0, 30) + '...' : '—'}`);
      console.log('');
    }

    // Re-queue file-analyze / vlm messages that were processed by fallback (so user gets a proper analysis now)
    const requeue = await db.message.findMany({
      where: {
        timestamp: { gte: since },
        role: 'user',
        modelUsed: { in: ['file-analyze', 'vlm', 'voice-analyze', 'audio-analyze', 'video-analyze'] },
        status: 'done',  // Already processed - we won't re-queue these (would be confusing to user)
      },
    });
    console.log(`\n(${requeue.length} already-processed file messages — not re-queuing to avoid spamming user)`);
  } finally {
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
