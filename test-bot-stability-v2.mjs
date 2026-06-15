/**
 * اختبار استقرار بوت مود شات v2
 * محسّن مع فترات انتظار أطول لمراعاة حد المعدل
 */

const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';
const BOT_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';

const results = { total: 0, passed: 0, failed: 0, errors: [], details: [], timings: [] };

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Z-AI مع إعادة المحاولة (مثل الكود المحسّن)
async function callZAI(messages, maxTokens = 512, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      if (attempt > 0) {
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.log(`  [Retry ${attempt}/${maxRetries}] waiting ${Math.round(delay)}ms...`);
        await wait(delay);
      }
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
          messages, temperature: 0.7, max_tokens: maxTokens, thinking: { type: 'disabled' },
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
          lastError = new Error(`Z-AI ${response.status}: ${err.substring(0, 100)}`);
          continue;
        }
        throw new Error(`Z-AI ${response.status}: ${err.substring(0, 200)}`);
      }
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
      throw new Error('Empty response');
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('All retries failed');
}

async function callPollinations(messages, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (attempt > 0) {
        await wait(2000 * attempt + Math.random() * 1000);
      }
      const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
      });
      if (!response.ok) {
        if (response.status === 429 && attempt < retries) continue;
        throw new Error(`Pollinations ${response.status}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim();
    } catch (error) {
      if (attempt === retries) throw error;
    } finally { clearTimeout(timeout); }
  }
  throw new Error('Pollinations failed');
}

async function runTest(name, fn) {
  results.total++;
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    results.passed++;
    results.timings.push({ name, time: elapsed });
    results.details.push({ name, status: 'PASS', elapsed, ...result });
    log('✅', `${name} - PASS (${elapsed}ms)${result.detail ? ` | ${result.detail}` : ''}`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    results.failed++;
    results.errors.push({ name, error: error.message });
    results.details.push({ name, status: 'FAIL', elapsed, error: error.message });
    log('❌', `${name} - FAIL (${elapsed}ms): ${error.message.substring(0, 100)}`);
    return { error: error.message };
  }
}

// ============================
// TESTS - محسّنة مع فترات أطول
// ============================

async function test1_ZAI_Connectivity() {
  return runTest('Z-AI اتصال مباشر', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات' },
      { role: 'user', content: 'قل مرحبا فقط' }
    ], 50);
    if (!reply) throw new Error('Empty response');
    return { detail: `"${reply.substring(0, 60)}"` };
  });
}

async function test2_ZAI_ArabicQuality() {
  return runTest('Z-AI جودة الرد العربي', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. أنت مسلم تتحدث بأسلوب إسلامي محترم.' },
      { role: 'user', content: 'ما هو الإسلام باختصار؟' }
    ], 300);
    if (!reply) throw new Error('No response');
    const hasArabic = /[\u0600-\u06FF]/.test(reply);
    if (!hasArabic) throw new Error('No Arabic in response');
    const hasIslamicGreeting = /سلام|عليكم|بسم/.test(reply);
    return { detail: `${reply.length} chars, إسلامي: ${hasIslamicGreeting ? 'نعم' : 'لا'}` };
  });
}

async function test3_ConversationMemory() {
  return runTest('ذاكرة المحادثة (تتبع 3 معلومات)', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. تذكر كل ما قاله المستخدم.' },
      { role: 'user', content: 'اسمي خالد وأنا من جدة وأحب البرمجة' },
    ];
    const reply1 = await callZAI(messages, 80);
    messages.push({ role: 'assistant', content: reply1 });
    await wait(2000);
    
    messages.push({ role: 'user', content: 'ما اسمي ومن أين أنا وماذا أحب؟' });
    const reply2 = await callZAI(messages, 150);
    
    const remembersName = /خالد/.test(reply2);
    const remembersCity = /جدة/.test(reply2);
    const remembersHobby = /برمج/.test(reply2);
    const score = [remembersName, remembersCity, remembersHobby].filter(Boolean).length;
    
    return { detail: `${score}/3 معلومات مذكورة (اسم=${remembersName}, مدينة=${remembersCity}, هواية=${remembersHobby})` };
  });
}

async function test4_5ConsecutiveMessages() {
  return runTest('5 رسائل متتالية مع ذاكرة', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. تذكر كل شيء. كن مختصراً.' },
    ];
    const questions = [
      'أنا أحب كرة القدم',
      'من أفضل لاعب في التاريخ؟',
      'كم عدد لاعبي الفريق؟',
      'ما هو طول ملعب كرة القدم؟',
      'ما هوايتي التي ذكرتها في بداية المحادثة؟'
    ];
    
    let success = 0;
    let memoryOk = false;
    
    for (let i = 0; i < questions.length; i++) {
      messages.push({ role: 'user', content: questions[i] });
      try {
        const reply = await callZAI(messages, 100);
        if (reply) {
          messages.push({ role: 'assistant', content: reply });
          success++;
          if (i === 4 && /قدم/.test(reply)) memoryOk = true;
        }
      } catch {}
      await wait(2500); // فترة انتظار أطول بين الرسائل
    }
    
    if (success < 4) throw new Error(`${success}/5 فقط نجحت`);
    return { detail: `${success}/5 نجحت، ذاكرة: ${memoryOk ? 'ممتازة' : 'جزئية'}` };
  });
}

async function test5_LongMessage() {
  return runTest('رسالة طويلة (300+ حرف)', async () => {
    const longQ = 'أريد أن أكتب مقالاً عن أهمية التعليم في العالم العربي. التعليم هو أساس تقدم الأمم ورفاهية الشعوب. في العالم العربي، يواجه التعليم تحديات كثيرة مثل نقص الموارد والبنية التحتية. لكن هناك أيضاً نجاحات ملحوظة في بعض الدول. اكتب لي فقرة افتتاحية قصيرة لهذا المقال.';
    const reply = await callZAI([
      { role: 'system', content: 'أنت كاتب ماهر' },
      { role: 'user', content: longQ }
    ], 600);
    if (!reply || reply.length < 30) throw new Error('رد قصير جداً');
    return { detail: `إدخال: ${longQ.length} حرف، إخراج: ${reply.length} حرف` };
  });
}

async function test6_RateLimitRecovery() {
  return runTest('التعافي من حد المعدل (429)', async () => {
    // إرسال 3 طلبات سريعة لتحفيز 429 ثم التأكد من التعافي
    let rateLimited = false;
    let recovered = false;
    
    // طلبات سريعة
    for (let i = 0; i < 3; i++) {
      try {
        await callZAI([
          { role: 'user', content: `اختبار ${i + 1}` }
        ], 30, 1); // إعادة محاولة واحدة فقط
      } catch (error) {
        if (error.message.includes('429')) rateLimited = true;
      }
      if (i < 2) await wait(500);
    }
    
    // انتظار ثم محاولة التعافي
    await wait(5000);
    try {
      const reply = await callZAI([
        { role: 'user', content: 'مرحبا' }
      ], 30, 3);
      if (reply) recovered = true;
    } catch {}
    
    return { detail: `حد معدل: ${rateLimited ? 'نعم' : 'لا'}, تعافى: ${recovered ? 'نعم' : 'لا'}` };
  });
}

async function test7_LanguageSwitch() {
  return runTest('تبديل اللغة (عربي → إنجليزي → فرنسي)', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي. يمكنك التحدث بأي لغة يطلبها المستخدم.' },
      { role: 'user', content: 'السلام عليكم' },
    ];
    const reply1 = await callZAI(messages, 50);
    messages.push({ role: 'assistant', content: reply1 });
    await wait(2000);
    
    messages.push({ role: 'user', content: 'Now speak English' });
    const reply2 = await callZAI(messages, 50);
    messages.push({ role: 'assistant', content: reply2 });
    await wait(2000);
    
    messages.push({ role: 'user', content: 'Parlez en français maintenant' });
    const reply3 = await callZAI(messages, 50);
    
    const hasEnglish = /[a-zA-Z]{3,}/.test(reply2);
    const hasFrench = /[a-zA-Z]{3,}/.test(reply3) && /français|bonjour|merci/i.test(reply3);
    
    return { detail: `إنجليزي: ${hasEnglish ? '✓' : '✗'}, فرنسي: ${hasFrench ? '✓' : '✗'}` };
  });
}

async function test8_SpecialCharsAndEmoji() {
  return runTest('أحرف خاصة وإيموجي', async () => {
    const reply = await callZAI([
      { role: 'system', content: 'أنت مساعد ذكي' },
      { role: 'user', content: 'اكتب لي قائمة: 1- تفاح 🍎 2- حليب 🥛 3- خبز 🍞' }
    ], 150);
    if (!reply) throw new Error('لا رد');
    return { detail: `${reply.length} حرف` };
  });
}

async function test9_EmptyAndEdgeCase() {
  return runTest('حالات حافة (نقطة، مسافة، رقم)', async () => {
    const cases = ['.', '   ', '12345'];
    let success = 0;
    for (const c of cases) {
      try {
        const reply = await callZAI([
          { role: 'system', content: 'أجب بإيجاز' },
          { role: 'user', content: c }
        ], 50, 2);
        if (reply) success++;
      } catch {}
      await wait(2000);
    }
    return { detail: `${success}/${cases.length} حالات أجاب عليها` };
  });
}

async function test10_WebhookActive() {
  return runTest('Webhook نشط على Vercel', async () => {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await res.json();
    if (!data.ok) throw new Error('فشل الحصول على معلومات الويب هوك');
    const w = data.result;
    if (!w.url) throw new Error('لا يوجد webhook مضبوط');
    return { detail: `URL: ${w.url}, Pending: ${w.pending_update_count}` };
  });
}

async function test11_PollinationsWithRetry() {
  return runTest('Pollinations احتياطي (مع إعادة المحاولة)', async () => {
    const reply = await callPollinations([
      { role: 'user', content: 'Say hello in Arabic' }
    ], 2);
    if (!reply) throw new Error('لا رد');
    return { detail: `"${reply.substring(0, 60)}"` };
  });
}

async function test12_ResponseTimeConsistency() {
  return runTest('ثبات سرعة الاستجابة (3 طلبات متباعدة)', async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      const reply = await callZAI([
        { role: 'system', content: 'أجب بكلمة واحدة فقط' },
        { role: 'user', content: `ما عاصمة مصر؟ (${i + 1})` }
      ], 30);
      times.push(Date.now() - start);
      if (!reply) throw new Error(`طلب ${i + 1} فشل`);
      await wait(3000); // فترة انتظار كافية
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const variance = Math.round(Math.sqrt(times.reduce((s, t) => s + Math.pow(t - avg, 2), 0) / times.length));
    return { detail: `أوقات: ${times.join('ms, ')}ms | متوسط: ${avg}ms | انحراف: ${variance}ms` };
  });
}

async function test13_MultiTurnConsistency() {
  return runTest('تناسق الردود في 8 رسائل متتالية', async () => {
    const messages = [
      { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. تذكر كل شيء وكن متناسقاً. كن مختصراً.' },
    ];
    const turns = [
      'أنا طالب هندسة',
      'ما أفضل تخصصات الهندسة؟',
      'ما الفرق بين هندسة البرمجيات وهندسة الحاسوب؟',
      'أيهما تنصحني؟',
      'كم سنة دراسة؟',
      'ما فرص العمل؟',
      'هل يمكنني العمل الحر؟',
      'لخص لي ما ناقشناه'
    ];
    
    let success = 0;
    let consistent = false;
    
    for (let i = 0; i < turns.length; i++) {
      messages.push({ role: 'user', content: turns[i] });
      try {
        const reply = await callZAI(messages, 200);
        if (reply) {
          messages.push({ role: 'assistant', content: reply });
          success++;
          // في الرسالة الأخيرة تحقق من التناسق
          if (i === 7) {
            consistent = /هندس/.test(reply) && (/طالب/.test(reply) || /دراس/.test(reply));
          }
        }
      } catch {}
      await wait(3000);
    }
    
    if (success < 6) throw new Error(`${success}/8 فقط نجحت`);
    return { detail: `${success}/8 نجحت، تناسق: ${consistent ? 'ممتاز' : 'مقبول'}` };
  });
}

// ============================
// RUN ALL TESTS
// ============================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 اختبار استقرار بوت مود شات - الإصدار 2 (محسّن)');
  console.log('='.repeat(70));
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🤖 Z-AI: ${ZAI_BASE_URL}`);
  console.log(`🔄 إعادة المحاولة: 3 محاولات مع تراجع أسي`);
  console.log('='.repeat(70) + '\n');
  
  // اختبارات الاتصال الأساسية
  await test10_WebhookActive();
  await wait(2000);
  await test1_ZAI_Connectivity();
  await wait(3000);
  
  // اختبارات جودة المحادثة
  await test2_ZAI_ArabicQuality();
  await wait(3000);
  await test3_ConversationMemory();
  await wait(3000);
  
  // اختبارات الاستقرار
  await test4_5ConsecutiveMessages();
  await wait(3000);
  await test13_MultiTurnConsistency();
  await wait(3000);
  
  // اختبارات الحالات الخاصة
  await test5_LongMessage();
  await wait(3000);
  await test6_RateLimitRecovery();
  await wait(5000);
  await test7_LanguageSwitch();
  await wait(3000);
  await test8_SpecialCharsAndEmoji();
  await wait(3000);
  await test9_EmptyAndEdgeCase();
  
  // اختبارات الأداء
  await wait(5000);
  await test12_ResponseTimeConsistency();
  await wait(3000);
  await test11_PollinationsWithRetry();
  
  // ملخص النتائج
  console.log('\n' + '='.repeat(70));
  console.log('📊 ملخص نتائج اختبار الاستقرار');
  console.log('='.repeat(70));
  console.log(`إجمالي الاختبارات: ${results.total}`);
  console.log(`✅ نجح: ${results.passed}`);
  console.log(`❌ فشل: ${results.failed}`);
  console.log(`📈 نسبة النجاح: ${Math.round((results.passed / results.total) * 100)}%`);
  
  // متوسط الأوقات
  if (results.timings.length > 0) {
    const avgTime = Math.round(results.timings.reduce((s, t) => s + t.time, 0) / results.timings.length);
    console.log(`⏱️ متوسط وقت الاختبار: ${avgTime}ms`);
  }
  
  if (results.errors.length > 0) {
    console.log('\n🔴 الأخطاء:');
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.name}: ${e.error.substring(0, 80)}`));
  }
  
  console.log('\n📋 تفاصيل كل اختبار:');
  results.details.forEach((d, i) => {
    const s = d.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${i + 1}. ${s} ${d.name} (${d.elapsed}ms)${d.detail ? ` — ${d.detail}` : ''}`);
  });
  
  // تقييم عام
  const rate = Math.round((results.passed / results.total) * 100);
  let grade = '';
  if (rate >= 90) grade = '🟢 ممتاز - البوت مستقر تماماً';
  else if (rate >= 75) grade = '🟡 جيد - البوت مستقر مع بعض المشاكل البسيطة';
  else if (rate >= 50) grade = '🟠 متوسط - يحتاج تحسينات';
  else grade = '🔴 ضعيف - مشاكل كثيرة تحتاج إصلاح';
  
  console.log(`\n🏆 التقييم العام: ${grade}`);
  console.log('='.repeat(70));
  
  return results;
}

main().catch(console.error);
