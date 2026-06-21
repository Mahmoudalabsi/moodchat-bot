require('dotenv').config({ path: '/home/z/my-project/.env' });
console.log('DATABASE_URL =', process.env.DATABASE_URL);
console.log('Length:', (process.env.DATABASE_URL || '').length);

const { neon } = require('@neondatabase/serverless');
(async () => {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const r = await sql`SELECT 1 as ok`;
    console.log('SUCCESS:', r);
  } catch (e) {
    console.log('FAIL:', e.message);
  }
})();
