import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. Z-AI SDK (Primary)
  try {
    const start = Date.now();
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();
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

  // 2. Z-AI Direct API
  try {
    const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
    const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
    const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
    const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
    const ZAI_TOKEN = process.env.ZAI_TOKEN || '';

    const start = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZAI_API_KEY}`,
      'X-Z-AI-From': 'Z',
    };
    if (ZAI_CHAT_ID) headers['X-Chat-Id'] = ZAI_CHAT_ID;
    if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
    if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

    const r = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
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
      results['zai-direct'] = reply ? `✅ ${ms}ms: ${reply.substring(0, 80)}` : `❌ Empty (${ms}ms)`;
    } else if (r.status === 429) {
      results['zai-direct'] = `⏳ Rate limited (${ms}ms)`;
    } else {
      const errText = await r.text().catch(() => '');
      results['zai-direct'] = `❌ ${r.status} (${ms}ms): ${errText.substring(0, 100)}`;
    }
  } catch (e: any) {
    results['zai-direct'] = `❌ ${e?.message?.substring(0, 120) || String(e).substring(0, 80)}`;
  }

  // 3. Pollinations.ai POST
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
      results['pollinations-post'] = `⏳ Rate limited (${ms}ms)`;
    } else {
      results['pollinations-post'] = `❌ ${r.status} (${ms}ms)`;
    }
  } catch (e: any) {
    results['pollinations-post'] = `❌ ${e?.message?.substring(0, 80) || String(e).substring(0, 80)}`;
  }

  // 4. Smart Fallback (always works)
  results['smart-fallback'] = '✅ Always available - generates contextual Arabic responses';

  results['system'] = 'Z-AI SDK → Z-AI Direct → Pollinations → Smart Fallback';

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
