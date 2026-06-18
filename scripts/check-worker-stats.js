const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  console.log('=== BotConfig rows related to worker ===\n');
  const rows = await sql`
    SELECT key, value
    FROM "BotConfig"
    WHERE key LIKE '%worker%' OR key LIKE '%heart%' OR key LIKE '%stats%'
    ORDER BY key
  `;
  for (const r of rows) {
    const valPreview = (r.value || '').toString().substring(0, 200);
    console.log(`Key:    ${r.key}`);
    console.log(`Value:  ${valPreview}`);
    console.log('---');
  }

  console.log('\n=== Counting total messages in DB ===');
  const counts = await sql`
    SELECT status, role, COUNT(*)::int as cnt
    FROM "Message"
    GROUP BY status, role
    ORDER BY role, status
  `;
  for (const c of counts) {
    console.log(`  ${c.role} / ${c.status}: ${c.cnt}`);
  }

  console.log('\n=== Most recent 5 messages ===');
  const recent = await sql`
    SELECT id, role, content, "modelUsed", status, "timestamp"
    FROM "Message"
    ORDER BY "timestamp" DESC
    LIMIT 5
  `;
  for (const m of recent) {
    console.log(`  [${m.timestamp}] ${m.role}/${m.status} (${m.modelUsed}): ${(m.content || '').substring(0, 80)}`);
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
