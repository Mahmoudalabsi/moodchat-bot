/**
 * Smart Intent Router — End-to-End Test
 *
 * Verifies that GLM-5.2's function calling correctly routes natural-language
 * requests (without prefix) to the right capability.
 *
 * Each test inserts a plain message starting with NO prefix, then waits for
 * the worker to process it and checks that the correct capability was invoked
 * (by checking the modelUsed tag on the resulting assistant message).
 *
 * Usage: DATABASE_URL=... node scripts/test-smart-intent.js
 */

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

function cuid() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return 'c' + ts + rnd;
}

const TEST_USER = 1429407129;
const TEST_CHAT = 1429407129;

async function insertPending(content) {
  const id = cuid();
  await sql`
    INSERT INTO "Message" (id, "userId", "chatId", role, content, "modelUsed", status, "timestamp")
    VALUES (${id}, ${TEST_USER}, ${TEST_CHAT}, 'user', ${content}, 'moodchat', 'pending', NOW())
  `;
  return id;
}

// Wait for ANY assistant reply after `since` — return {content, modelUsed, timestamp}
async function waitForAnyAssistantReply(since, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const replies = await sql`
      SELECT content, "modelUsed", "timestamp"
      FROM "Message"
      WHERE role = 'assistant' AND "timestamp" > ${since}
      ORDER BY "timestamp" DESC LIMIT 5
    `;
    if (replies.length > 0) return replies[0];
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

async function clearPending() {
  await sql`UPDATE "Message" SET status = 'done' WHERE status = 'pending'`;
}

// Test cases — each is a NATURAL LANGUAGE request (NO prefix)
// expectedModelTag: what modelUsed the assistant reply should have
const tests = [
  {
    name: '1. TTS via natural language (Arabic)',
    content: 'بسم الله الرحمن الرحيم، حول النص لصوت',
    expectedModelTag: 'moodchat-tts',
    timeoutMs: 45000,
  },
  {
    name: '2. TTS via natural language (variant phrasing)',
    content: 'انطق هذا النص بصوت عالٍ: مرحباً بك في مود شات',
    expectedModelTag: 'moodchat-tts',
    timeoutMs: 45000,
  },
  {
    name: '3. Image gen via natural language',
    content: 'ارسم لي صورة قطة لطيفة',
    expectedModelTag: 'moodchat-draw',
    timeoutMs: 90000,
  },
  {
    name: '4. Image gen (English phrasing)',
    content: 'please generate an image of a sunset over mountains',
    expectedModelTag: 'moodchat-draw',
    timeoutMs: 90000,
  },
  {
    name: '5. Web search via natural language',
    content: 'ابحث لي عن معلومات حول الذكاء الاصطناعي',
    expectedModelTag: 'moodchat-search',
    timeoutMs: 50000,
  },
  {
    name: '6. Deep think via natural language',
    content: 'فكر بعمق: ما هو سبب الكسوف الشمسي؟ اشرح بالتفصيل',
    expectedModelTag: 'moodchat-think',
    timeoutMs: 60000,
  },
  {
    name: '7. Plain chat — should NOT route to any feature',
    content: 'مرحبا، كيف حالك اليوم؟',
    expectedModelTag: 'moodchat-zai',  // plain chat tag
    timeoutMs: 30000,
  },
  {
    name: '8. Plain chat (technical question) — should NOT route',
    content: 'ما هي عاصمة فرنسا؟',
    expectedModelTag: 'moodchat-zai',
    timeoutMs: 30000,
  },
];

(async () => {
  console.log('=== Smart Intent Router Test (GLM-5.2 function calling) ===\n');
  console.log(`Tests: ${tests.length}\n`);

  await clearPending();

  const results = [];
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`  Message: "${test.content.substring(0, 70)}${test.content.length > 70 ? '...' : ''}"`);

    const since = new Date();
    const msgId = await insertPending(test.content);
    console.log(`  Inserted pending msg id=${msgId}, waiting for worker...`);

    const reply = await waitForAnyAssistantReply(since, test.timeoutMs);

    let passed = false;
    let reason = '';
    if (!reply) {
      reason = `No reply within ${test.timeoutMs}ms`;
    } else if (reply.modelUsed !== test.expectedModelTag) {
      reason = `Expected modelUsed="${test.expectedModelTag}" but got "${reply.modelUsed}". Reply: "${(reply.content || '').substring(0, 120)}"`;
    } else {
      passed = true;
    }

    if (passed) {
      console.log(`  ✅ PASS — modelUsed="${reply.modelUsed}"`);
      console.log(`     Reply: "${(reply.content || '').substring(0, 120)}..."`);
    } else {
      console.log(`  ❌ FAIL — ${reason}`);
    }

    results.push({ name: test.name, passed, reason, modelUsed: reply?.modelUsed });

    // Rate limit between tests (avoid hammering Z-AI)
    await new Promise(r => setTimeout(r, 4000));
  }

  console.log('\n\n=== Summary ===');
  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}${r.passed ? ` (modelUsed=${r.modelUsed})` : ` — ${r.reason}`}`);
    if (r.passed) passed++; else failed++;
  }
  console.log(`\nTotal: ${passed}/${results.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
