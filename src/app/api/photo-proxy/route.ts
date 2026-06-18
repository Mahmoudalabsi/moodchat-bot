import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = '8401809931:AAF3-GTJlr0R58VbDHENcsMP6yNg0mOol3g';

/**
 * Photo Proxy API - GET /api/photo-proxy?path=<file_path>
 * 
 * Telegram file URLs return Content-Disposition: attachment which prevents
 * browsers from displaying them in <img> tags. This proxy fetches the image
 * from Telegram and returns it with proper image content-type headers.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
    }

    // Security: only allow paths from Telegram file API
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    
    const response = await fetch(telegramUrl, { 
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[PhotoProxy] Telegram returned ${response.status} for ${filePath}`);
      return NextResponse.json({ error: 'Failed to fetch photo' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();

    // Determine content type from file extension
    let contentType = 'image/jpeg';
    if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.gif')) contentType = 'image/gif';
    else if (filePath.endsWith('.webp')) contentType = 'image/webp';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[PhotoProxy] Error:', error?.message);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
