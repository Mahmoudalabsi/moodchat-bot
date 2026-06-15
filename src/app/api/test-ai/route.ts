import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. Pollinations
  try {
    const r = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Say hi' }], model: 'openai', seed: Math.floor(Math.random() * 10000) }),
      signal: AbortSignal.timeout(15000),
    });
    results.pollinations = r.ok ? `✅ ${r.status}` : `❌ ${r.status}: ${(await r.text()).substring(0, 80)}`;
  } catch (e) { results.pollinations = `❌ ${String(e).substring(0, 80)}`; }

  // 2. Z-AI (internal only)
  try {
    const r = await fetch('https://internal-api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer Z.ai', 'X-Z-AI-From': 'Z' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10, thinking: { type: 'disabled' } }),
      signal: AbortSignal.timeout(10000),
    });
    results.zai = r.ok ? `✅ Works!` : `❌ ${r.status}`;
  } catch (e) { results.zai = `❌ ${String(e).substring(0, 80)}`; }

  // 3. Try Cloudflare Workers AI (free)
  try {
    const r = await fetch('https://playground.ai.cloudflare.com/api/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: '@cf/meta/llama-3.1-8b-instruct' }),
      signal: AbortSignal.timeout(15000),
    });
    results.cloudflare = r.ok ? `✅ ${r.status}` : `❌ ${r.status}: ${(await r.text()).substring(0, 80)}`;
  } catch (e) { results.cloudflare = `❌ ${String(e).substring(0, 80)}`; }

  // 4. Try free G4F API
  try {
    const r = await fetch('https://api.airforce/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Say hi' }], model: 'gpt-4o-mini' }),
      signal: AbortSignal.timeout(15000),
    });
    results.airforce = r.ok ? `✅ ${(await r.json()).choices?.[0]?.message?.content?.substring(0, 50) || 'empty'}` : `❌ ${r.status}`;
  } catch (e) { results.airforce = `❌ ${String(e).substring(0, 80)}`; }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
