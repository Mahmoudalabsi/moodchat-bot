const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
function cuid() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
(async () => {
  const id = cuid();
  await sql`
    INSERT INTO "Message" (id, "userId", "chatId", role, content, "modelUsed", status, "timestamp")
    VALUES (${id}, 1429407129, 1429407129, 'user', 'draw:a beautiful sunset over mountains landscape photography', 'moodchat', 'pending', NOW())
  `;
  console.log('✅ Inserted draw test (English prompt)');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
