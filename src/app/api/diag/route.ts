import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: 'VLM-v2-image-support',
    features: ['image-understanding', 'expert-prompt', 'vlm-zsdk', 'vlm-gemini-fallback'],
    buildTime: new Date().toISOString(),
  });
}
