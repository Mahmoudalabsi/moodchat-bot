// تنظيف الرسائل العالقة في قاعدة البيانات
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  try {
    // Reset stuck processing messages
    const r1 = await sql`UPDATE "Message" SET status='pending' WHERE status='processing'`;
    console.log("Reset stuck processing:", JSON.stringify(r1));

    // Count pending
    const pending = await sql`SELECT COUNT(*)::int as n FROM "Message" WHERE status='pending'`;
    console.log("Pending now:", pending[0].n);

    // Count processing
    const proc = await sql`SELECT COUNT(*)::int as n FROM "Message" WHERE status='processing'`;
    console.log("Processing now:", proc[0].n);

    // Count recent done
    const done = await sql`SELECT COUNT(*)::int as n FROM "Message" WHERE status='done' AND timestamp > NOW() - INTERVAL '1 hour'`;
    console.log("Done (last hour):", done[0].n);
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
