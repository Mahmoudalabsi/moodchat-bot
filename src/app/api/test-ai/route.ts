import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. z-ai-web-dev-sdk (Primary - chat.z.ai/api)
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const start = Date.now();
    const response = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hi in one word' }],
      temperature: 0.7,
      max_tokens: 20,
      thinking: { type: 'disabled' },
    });
    const ms = Date.now() - start;
    const reply = response.choices?.[0]?.message?.content;
    results['z-ai-sdk'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 50)}` : `❌ Empty response (${ms}ms)`;
  } catch (e: any) {
    results['z-ai-sdk'] = `❌ ${e?.message || String(e).substring(0, 80)}`;
  }

  // 2. Pollinations.ai (Fallback 1)
  try {
    const start = Date.now();
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: 'Say hi in one word' }],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const ms = Date.now() - start;
    if (r.ok) {
      const data = await r.json();
      const reply = data.choices?.[0]?.message?.content;
      results['pollinations'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 50)}` : `❌ Empty response (${ms}ms)`;
    } else {
      results['pollinations'] = `❌ ${r.status} (${ms}ms)`;
    }
  } catch (e: any) {
    results['pollinations'] = `❌ ${e?.message || String(e).substring(0, 80)}`;
  }

  // 3. Z-AI Internal (Fallback 2 - may not work from Vercel)
  try {
    const start = Date.now();
    const r = await fetch('https://internal-api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10, thinking: { type: 'disabled' } }),
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - start;
    results['z-ai-internal'] = r.ok ? `✅ Works! (${ms}ms)` : `❌ ${r.status} (${ms}ms)`;
  } catch (e: any) {
    results['z-ai-internal'] = `❌ ${e?.message || String(e).substring(0, 80)}`;
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
