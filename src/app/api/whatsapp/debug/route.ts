import { NextRequest, NextResponse } from 'next/server';

/**
 * Diagnostic endpoint: /api/whatsapp/debug
 * يختبر كل المكونات: Z-AI SDK، اتصال Meta، إرسال رسالة
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const test = searchParams.get('test') || 'all';
  const phone = searchParams.get('phone') || '';

  const result: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    tests: {},
  };

  // 1. فحص متغيرات البيئة
  result.tests.env = {
    WA_TOKEN: !!process.env.WA_TOKEN,
    WA_ACCESS_TOKEN: !!process.env.WA_ACCESS_TOKEN,
    WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID,
    WA_BUSINESS_ID: process.env.WA_BUSINESS_ID,
    WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN,
    DATABASE_URL: !!process.env.DATABASE_URL,
  };

  // 2. اختبار Z-AI SDK
  if (test === 'all' || test === 'ai') {
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      const zai = new ZAIClass({
        baseUrl: 'https://internal-api.z.ai/v1',
        apiKey: 'Z.ai',
        userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      });

      const start = Date.now();
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: 'قل: مرحبا' }],
        model: 'glm-4-plus',
        temperature: 0.7,
        max_tokens: 50,
        thinking: { type: 'disabled' },
      });
      const elapsed = Date.now() - start;
      const reply = completion?.choices?.[0]?.message?.content;

      result.tests.ai = {
        ok: !!reply,
        elapsed_ms: elapsed,
        reply: reply?.substring(0, 200),
        raw_completion_keys: completion ? Object.keys(completion) : null,
      };
    } catch (err: any) {
      result.tests.ai = {
        ok: false,
        error: String(err?.message || err || '').substring(0, 500),
        stack: err?.stack?.substring(0, 500),
      };
    }
  }

  // 3. اختبار اتصال Meta
  if (test === 'all' || test === 'meta') {
    try {
      const token = process.env.WA_TOKEN || process.env.WA_ACCESS_TOKEN;
      const phoneId = process.env.WA_PHONE_NUMBER_ID;
      const start = Date.now();
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const elapsed = Date.now() - start;
      result.tests.meta = {
        ok: res.ok,
        status: res.status,
        elapsed_ms: elapsed,
        display_phone_number: data?.display_phone_number,
        verified_name: data?.verified_name,
        error: data?.error?.message,
      };
    } catch (err: any) {
      result.tests.meta = { ok: false, error: String(err?.message || err).substring(0, 300) };
    }
  }

  // 4. اختبار إرسال رسالة (يتطلب phone)
  if (test === 'send' && phone) {
    try {
      const token = process.env.WA_TOKEN || process.env.WA_ACCESS_TOKEN;
      const phoneId = process.env.WA_PHONE_NUMBER_ID;
      const start = Date.now();
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: '🤖 رسالة اختبار من مود شات - واتساب يعمل بنجاح!' },
          }),
        }
      );
      const data = await res.json();
      const elapsed = Date.now() - start;
      result.tests.send = {
        ok: res.ok,
        status: res.status,
        elapsed_ms: elapsed,
        to: phone,
        response: data,
      };
    } catch (err: any) {
      result.tests.send = { ok: false, error: String(err?.message || err).substring(0, 300) };
    }
  }

  return NextResponse.json(result, { status: 200 });
}
