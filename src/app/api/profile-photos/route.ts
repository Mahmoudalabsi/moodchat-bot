import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';

async function getUserProfilePhotoUrl(userId: number): Promise<string | null> {
  try {
    // Step 1: Get profile photos
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();
    const photos = data?.result?.photos;

    if (!photos || photos.length === 0) {
      console.log(`[ProfilePhotos] No profile photo for user ${userId}`);
      return null;
    }

    // Get the biggest photo (last in array)
    const biggest = photos[0][photos[0].length - 1];

    // Step 2: Get file path
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${biggest.file_id}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const fileData = await fileRes.json();

    if (!fileData?.ok || !fileData?.result?.file_path) {
      console.warn(`[ProfilePhotos] Could not get file path for user ${userId}:`, JSON.stringify(fileData).substring(0, 200));
      return null;
    }

    const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    console.log(`[ProfilePhotos] ✅ Got photo URL for user ${userId}`);
    return photoUrl;
  } catch (err: any) {
    console.error(`[ProfilePhotos] ❌ Error getting photo for user ${userId}:`, err?.message?.substring(0, 100));
    return null;
  }
}

// GET: Return list of users with their photoUrl status
export async function GET() {
  try {
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

    let users;
    if (specificUserId) {
      // Refresh specific user
      users = await db.telegramUser.findMany({
        where: { userId: specificUserId },
      });
    } else if (forceRefresh) {
      // Refresh all users (even those with photos)
      users = await db.telegramUser.findMany({
        orderBy: { lastActive: 'desc' },
        take: 50,
      });
    } else {
      // Only users without photoUrl
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

    for (const user of users) {
      const photoUrl = await getUserProfilePhotoUrl(user.userId);

      if (photoUrl) {
        await db.telegramUser.update({
          where: { userId: user.userId },
          data: { photoUrl },
        });
        updated++;
      } else if (!user.photoUrl) {
        // User has no profile photo on Telegram
        noPhoto++;
      } else {
        failed++;
      }

      // Small delay to avoid Telegram API rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[ProfilePhotos] ✅ Refresh complete: updated=${updated}, noPhoto=${noPhoto}, failed=${failed}, total=${users.length}`);

    return NextResponse.json({
      ok: true,
      updated,
      noPhoto,
      failed,
      total: users.length,
    });
  } catch (error: any) {
    console.error('[ProfilePhotos] POST error:', error?.message);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
