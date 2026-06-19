const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

function cuid() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return 'c' + ts + rnd;
}

(async () => {
  const userId = 1429407129;
  const chatId = 1429407129;
  const id = cuid();
  const result = await sql`
    INSERT INTO "Message" (id, "userId", "chatId", role, content, "modelUsed", status, "timestamp")
    VALUES (${id}, ${userId}, ${chatId}, 'user', 'tts:هذا اختبار للبادئة التلقائية', 'moodchat', 'pending', NOW())
    RETURNING id
  `;
  console.log(`✅ Inserted test message id=${result[0]?.id || id} — worker should auto-route to TTS`);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
