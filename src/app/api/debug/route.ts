import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, any> = {};

  // فحص التوكن المستخدم
  const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const NEW_TOKEN = '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
  const OLD_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
  const activeToken = (envToken === OLD_TOKEN || !envToken) ? NEW_TOKEN : envToken;
  results.token_check = {
    env_var_set: !!envToken,
    env_var_prefix: envToken ? envToken.substring(0, 10) + '...' : 'not set',
    active_token_prefix: activeToken.substring(0, 10) + '...',
    using_new_token: activeToken === NEW_TOKEN,
  };

  // Test 1: Z-AI SDK (z-ai-web-dev-sdk)
  try {
    const start = Date.now();
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();
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
    results.zai_sdk = { ok: false, time: 0, error: e?.message?.substring(0, 100) };
  }

  // Test 2: Z-AI Public API (chat.z.ai)
  try {
    const start = Date.now();
    const res = await fetch('https://chat.z.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: 'glm-4-plus',
        messages: [{ role: 'user', content: 'say ok' }],
        max_tokens: 10,
      }),
    });
    const body = await res.text();
    results.zai_public = { ok: res.ok, time: Date.now() - start, status: res.status, body: body.substring(0, 200) };
  } catch (e: any) {
    results.zai_public = { ok: false, error: e?.message?.substring(0, 100) };
  }

  // Test 3: Pollinations
  try {
    const start = Date.now();
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: 'say ok' }],
        max_tokens: 10,
      }),
    });
    const body = await res.text();
    results.pollinations = { ok: res.ok, time: Date.now() - start, status: res.status, body: body.substring(0, 200) };
  } catch (e: any) {
    results.pollinations = { ok: false, error: e?.message?.substring(0, 100) };
  }

  return NextResponse.json(results);
}
