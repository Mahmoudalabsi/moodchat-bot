import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, { ok: boolean; time: number; error?: string; body?: string; status?: number }> = {};
  
  const endpoints = [
    {
      name: 'zai_internal',
      url: 'https://internal-api.z.ai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
        'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
        'X-Token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      },
    },
    {
      name: 'zai_public_z.ai',
      url: 'https://z.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
        'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
      },
    },
    {
      name: 'zai_public_chat.z.ai_v1',
      url: 'https://chat.z.ai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
        'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
        'X-Token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      },
    },
    {
      name: 'zai_public_chat.z.ai_api_v1',
      url: 'https://chat.z.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
        'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
        'X-Token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      },
    },
  ];

  const body = JSON.stringify({
    messages: [{ role: 'user', content: 'say ok' }],
    max_tokens: 10, thinking: { type: 'disabled' },
  });

  // Test all endpoints in parallel
  const promises = endpoints.map(async (ep) => {
    const start = Date.now();
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: ep.headers,
        signal: AbortSignal.timeout(8000),
        body,
      });
      const resBody = await res.text();
      results[ep.name] = {
        ok: res.ok,
        time: Date.now() - start,
        status: res.status,
        body: resBody.substring(0, 300),
      };
    } catch (e: unknown) {
      results[ep.name] = {
        ok: false,
        time: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  await Promise.all(promises);
  return NextResponse.json(results);
}
