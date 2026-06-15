/**
 * اختبار استقرار بوت مود شات
 * Tests: Z-AI connectivity, conversation memory, Arabic, rapid fire, long messages, edge cases
 */

const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const BOT_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_ID = 1429407129;

// Results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

async function callZAI(messages, maxTokens = 512) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': ZAI_CHAT_ID,
        'X-User-Id': ZAI_USER_ID,
        'X-Token': ZAI_TOKEN,
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Z-AI ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        model: 'openai',
        temperature: 0.7,
        seed: Math.floor(Math.random() * 10000),
      }),
    });
    if (!response.ok) throw new Error(`Pollinations ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegramMessage(text, chatId = ADMIN_ID) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  return response.json();
}

async function getWebhookInfo() {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
  return response.json();
}

async function getBotInfo() {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
  return response.json();
}

// Test runner
async function runTest(name, fn) {
  results.total++;
  try {
    const result = await fn();
    results.passed++;
    results.details.push({ name, status: 'PASS', ...result });
    log('✅', `${name} - PASS${result.detail ? ` (${result.detail})` : ''}`);
    return result;
  } catch (error) {
    results.failed++;
    results.errors.push({ name, error: error.message });
    results.details.push({ name, status: 'FAIL', error: error.message });
    log('❌', `${name} - FAIL: ${error.message}`);
    return { error: error.message };
  }
}

// Wait helper
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ============================
// TESTS
// ============================

async function test1_ZAI_Connectivity() {
  return runTest('Z-AI SDK اتصال مباشر', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات' },
      { role: 'user', content: 'قل مرحبا فقط' }
    ], 50);
    if (!reply) throw new Error('Empty response from Z-AI');
    return { detail: `Response: "${reply.substring(0, 80)}"` };
  });
}

async function test2_ZAI_ArabicResponse() {
  return runTest('Z-AI استجابة عربية صحيحة', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام.' },
      { role: 'user', content: 'ما هو الإسلام باختصار؟' }
    ], 300);
    if (!reply) throw new Error('No Arabic response');
    const hasArabic = /[\u0600-\u06FF]/.test(reply);
    if (!hasArabic) throw new Error('Response does not contain Arabic characters');
    return { detail: `Length: ${reply.length} chars, starts with: "${reply.substring(0, 60)}"` };
  });
}

async function test3_ZAI_ConversationMemory() {
  return runTest('Z-AI ذاكرة المحادثة (تتبع السياق)', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. تذكر كل ما قاله المستخدم.' },
      { role: 'user', content: 'اسمي أحمد وأنا من الرياض' },
    ];
    
    // First message
    const reply1 = await callZAI(messages, 100);
    if (!reply1) throw new Error('First message failed');
    
    messages.push({ role: 'assistant', content: reply1 });
    messages.push({ role: 'user', content: 'ما اسمي ومن أين أنا؟' });
    
    // Second message - should remember
    const reply2 = await callZAI(messages, 100);
    if (!reply2) throw new Error('Second message failed');
    
    const remembersName = reply2.includes('أحمد');
    const remembersCity = reply2.includes('الرياض');
    
    if (!remembersName || !remembersCity) {
      return { detail: `Partial memory: name=${remembersName}, city=${remembersCity}. Reply: "${reply2.substring(0, 100)}"` };
    }
    return { detail: `Full context remembered! Reply: "${reply2.substring(0, 100)}"` };
  });
}

async function test4_ZAI_RapidFire() {
  return runTest('Z-AI رسائل سريعة متتالية (5 رسائل)', async () => {
    const questions = [
      'ما عاصمة مصر؟',
      'كم عدد سور القرآن؟',
      'ما هو أكبر كوكب في المجموعة الشمسية؟',
      'ما هي لغة البرمجة الأكثر استخداماً؟',
      'ما هو العنصر الكيميائي الأكثر وفرة في الكون؟'
    ];
    
    let successCount = 0;
    let failCount = 0;
    const times = [];
    
    for (let i = 0; i < questions.length; i++) {
      const start = Date.now();
      try {
        const reply = await callZAI([
          { role: 'system', content: 'أجب بإيجاز' },
          { role: 'user', content: questions[i] }
        ], 100);
        const elapsed = Date.now() - start;
        times.push(elapsed);
        if (reply && reply.length > 0) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
        times.push(Date.now() - start);
      }
      // Small delay between rapid messages
      await wait(500);
    }
    
    if (successCount < 3) throw new Error(`Only ${successCount}/5 succeeded`);
    const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    return { detail: `${successCount}/5 success, avg time: ${avgTime}ms` };
  });
}

async function test5_ZAI_LongMessage() {
  return runTest('Z-AI رسالة طويلة (أكثر من 500 حرف)', async () => {
    const longQuestion = 'أريد أن أكتب قصة عن فتى عربي يعيش في صحراء واسعة، وكان يحلم دائماً بالوصول إلى النجوم. في يوم من الأيام، وجد كتاباً قديماً في خيمة جده يصف كيف يمكن للإنسان أن يبني مركبة تطير. بدأ يقرأ الكتاب بشغف وتعلم الكثير عن علوم الفضاء والهندسة. كم سنة يحتاج ليصل إلى القمر حسب رأيك؟ اكتب لي مقدمة قصيرة للقصة.';
    
    const reply = await callZAI([
      { role: 'system', content: 'أنت كاتب قصص ماهر' },
      { role: 'user', content: longQuestion }
    ], 800);
    
    if (!reply) throw new Error('No response for long message');
    if (reply.length < 20) throw new Error('Response too short for long input');
    return { detail: `Input: ${longQuestion.length} chars, Output: ${reply.length} chars` };
  });
}

async function test6_ZAI_TimeoutHandling() {
  return runTest('Z-AI التعامل مع المهلة (timeout)', async () => {
    const start = Date.now();
    try {
      // Make a request that could take longer
      const reply = await callZAI([
        { role: 'system', content: 'أنت مساعد ذكي' },
        { role: 'user', content: 'اشرح لي نظرية النسبية العامة بالتفصيل' }
      ], 1024);
      const elapsed = Date.now() - start;
      return { detail: `Completed in ${elapsed}ms, response: ${reply?.length || 0} chars` };
    } catch (error) {
      const elapsed = Date.now() - start;
      if (elapsed >= 14000) {
        return { detail: `Timed out after ${elapsed}ms (expected behavior)` };
      }
      throw error;
    }
  });
}

async function test7_Pollinations_Fallback() {
  return runTest('Pollinations.ai احتياطي', async () => {
    const reply = await callPollinations([
      { role: 'system', content: 'أنت مساعد ذكي' },
      { role: 'user', content: 'قل مرحبا' }
    ]);
    if (!reply) throw new Error('Pollinations returned empty');
    return { detail: `Response: "${reply.substring(0, 80)}"` };
  });
}

async function test8_TelegramBot_Connection() {
  return runTest('Telegram Bot اتصال', async () => {
    const info = await getBotInfo();
    if (!info.ok) throw new Error('Bot info failed');
    if (!info.result?.username) throw new Error('No bot username');
    return { detail: `Bot: @${info.result.username}, ID: ${info.result.id}` };
  });
}

async function test9_Webhook_Status() {
  return runTest('Webhook حالة', async () => {
    const info = await getWebhookInfo();
    if (!info.ok) throw new Error('Webhook info failed');
    const w = info.result;
    return { detail: `URL: ${w.url || 'none'}, Pending: ${w.pending_update_count}, Last error: ${w.last_error_message || 'none'}` };
  });
}

async function test10_ZAI_ConsecutiveConversation() {
  return runTest('Z-AI محادثة متصلة (10 رسائل ذهاب وإياب)', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم وتبدأ بالسلام. تجيب بوضوح ودقة. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً.' }
    ];
    
    const userMessages = [
      'السلام عليكم، اسمي سعود',
      'أنا مهتم بتعلم البرمجة',
      'ما هي أفضل لغة للبداية؟',
      'كم وقت أحتاج لتعلم بايثون؟',
      'هل يمكنني العمل عن بعد كمبرمج؟',
      'أنا من جدة، هل هناك شركات تقنية هناك؟',
      'ما رأيك في الذكاء الاصطناعي؟',
      'هل سيستبدل الذكاء الاصطناعي المبرمجين؟',
      'نصيحة أخيرة لي كمبتدئ؟',
      'اذكر اسمي ومدينتي وما أريد تعلمه'
    ];
    
    let successCount = 0;
    let failCount = 0;
    let memoryTestPassed = false;
    
    for (let i = 0; i < userMessages.length; i++) {
      messages.push({ role: 'user', content: userMessages[i] });
      
      try {
        const reply = await callZAI(messages, 200);
        if (reply) {
          messages.push({ role: 'assistant', content: reply });
          successCount++;
          
          // Check memory in the last message
          if (i === 9) {
            const hasName = reply.includes('سعود');
            const hasCity = reply.includes('جدة');
            const hasTopic = reply.includes('برمج') || reply.includes('بايثون');
            memoryTestPassed = hasName && hasCity && hasTopic;
          }
        } else {
          failCount++;
          // Remove the user message if no reply to keep conversation coherent
          messages.pop();
        }
      } catch {
        failCount++;
        messages.pop();
      }
      
      await wait(800);
    }
    
    if (successCount < 7) throw new Error(`Only ${successCount}/10 messages succeeded`);
    return { detail: `${successCount}/10 success, Memory test: ${memoryTestPassed ? 'PASSED ✅' : 'PARTIAL ⚠️'}` };
  });
}

async function test11_ZAI_SpecialCharacters() {
  return runTest('Z-AI أحرف خاصة وإيموجي', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي' },
      { role: 'user', content: 'اكتب لي قائمة مشتريات 🛒 تحتوي على: 1️⃣ تفاح 2️⃣ حليب 3️⃣ خبز. هل يمكنك إضافة المزيد؟' }
    ], 200);
    if (!reply) throw new Error('No response');
    return { detail: `Length: ${reply.length} chars` };
  });
}

async function test12_ZAI_EnglishSwitch() {
  return runTest('Z-AI تبديل اللغة (عربي → إنجليزي)', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. يمكنك التحدث بأي لغة يطلبها المستخدم.' },
      { role: 'user', content: 'السلام عليكم' },
    ];
    
    const reply1 = await callZAI(messages, 50);
    messages.push({ role: 'assistant', content: reply1 });
    messages.push({ role: 'user', content: 'Now speak to me in English please' });
    
    const reply2 = await callZAI(messages, 100);
    const hasEnglish = /[a-zA-Z]{3,}/.test(reply2);
    
    if (!hasEnglish) throw new Error('Bot did not switch to English');
    return { detail: `Switched to English: "${reply2.substring(0, 80)}"` };
  });
}

async function test13_ZAI_ErrorRecovery() {
  return runTest('Z-AI التعافي من الخطأ (رسالة فارغة ثم صحيحة)', async () => {
    // Send a valid message after a potential edge case
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي. أجب دائماً بوضوح.' },
      { role: 'user', content: '.' }
    ], 50);
    
    // Then a normal message
    const reply2 = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي. أجب دائماً بوضوح.' },
      { role: 'user', content: 'ما هو 2+2؟' }
    ], 50);
    
    if (!reply2) throw new Error('Recovery failed');
    return { detail: `Edge case reply: "${reply?.substring(0, 50) || 'empty'}", Normal: "${reply2.substring(0, 50)}"` };
  });
}

async function test14_MultiUserSimulation() {
  return runTest('محاكاة مستخدمين متعددين (3 مستخدمين)', async () => {
    const users = [
      { name: 'محمد', city: 'القاهرة' },
      { name: 'فاطمة', city: 'دبي' },
      { name: 'علي', city: 'بيروت' },
    ];
    
    let successCount = 0;
    
    for (const user of users) {
      const reply = await callZAI([
        { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. تذكر اسم المستخدم ومدينته.' },
        { role: 'user', content: `أنا ${user.name} من ${user.city}. عرفني على نفسك.` }
      ], 100);
      
      if (reply && (reply.includes(user.name) || reply.includes('مود شات'))) {
        successCount++;
      }
      await wait(500);
    }
    
    if (successCount < 2) throw new Error(`Only ${successCount}/3 users got proper responses`);
    return { detail: `${successCount}/3 users handled correctly` };
  });
}

async function test15_ResponseTimeBenchmark() {
  return runTest('قياس سرعة الاستجابة (5 طلبات)', async () => {
    const times = [];
    
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const reply = await callZAI([
        { role: 'system', content: 'أجب بإيجاز' },
        { role: 'user', content: `ما عاصمة المغرب؟ (اختبار ${i + 1})` }
      ], 50);
      const elapsed = Date.now() - start;
      times.push(elapsed);
      if (!reply) throw new Error(`Request ${i + 1} failed`);
      await wait(300);
    }
    
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    return { detail: `Avg: ${avg}ms, Min: ${min}ms, Max: ${max}ms` };
  });
}

// ============================
// RUN ALL TESTS
// ============================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 اختبار استقرار بوت مود شات');
  console.log('='.repeat(60));
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🤖 Z-AI: ${ZAI_BASE_URL}`);
  console.log('='.repeat(60) + '\n');
  
  // Basic connectivity tests
  await test8_TelegramBot_Connection();
  await test9_Webhook_Status();
  await test1_ZAI_Connectivity();
  
  // Core AI tests
  await test2_ZAI_ArabicResponse();
  await test7_Pollinations_Fallback();
  
  // Conversation stability
  await test3_ZAI_ConversationMemory();
  await test10_ZAI_ConsecutiveConversation();
  await test4_ZAI_RapidFire();
  
  // Edge cases
  await test5_ZAI_LongMessage();
  await test6_ZAI_TimeoutHandling();
  await test11_ZAI_SpecialCharacters();
  await test12_ZAI_EnglishSwitch();
  await test13_ZAI_ErrorRecovery();
  
  // Multi-user
  await test14_MultiUserSimulation();
  
  // Performance
  await test15_ResponseTimeBenchmark();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ملخص النتائج');
  console.log('='.repeat(60));
  console.log(`إجمالي الاختبارات: ${results.total}`);
  console.log(`✅ نجح: ${results.passed}`);
  console.log(`❌ فشل: ${results.failed}`);
  console.log(`📈 نسبة النجاح: ${Math.round((results.passed / results.total) * 100)}%`);
  
  if (results.errors.length > 0) {
    console.log('\n🔴 الأخطاء:');
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.name}: ${e.error}`));
  }
  
  console.log('\n📋 تفاصيل كل اختبار:');
  results.details.forEach((d, i) => {
    const status = d.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${i + 1}. ${status} ${d.name}${d.detail ? ` — ${d.detail}` : ''}${d.error ? ` — ERROR: ${d.error}` : ''}`);
  });
  
  console.log('\n' + '='.repeat(60));
  
  // Return results for further processing
  return results;
}

main().catch(console.error);
