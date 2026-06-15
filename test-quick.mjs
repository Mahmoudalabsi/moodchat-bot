const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;

async function callZAI(messages, maxTokens = 100, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      if (i > 0) await wait(1000 * Math.pow(2, i - 1) + Math.random() * 500);
      const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ZAI_API_KEY}`,
          'X-Z-AI-From': 'Z',
          'X-Chat-Id': ZAI_CHAT_ID,
          'X-User-Id': ZAI_USER_ID,
          'X-Token': ZAI_TOKEN,
        },
        signal: ctrl.signal,
        body: JSON.stringify({ messages, temperature: 0.7, max_tokens: maxTokens, thinking: { type: 'disabled' } }),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && i < retries - 1) continue;
        throw new Error(`Z-AI ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim();
    } catch (e) { if (i === retries - 1) throw e; } finally { clearTimeout(t); }
  }
}

async function test(name, fn) {
  try {
    const r = await fn();
    pass++;
    console.log(`✅ ${name}${r ? ' — ' + r : ''}`);
  } catch (e) {
    fail++;
    console.log(`❌ ${name} — ${e.message.substring(0, 80)}`);
  }
}

async function main() {
  console.log('🧪 اختبار استقرار مود شات (سريع)\n');
  
  // 1. اتصال مباشر
  await test('اتصال Z-AI', async () => {
    const r = await callZAI([{role:'user',content:'قل مرحبا'}], 30);
    return r?.substring(0, 40);
  });
  await wait(2000);
  
  // 2. عربي
  await test('رد عربي صحيح', async () => {
    const r = await callZAI([{role:'system',content:'أنت مساعد ذكي'},{role:'user',content:'ما عاصمة السعودية؟'}], 50);
    if (!/[\u0600-\u06FF]/.test(r)) throw new Error('لا عربي');
    return r?.substring(0, 40);
  });
  await wait(2000);
  
  // 3. ذاكرة
  await test('ذاكرة المحادثة', async () => {
    const msgs = [{role:'system',content:'تذكر كل شيء'},{role:'user',content:'اسمي فهد'}];
    const r1 = await callZAI(msgs, 40);
    msgs.push({role:'assistant',content:r1},{role:'user',content:'ما اسمي؟'});
    const r2 = await callZAI(msgs, 40);
    if (!r2.includes('فهد')) throw new Error('لم يتذكر الاسم');
    return 'تذكر الاسم ✓';
  });
  await wait(3000);
  
  // 4. 3 رسائل متتالية
  await test('3 رسائل متتالية', async () => {
    const msgs = [{role:'system',content:'أجب بإيجاز'},{role:'user',content:'1+1=?'}];
    const r1 = await callZAI(msgs, 20);
    msgs.push({role:'assistant',content:r1},{role:'user',content:'2+2=?'});
    await wait(2500);
    const r2 = await callZAI(msgs, 20);
    msgs.push({role:'assistant',content:r2},{role:'user',content:'3+3=?'});
    await wait(2500);
    const r3 = await callZAI(msgs, 20);
    if (!r1 || !r2 || !r3) throw new Error('بعض الرسائل فشلت');
    return '3/3 نجحت';
  });
  await wait(3000);
  
  // 5. تبديل لغة
  await test('تبديل لغة عربي→إنجليزي', async () => {
    const r = await callZAI([{role:'system',content:'أنت مساعد ذكي. تحدث بأي لغة يطلبها المستخدم.'},{role:'user',content:'Now reply in English only'}], 40);
    if (!/[a-zA-Z]{3,}/.test(r)) throw new Error('لم يبدل للإنجليزي');
    return r?.substring(0, 40);
  });
  await wait(2000);
  
  // 6. رسالة طويلة
  await test('رسالة طويلة', async () => {
    const r = await callZAI([{role:'user',content:'اكتب فقرة عن أهمية القراءة في تطور المجتمعات العربية'}], 300);
    if (!r || r.length < 30) throw new Error('رد قصير');
    return `${r.length} حرف`;
  });
  await wait(3000);
  
  // 7. أحرف خاصة
  await test('أحرف خاصة وإيموجي', async () => {
    const r = await callZAI([{role:'user',content:'رد بكلمة واحدة مع إيموجي 🌟'}], 30);
    return r?.substring(0, 30);
  });
  await wait(2000);
  
  // 8. Webhook
  await test('Webhook نشط', async () => {
    const res = await fetch('https://api.telegram.org/bot8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk/getWebhookInfo');
    const data = await res.json();
    if (!data.result?.url) throw new Error('لا webhook');
    return `${data.result.url}`;
  });
  
  console.log(`\n📊 النتيجة: ${pass} ✅ | ${fail} ❌ | نسبة النجاح: ${Math.round(pass/(pass+fail)*100)}%`);
}

main();
