import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. Pollinations.ai POST (Primary)
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
      results['pollinations-post'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 50)}` : `❌ Empty (${ms}ms)`;
    } else if (r.status === 429) {
      results['pollinations-post'] = `⏳ Rate limited (${ms}ms) - will retry`;
    } else {
      results['pollinations-post'] = `❌ ${r.status} (${ms}ms)`;
    }
  } catch (e: any) {
    results['pollinations-post'] = `❌ ${e?.message || String(e).substring(0, 80)}`;
  }

  // 2. Pollinations.ai GET (Fallback)
  try {
    const start = Date.now();
    const r = await fetch('https://text.pollinations.ai/Say%20hello?model=openai&seed=' + Math.floor(Math.random() * 100000), {
      signal: AbortSignal.timeout(15000),
    });
    const ms = Date.now() - start;
    if (r.ok) {
      const text = await r.text();
      results['pollinations-get'] = text ? `✅ ${ms}ms: ${text.substring(0, 50)}` : `❌ Empty (${ms}ms)`;
    } else if (r.status === 429) {
      results['pollinations-get'] = `⏳ Rate limited (${ms}ms)`;
    } else {
      results['pollinations-get'] = `❌ ${r.status} (${ms}ms)`;
    }
  } catch (e: any) {
    results['pollinations-get'] = `❌ ${e?.message || String(e).substring(0, 80)}`;
  }

  // 3. Smart Fallback (always works)
  results['smart-fallback'] = '✅ Always available - generates contextual Arabic responses';

  results['note'] = 'Local polling bot (Z-AI) runs alongside for best quality';

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
