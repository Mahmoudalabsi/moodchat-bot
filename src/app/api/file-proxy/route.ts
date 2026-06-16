import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';

// Cache for file_id → file_path mappings (avoids repeated getFile calls)
const filePathCache = new Map<string, { path: string; expires: number }>();

/**
 * File Proxy API - GET /api/file-proxy?file_id=<telegram_file_id>&download=<0|1>
 * 
 * Resolves a Telegram file_id to an actual file URL using getFile API,
 * then fetches and serves the file with proper content-type headers.
 * This allows the dashboard to display images and provide download links
 * for files stored in the database as Telegram file_ids.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('file_id');
    const download = searchParams.get('download') === '1';

    if (!fileId) {
      return NextResponse.json({ error: 'file_id parameter required' }, { status: 400 });
    }

    // Step 1: Resolve file_id → file_path via Telegram getFile API
    let filePath: string | null = null;

    // Check cache first
    const cached = filePathCache.get(fileId);
    if (cached && cached.expires > Date.now()) {
      filePath = cached.path;
    }

    if (!filePath) {
      const fileRes = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!fileRes.ok) {
        console.error(`[FileProxy] getFile returned ${fileRes.status} for ${fileId}`);
        return NextResponse.json({ error: 'Failed to resolve file_id' }, { status: 502 });
      }

      const fileData = await fileRes.json();

      if (!fileData.ok || !fileData.result?.file_path) {
        console.error(`[FileProxy] getFile error:`, fileData);
        return NextResponse.json({ error: 'File not found on Telegram' }, { status: 404 });
      }

      filePath = fileData.result.file_path;

      // Cache for 1 hour
      filePathCache.set(fileId, { path: filePath, expires: Date.now() + 3600000 });
    }

    // Security: validate path
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Step 2: Fetch the actual file from Telegram
    const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const response = await fetch(telegramUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[FileProxy] Telegram file returned ${response.status} for ${filePath}`);
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: response.status });
    }

    const fileBuffer = await response.arrayBuffer();

    // Step 3: Determine content type from file extension
    let contentType = 'application/octet-stream';
    let fileName = filePath.split('/').pop() || 'file';

    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.gif')) contentType = 'image/gif';
    else if (filePath.endsWith('.webp')) contentType = 'image/webp';
    else if (filePath.endsWith('.pdf')) contentType = 'application/pdf';
    else if (filePath.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (filePath.endsWith('.doc')) contentType = 'application/msword';
    else if (filePath.endsWith('.xlsx')) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (filePath.endsWith('.xls')) contentType = 'application/vnd.ms-excel';
    else if (filePath.endsWith('.csv')) contentType = 'text/csv';
    else if (filePath.endsWith('.txt')) contentType = 'text/plain';
    else if (filePath.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (filePath.endsWith('.ogg')) contentType = 'audio/ogg';
    else if (filePath.endsWith('.m4a')) contentType = 'audio/mp4';
    else if (filePath.endsWith('.wav')) contentType = 'audio/wav';
    else if (filePath.endsWith('.mp4')) contentType = 'video/mp4';
    else if (filePath.endsWith('.webm')) contentType = 'video/webm';
    else if (filePath.endsWith('.zip')) contentType = 'application/zip';
    else if (filePath.endsWith('.json')) contentType = 'application/json';
    else if (filePath.endsWith('.py')) contentType = 'text/x-python';
    else if (filePath.endsWith('.js')) contentType = 'text/javascript';
    else if (filePath.endsWith('.ts')) contentType = 'text/typescript';
    else if (filePath.endsWith('.html')) contentType = 'text/html';
    else if (filePath.endsWith('.css')) contentType = 'text/css';

    // Build response headers
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    };

    // Add Content-Disposition for downloads
    if (download || !contentType.startsWith('image/')) {
      headers['Content-Disposition'] = `attachment; filename="${fileName}"`;
    }

    return new NextResponse(fileBuffer, { status: 200, headers });
  } catch (error: any) {
    console.error('[FileProxy] Error:', error?.message);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
