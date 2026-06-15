import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, any> = {};

  // فحص التوكن
  const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const NEW_TOKEN = '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
  const OLD_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
  const activeToken = (envToken === OLD_TOKEN || !envToken) ? NEW_TOKEN : envToken;
  results.token = {
    env_prefix: envToken ? envToken.substring(0, 10) + '...' : 'not set',
    using_new: activeToken === NEW_TOKEN,
  };

  // Test 1: Z-AI SDK (new ZAI(config))
  try {
    const start = Date.now();
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAIClass = ZAIModule.default;
    const zai = new ZAIClass({
      baseUrl: 'https://internal-api.z.ai/v1',
      apiKey: 'Z.ai',
      chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
      userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
    });
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'say ok' }],
      model: 'glm-4-plus',
      max_tokens: 10,
    });
    results.zai_sdk = {
      ok: true,
      time: Date.now() - start,
      reply: completion?.choices?.[0]?.message?.content?.substring(0, 50),
    };
  } catch (e: any) {
    results.zai_sdk = { ok: false, error: e?.message?.substring(0, 120) };
  }

  // Test 2: Pollinations (mistral)
  try {
    const start = Date.now();
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: 'mistral',
        messages: [{ role: 'user', content: 'say ok' }],
        max_tokens: 10,
      }),
    });
    const body = await res.text();
    results.pollinations = { ok: res.ok, time: Date.now() - start, status: res.status, body: body.substring(0, 150) };
  } catch (e: any) {
    results.pollinations = { ok: false, error: e?.message?.substring(0, 100) };
  }

  return NextResponse.json(results);
}
