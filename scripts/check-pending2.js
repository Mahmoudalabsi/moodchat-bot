const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
(async () => {
  // Any pending messages?
  const pending = await sql`SELECT id, "userId", "modelUsed", content, "timestamp" FROM "Message" WHERE status = 'pending' AND role = 'user' ORDER BY "timestamp" ASC LIMIT 20`;
  console.log(`Pending messages: ${pending.length}`);
  for (const m of pending) {
    console.log(`- id=${m.id} model=${m.modelUsed} time=${m.timestamp} content="${(m.content || '').substring(0, 80)}"`);
  }
  
  // Show recent failed audio (last 30 min)
  const recent = await sql`SELECT id, "userId", "modelUsed", "imageUrl", content, "timestamp" FROM "Message" WHERE "modelUsed" IN ('voice-analyze', 'audio-analyze') AND "timestamp" > NOW() - INTERVAL '1 hour' ORDER BY "timestamp" DESC LIMIT 10`;
  console.log(`\nRecent audio messages (last 1h): ${recent.length}`);
  for (const m of recent) {
    console.log(`- id=${m.id} model=${m.modelUsed} fileId=${(m.imageUrl || '').substring(0, 40)} time=${m.timestamp}`);
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
