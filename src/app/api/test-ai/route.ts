import { NextResponse } from 'next/server';

const ZAI_PUBLIC_URL = 'https://chat.z.ai/api/v1';
const ZAI_INTERNAL_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. Z-AI SDK with direct instance (no config file!)
  try {
    const start = Date.now();
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAI = ZAIModule.default;
    // Use constructor directly - bypasses config file reading
    const zai = new ZAI({
      baseUrl: ZAI_PUBLIC_URL,
      apiKey: ZAI_API_KEY,
      chatId: ZAI_CHAT_ID,
      userId: ZAI_USER_ID,
      token: ZAI_TOKEN,
    });
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'قل مرحبا بكلمة واحدة' }],
      model: 'glm-4-plus',
      temperature: 0.7,
      max_tokens: 50,
    });
    const ms = Date.now() - start;
    const reply = completion?.choices?.[0]?.message?.content;
    results['zai-sdk'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 80)}` : `❌ Empty (${ms}ms)`;
  } catch (e: any) {
    results['zai-sdk'] = `❌ ${e?.message?.substring(0, 120) || String(e).substring(0, 80)}`;
  }

  // 2. Z-AI Direct API (public endpoint)
  for (const [name, baseUrl] of [['zai-direct-public', ZAI_PUBLIC_URL], ['zai-direct-internal', ZAI_INTERNAL_URL]] as const) {
    try {
      const start = Date.now();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-From': 'Z',
      };
      if (ZAI_CHAT_ID) headers['X-Chat-Id'] = ZAI_CHAT_ID;
      if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
      if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: 'glm-4-plus',
          messages: [{ role: 'user', content: 'قل مرحبا بكلمة واحدة' }],
          temperature: 0.7,
          max_tokens: 50,
          thinking: { type: 'disabled' },
        }),
      });
      const ms = Date.now() - start;
      if (r.ok) {
        const data = await r.json();
        const reply = data?.choices?.[0]?.message?.content;
        results[name] = reply ? `✅ ${ms}ms: ${reply.substring(0, 80)}` : `❌ Empty (${ms}ms)`;
      } else if (r.status === 429) {
        results[name] = `⏳ Rate limited (${ms}ms)`;
      } else {
        const errText = await r.text().catch(() => '');
        results[name] = `❌ ${r.status} (${ms}ms): ${errText.substring(0, 80)}`;
      }
    } catch (e: any) {
      results[name] = `❌ ${e?.message?.substring(0, 120) || String(e).substring(0, 80)}`;
    }
  }

  // 3. Pollinations.ai
  try {
    const start = Date.now();
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: 'Say hi in one word' }],
        temperature: 0.7,
        seed: Math.floor(Math.random() * 100000),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const ms = Date.now() - start;
    if (r.ok) {
      const data = await r.json();
      const reply = data.choices?.[0]?.message?.content;
      results['pollinations'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 50)}` : `❌ Empty (${ms}ms)`;
    } else if (r.status === 429) {
      results['pollinations'] = `⏳ Rate limited (${ms}ms)`;
    } else {
      results['pollinations'] = `❌ ${r.status} (${ms}ms)`;
    }
  } catch (e: any) {
    results['pollinations'] = `❌ ${e?.message?.substring(0, 80) || String(e).substring(0, 80)}`;
  }

  results['smart-fallback'] = '✅ Always available';
  results['system'] = 'Z-AI SDK (direct) → Z-AI Direct → Pollinations → Smart Fallback';

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
