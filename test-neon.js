const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql`SELECT 1 as ok, NOW() as now`.then(r => {
  console.log('OK:', JSON.stringify(r));
  process.exit(0);
}).catch(e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
