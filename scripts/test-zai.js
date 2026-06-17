/**
 * Quick Z-AI connectivity test - verifies the X-Z-AI-From header fix
 */
const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const messages = [
  { role: 'system', content: 'أنت مساعد ذكي اسمك مود شات. كن مختصراً.' },
  { role: 'user', content: 'مرحبا، اخبرني كم ساعة الآن' },
];

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ZAI_API_KEY}`,
  'X-Chat-Id': ZAI_CHAT_ID,
  'X-User-Id': ZAI_USER_ID,
  'X-Token': ZAI_TOKEN,
  'X-Z-AI-From': 'Z',  // FIXED: uppercase 'F'
};

(async () => {
  const t0 = Date.now();
  try {
    console.log('Calling Z-AI with header X-Z-AI-From (uppercase F)...');
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 256,
        thinking: { type: 'disabled' },
      }),
    });
    const elapsed = Date.now() - t0;
    console.log(`Status: ${res.status} (${elapsed}ms)`);
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text);
      const reply = data.choices?.[0]?.message?.content;
      console.log('Reply:', reply);
      console.log(`\n✅ Z-AI works! Latency: ${elapsed}ms`);
    } else {
      console.log('Error body:', text.substring(0, 500));
      console.log(`\n❌ Still failing: ${res.status}`);
    }
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`❌ Network error after ${elapsed}ms:`, e.message);
  }
})();
