import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// استخدام التوكن مباشرة - متغير البيئة قد يكون خاطئاً على Vercel
const BOT_TOKEN = '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';

async function getUserProfilePhotoUrl(userId: number, debug?: boolean): Promise<{ url: string | null; debug?: any }> {
  try {
    // Step 1: Get profile photos
    const photosUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${userId}&limit=1`;
    const res = await fetch(photosUrl, { signal: AbortSignal.timeout(15000) });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`[ProfilePhotos] Telegram API returned ${res.status}: ${errText.substring(0, 100)}`);
      return { url: null, debug: debug ? { step: 'getUserProfilePhotos', status: res.status, error: errText.substring(0, 200) } : undefined };
    }
    
    const data = await res.json();
    
    if (!data?.ok) {
      console.error(`[ProfilePhotos] Telegram API error:`, JSON.stringify(data).substring(0, 200));
      return { url: null, debug: debug ? { step: 'getUserProfilePhotos', error: data } : undefined };
    }

    const photos = data?.result?.photos;
    const totalCount = data?.result?.total_count || 0;

    if (!photos || photos.length === 0 || totalCount === 0) {
      console.log(`[ProfilePhotos] No profile photo for user ${userId} (total_count: ${totalCount})`);
      return { url: null, debug: debug ? { step: 'no-photos', totalCount, rawResponse: JSON.stringify(data).substring(0, 300) } : undefined };
    }

    // Get the biggest photo (last in array)
    const photoSizes = photos[0];
    if (!photoSizes || photoSizes.length === 0) {
      return { url: null, debug: debug ? { step: 'empty-photo-sizes' } : undefined };
    }
    
    const biggest = photoSizes[photoSizes.length - 1];
    const fileId = biggest.file_id;

    // Step 2: Get file path
    const fileUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(15000) });
    
    if (!fileRes.ok) {
      const errText = await fileRes.text().catch(() => 'unknown');
      console.error(`[ProfilePhotos] getFile API returned ${fileRes.status}: ${errText.substring(0, 100)}`);
      return { url: null, debug: debug ? { step: 'getFile', status: fileRes.status, error: errText.substring(0, 200) } : undefined };
    }
    
    const fileData = await fileRes.json();

    if (!fileData?.ok || !fileData?.result?.file_path) {
      console.warn(`[ProfilePhotos] Could not get file path for user ${userId}:`, JSON.stringify(fileData).substring(0, 200));
      return { url: null, debug: debug ? { step: 'getFile-no-path', rawResponse: JSON.stringify(fileData).substring(0, 300) } : undefined };
    }

    const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    console.log(`[ProfilePhotos] ✅ Got photo URL for user ${userId}: ${photoUrl.substring(0, 60)}...`);
    return { url: photoUrl, debug: debug ? { step: 'success', photoUrl, filePath: fileData.result.file_path } : undefined };
  } catch (err: any) {
    console.error(`[ProfilePhotos] ❌ Error getting photo for user ${userId}:`, err?.message?.substring(0, 100));
    return { url: null, debug: debug ? { step: 'catch', error: err?.message?.substring(0, 200) } : undefined };
  }
}

// GET: Return list of users with their photoUrl status + debug mode
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const debug = searchParams.get('debug') === 'true';
    const testUserId = searchParams.get('testUserId');

    // Debug mode: test fetching a specific user's photo directly
    if (debug && testUserId) {
      const result = await getUserProfilePhotoUrl(parseInt(testUserId), true);
      return NextResponse.json({
        userId: parseInt(testUserId),
        tokenPrefix: BOT_TOKEN.substring(0, 10) + '...',
        result,
      });
    }

    const users = await db.telegramUser.findMany({
      select: {
        userId: true,
        firstName: true,
        username: true,
        photoUrl: true,
        lastActive: true,
        isApproved: true,
      },
      orderBy: { lastActive: 'desc' },
      take: 100,
    });

    const withPhoto = users.filter(u => u.photoUrl).length;
    const withoutPhoto = users.filter(u => !u.photoUrl).length;

    return NextResponse.json({
      users,
      stats: { total: users.length, withPhoto, withoutPhoto },
    });
  } catch (error: any) {
    console.error('[ProfilePhotos] GET error:', error?.message);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST: Refresh profile photos for users
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const specificUserId = body?.userId;
    const forceRefresh = body?.force || false;
    const debug = body?.debug || false;

    let users;
    if (specificUserId) {
      users = await db.telegramUser.findMany({
        where: { userId: specificUserId },
      });
    } else if (forceRefresh) {
      users = await db.telegramUser.findMany({
        orderBy: { lastActive: 'desc' },
        take: 50,
      });
    } else {
      users = await db.telegramUser.findMany({
        where: { photoUrl: null },
        orderBy: { lastActive: 'desc' },
        take: 50,
      });
    }

    if (users.length === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
        total: 0,
        message: 'No users to update',
      });
    }

    let updated = 0;
    let noPhoto = 0;
    let failed = 0;
    const debugInfo: any[] = [];

    for (const user of users) {
      const { url: photoUrl, debug: stepDebug } = await getUserProfilePhotoUrl(user.userId, debug);

      if (photoUrl) {
        await db.telegramUser.update({
          where: { userId: user.userId },
          data: { photoUrl },
        });
        updated++;
      } else if (!user.photoUrl) {
        noPhoto++;
      } else {
        failed++;
      }

      if (debug && stepDebug) {
        debugInfo.push({ userId: user.userId, ...stepDebug });
      }

      // Small delay to avoid Telegram API rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[ProfilePhotos] ✅ Refresh complete: updated=${updated}, noPhoto=${noPhoto}, failed=${failed}, total=${users.length}`);

    const response: Record<string, unknown> = {
      ok: true,
      updated,
      noPhoto,
      failed,
      total: users.length,
    };

    if (debug) {
      response.debug = debugInfo;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[ProfilePhotos] POST error:', error?.message);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
