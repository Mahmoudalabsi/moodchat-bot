import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, { ok: boolean; time: number; error?: string; body?: string; status?: number }> = {};
  
  // Test various providers in parallel
  const tests = [
    {
      name: 'zai_internal',
      url: 'https://internal-api.z.ai/v1/chat/completions',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer Z.ai',
          'X-Z-AI-From': 'Z',
          'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
          'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
          'X-Token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'say ok' }], max_tokens: 10, thinking: { type: 'disabled' } }),
      },
    },
    {
      name: 'zai_public',
      url: 'https://z.ai/api/v1/chat/completions',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
          'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
          'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'say ok' }], max_tokens: 10 }),
      },
    },
    {
      name: 'pollinations',
      url: 'https://text.pollinations.ai/openai/chat/completions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ messages: [{ role: 'user', content: 'say ok' }], model: 'openai', temperature: 0.7 }),
      },
    },
  ];

  await Promise.all(tests.map(async (test) => {
    const start = Date.now();
    try {
      const res = await fetch(test.url, test.init as RequestInit);
      const body = await res.text();
      results[test.name] = { ok: res.ok, time: Date.now() - start, status: res.status, body: body.substring(0, 300) };
    } catch (e: unknown) {
      results[test.name] = { ok: false, time: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
    }
  }));

  return NextResponse.json(results);
}
