const { neon } = require('@neondatabase/serverless');

(async () => {
  // Test 1: with channel_binding
  console.log('=== Test 1: With channel_binding ===');
  try {
    const sql1 = neon('postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require');
    const r1 = await sql1`SELECT 1 as ok`;
    console.log('SUCCESS:', r1);
  } catch (e) {
    console.log('FAIL:', e.message);
  }

  // Test 2: without params
  console.log('\n=== Test 2: Without params ===');
  try {
    const sql2 = neon('postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb');
    const r2 = await sql2`SELECT 1 as ok`;
    console.log('SUCCESS:', r2);
  } catch (e) {
    console.log('FAIL:', e.message);
  }

  // Test 3: with sslmode only
  console.log('\n=== Test 3: With sslmode=require only ===');
  try {
    const sql3 = neon('postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require');
    const r3 = await sql3`SELECT 1 as ok`;
    console.log('SUCCESS:', r3);
  } catch (e) {
    console.log('FAIL:', e.message);
  }
})();
