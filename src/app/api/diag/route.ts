import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: 'VLM-v2-image-support-pollinations-fallback',
    features: ['image-understanding', 'expert-prompt', 'vlm-zsdk', 'vlm-gemini-fallback', 'pollinations-fallback'],
    buildTime: new Date().toISOString(),
    buildHash: 'pollinations-v2-' + Date.now(),
  });
}
