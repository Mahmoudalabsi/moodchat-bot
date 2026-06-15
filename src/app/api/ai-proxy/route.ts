/**
 * AI Proxy Endpoint - POST /api/ai-proxy
 * يعمل كجسر بين Vercel و Z-AI SDK
 * عندما يكون البوت على Vercel، يستدعي هذا الـ endpoint الذي بدوره يستخدم Z-AI SDK
 */

import { NextRequest, NextResponse } from 'next/server';

// Z-AI SDK Config
const ZAI_CONFIG = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-c2ae3234-5685-4053-8998-96e9a664f658',
  userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model, max_tokens, temperature } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    // محاولة 1: Z-AI SDK
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      const zai = new ZAIClass(ZAI_CONFIG);
      const completion = await zai.chat.completions.create({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        model: model || 'glm-4-plus',
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 800,
        thinking: { type: 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply?.trim()) {
        return NextResponse.json({
          reply: reply.trim(),
          provider: 'zai-sdk',
          model: model || 'glm-4-plus',
        });
      }
    } catch (sdkErr: any) {
      console.log('[AI-Proxy] SDK failed:', sdkErr?.message?.substring(0, 60));
    }

    // محاولة 2: Z-AI Direct API
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_CONFIG.apiKey}`,
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': ZAI_CONFIG.chatId,
        'X-User-Id': ZAI_CONFIG.userId,
        'X-Token': ZAI_CONFIG.token,
      };
      const response = await fetch(`${ZAI_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST', headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: model || 'glm-4-plus',
          messages,
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 800,
          thinking: { type: 'disabled' },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply?.trim()) {
          return NextResponse.json({
            reply: reply.trim(),
            provider: 'zai-direct',
            model: model || 'glm-4-plus',
          });
        }
      }
    } catch (directErr: any) {
      console.log('[AI-Proxy] Direct failed:', directErr?.message?.substring(0, 60));
    }

    return NextResponse.json({ error: 'All Z-AI providers failed' }, { status: 503 });
  } catch (error) {
    console.error('[AI-Proxy] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Health check
export async function GET() {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAIClass = ZAIModule.default;
    const zai = new ZAIClass(ZAI_CONFIG);
    const start = Date.now();
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'ok' }],
      model: 'glm-4-plus',
      max_tokens: 10,
      thinking: { type: 'disabled' },
    });
    const reply = completion?.choices?.[0]?.message?.content;
    return NextResponse.json({
      status: reply ? 'ok' : 'error',
      provider: 'zai-sdk',
      latency: Date.now() - start,
      reply: reply?.substring(0, 50),
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      error: err?.message?.substring(0, 100),
    }, { status: 503 });
  }
}
