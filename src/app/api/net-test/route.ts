import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, any> = {};

  const tests = [
    { name: 'internal-api.z.ai', url: 'https://internal-api.z.ai/v1/chat/completions' },
    { name: 'api.z.ai', url: 'https://api.z.ai/v1/chat/completions' },
    { name: 'open.bigmodel.cn', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    { name: 'google', url: 'https://www.google.com' },
    { name: 'cloudflare-dns', url: 'https://1.1.1.1' },
  ];

  for (const t of tests) {
    const start = Date.now();
    try {
      const res = await fetch(t.url, { method: 'POST', signal: AbortSignal.timeout(8000) });
      results[t.name] = { status: res.status, time: Date.now() - start };
    } catch (e: any) {
      results[t.name] = { error: e?.message?.substring(0, 100), time: Date.now() - start };
    }
  }

  return NextResponse.json(results);
}
