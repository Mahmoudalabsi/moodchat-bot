// فحص آخر الرسائل في DB
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  try {
    // آخر 5 رسائل assistant
    const r = await sql`
      SELECT "modelUsed", content, timestamp
      FROM "Message"
      WHERE role = 'assistant'
      ORDER BY timestamp DESC
      LIMIT 5
    `;
    console.log("آخر assistant messages:");
    r.forEach(m => console.log(`  [${m.modelUsed}] ${m.timestamp}: ${(m.content || '').substring(0, 100)}`));

    // آخر 5 user messages
    console.log("\nآخر user messages:");
    const u = await sql`
      SELECT status, content, timestamp, "modelUsed"
      FROM "Message"
      WHERE role = 'user'
      ORDER BY timestamp DESC
      LIMIT 5
    `;
    u.forEach(m => console.log(`  [${m.status}] ${m.timestamp}: ${(m.content || '').substring(0, 100)}`));
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
