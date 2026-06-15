import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, { ok: boolean; time: number; error?: string; body?: string }> = {};
  
  // Test 1: Z-AI internal API
  const t1 = Date.now();
  try {
    const res = await fetch('https://internal-api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
        'X-User-Id': '014c4da7-4f7f-4efa-9157-9091a73a3570',
        'X-Token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'say ok' }],
        temperature: 0.7, max_tokens: 10, thinking: { type: 'disabled' },
      }),
    });
    const body = await res.text();
    results['zai_internal'] = { ok: res.ok, time: Date.now() - t1, body: body.substring(0, 200) };
  } catch (e: unknown) {
    results['zai_internal'] = { ok: false, time: Date.now() - t1, error: e instanceof Error ? e.message : String(e) };
  }

  // Test 2: Pollinations
  const t2 = Date.now();
  try {
    const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'say ok' }],
        model: 'openai', temperature: 0.7,
      }),
    });
    const body = await res.text();
    results['pollinations'] = { ok: res.ok, time: Date.now() - t2, body: body.substring(0, 200) };
  } catch (e: unknown) {
    results['pollinations'] = { ok: false, time: Date.now() - t2, error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(results);
}
