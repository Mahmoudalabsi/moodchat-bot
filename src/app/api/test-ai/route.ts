/**
 * Test AI API - GET /api/test-ai
 * يختبر اتصال مزودات AI المختلفة من Vercel
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. اختبار Pollinations
  try {
    const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hi' }],
        model: 'openai',
        temperature: 0.7,
        seed: Math.floor(Math.random() * 10000),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'empty';
      results.pollinations = `✅ Works: "${reply.substring(0, 50)}"`;
    } else {
      const body = await response.text();
      results.pollinations = `❌ ${response.status}: ${body.substring(0, 100)}`;
    }
  } catch (error) {
    results.pollinations = `❌ Error: ${String(error).substring(0, 100)}`;
  }

  // 2. اختبار Z-AI
  try {
    const response = await fetch('https://internal-api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Z.ai',
        'X-Z-AI-From': 'Z',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hi' }],
        temperature: 0.7,
        max_tokens: 50,
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      results.zai = `✅ Works!`;
    } else {
      results.zai = `❌ ${response.status}`;
    }
  } catch (error) {
    results.zai = `❌ Error: ${String(error).substring(0, 100)}`;
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-cache' } });
}
