// تنظيف الرسائل الفاشلة
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  try {
    // حذف الرسائل الفاشلة
    const r = await sql`DELETE FROM "Message" WHERE status='failed'`;
    console.log("Deleted failed:", JSON.stringify(r));

    // إعادة تعيين الرسائل العالقة
    await sql`UPDATE "Message" SET status='pending' WHERE status='processing'`;

    // عرض الإحصائيات
    const stats = await sql`SELECT status, COUNT(*)::int as n FROM "Message" GROUP BY status ORDER BY status`;
    console.log("Stats:", JSON.stringify(stats));
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
