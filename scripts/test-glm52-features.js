/**
 * Comprehensive end-to-end test for all GLM-5.2 agent features in the bot.
 *
 * For each feature:
 *   1. Insert a pending message in the DB
 *   2. Wait for the worker to process it
 *   3. Read the assistant reply from the DB
 *   4. Verify the reply exists, is non-empty, and matches expectations
 *
 * Usage: DATABASE_URL=... node scripts/test-glm52-features.js
 */

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

function cuid() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return 'c' + ts + rnd;
}

const TEST_USER = 1429407129; // admin
const TEST_CHAT = 1429407129;

async function insertPending(content, modelUsed) {
  const id = cuid();
  await sql`
    INSERT INTO "Message" (id, "userId", "chatId", role, content, "modelUsed", status, "timestamp")
    VALUES (${id}, ${TEST_USER}, ${TEST_CHAT}, 'user', ${content}, ${modelUsed}, 'pending', NOW())
  `;
  return id;
}

async function getReply(parentContentMatch, since) {
  // Look for an assistant message with content containing the match, created after `since`
  const replies = await sql`
    SELECT content, "modelUsed", "timestamp"
    FROM "Message"
    WHERE role = 'assistant'
      AND "timestamp" > ${since}
      AND content ILIKE ${'%' + parentContentMatch + '%'}
    ORDER BY "timestamp" DESC
    LIMIT 1
  `;
  return replies[0] || null;
}

async function waitForReply(parentContentMatch, since, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await getReply(parentContentMatch, since);
    if (r) return r;
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

async function clearHistory() {
  // Mark all existing messages as done so they don't interfere
  await sql`UPDATE "Message" SET status = 'done' WHERE status = 'pending'`;
}

const tests = [
  {
    name: '1. Default chat (GLM-5.2, no tools)',
    content: 'مرحبا، من أنت؟',
    modelUsed: 'moodchat',
    expectContains: 'مود',
    timeoutMs: 30000,
  },
  {
    name: '2. Thinking mode (GLM-5.2 + reasoning)',
    content: 'think:ما ناتج 17 × 24؟ اشرح طريقة الحل خطوة بخطوة',
    modelUsed: 'moodchat',
    expectContains: '408',
    timeoutMs: 60000,
  },
  {
    name: '3. Agent mode (GLM-5.2 + tools, should call web_search)',
    content: 'agent:ما أحدث إصدار من ChatGPT أو GLM؟',
    modelUsed: 'moodchat',
    expectContains: '',  // just verify non-empty
    timeoutMs: 60000,
  },
  {
    name: '4. Simple prefix (TTS)',
    content: 'tts:هذا اختبار لميزة تحويل النص إلى صوت',
    modelUsed: 'moodchat',
    expectContains: '',  // TTS replies differently — check assistant message
    timeoutMs: 40000,
  },
  {
    name: '5. Web search prefix',
    content: 'search:عاصمة اليابان',
    modelUsed: 'moodchat',
    expectContains: 'طوكيو',
    timeoutMs: 40000,
  },
  {
    name: '6. Page reader prefix',
    content: 'read:https://example.com',
    modelUsed: 'moodchat',
    expectContains: '',  // summary of example.com
    timeoutMs: 40000,
  },
  {
    name: '7. Image generation',
    content: 'draw:دائرة حمراء بسيطة',
    modelUsed: 'moodchat',
    expectContains: '',  // photo sent
    timeoutMs: 90000,
  },
];

(async () => {
  console.log('=== GLM-5.2 Features End-to-End Test ===\n');
  await clearHistory();
  
  const results = [];
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`  Inserting: "${test.content.substring(0, 60)}..."`);
    const since = new Date();
    const msgId = await insertPending(test.content, test.modelUsed);
    console.log(`  Pending message id=${msgId}, waiting for reply...`);
    
    let reply;
    let testPassed = false;
    let failReason = '';
    
    // For TTS and draw, the assistant message is different — search by other markers
    let searchMatch = test.content.substring(0, 30);
    if (test.content.startsWith('tts:')) {
      searchMatch = 'تحويل النص';
    } else if (test.content.startsWith('draw:')) {
      searchMatch = 'توليد صورة';
    } else if (test.content.startsWith('read:')) {
      searchMatch = ''; // any reply
    } else if (test.content.startsWith('search:')) {
      searchMatch = test.expectContains;
    } else if (test.content.startsWith('think:')) {
      searchMatch = test.expectContains;
    } else if (test.content.startsWith('agent:')) {
      // Agent mode reply — just look for any recent assistant reply
      searchMatch = '';
    }
    
    if (searchMatch) {
      reply = await waitForReply(searchMatch, since, test.timeoutMs);
    } else {
      // Look for any assistant reply after since
      const replies = await sql`
        SELECT content, "modelUsed", "timestamp"
        FROM "Message"
        WHERE role = 'assistant' AND "timestamp" > ${since}
        ORDER BY "timestamp" DESC LIMIT 1
      `;
      reply = replies[0] || null;
      // Poll a few times if not found
      for (let i = 0; i < 15 && !reply; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r2 = await sql`
          SELECT content, "modelUsed", "timestamp"
          FROM "Message"
          WHERE role = 'assistant' AND "timestamp" > ${since}
          ORDER BY "timestamp" DESC LIMIT 1
        `;
        reply = r2[0] || null;
      }
    }
    
    if (!reply) {
      failReason = `No reply received within ${test.timeoutMs}ms`;
    } else if (test.expectContains && !reply.content.toLowerCase().includes(test.expectContains.toLowerCase())) {
      failReason = `Reply does not contain "${test.expectContains}". Got: "${reply.content.substring(0, 150)}"`;
    } else {
      testPassed = true;
      console.log(`  ✅ PASS: model=${reply.modelUsed}, content="${reply.content.substring(0, 120)}..."`);
    }
    
    if (!testPassed) {
      console.log(`  ❌ FAIL: ${failReason}`);
      if (reply) {
        console.log(`     Reply was: "${reply.content.substring(0, 200)}"`);
      }
    }
    
    results.push({ name: test.name, passed: testPassed, reason: failReason, reply: reply?.content?.substring(0, 150) });
    
    // Rate limit between tests
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n\n=== Test Summary ===');
  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}${r.passed ? '' : ' — ' + r.reason}`);
    if (r.passed) passed++; else failed++;
  }
  console.log(`\nTotal: ${passed}/${results.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
