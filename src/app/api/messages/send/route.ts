/**
 * Send Message API - POST /api/messages/send
 *
 * Allows the admin dashboard to send a message directly to a Telegram user
 * from the chat panel. The message:
 *   1. Is sent via Telegram Bot API (sendMessage)
 *   2. Is stored in the database as role='assistant', modelUsed='admin-direct'
 *
 * Request body:
 *   { userId: number, text: string }
 *
 * Response:
 *   { ok: true, messageId: string, telegramMessageId: number }
 *   { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, text } = body;

    if (!userId || typeof userId !== 'number') {
      return NextResponse.json({ ok: false, error: 'Invalid userId' }, { status: 400 });
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Invalid text' }, { status: 400 });
    }
    if (text.length > 4096) {
      return NextResponse.json({ ok: false, error: 'Text too long (max 4096 chars)' }, { status: 400 });
    }

    const cleanText = text.trim();

    // 1. Send via Telegram Bot API (try Markdown first, fall back to plain text)
    let telegramMessageId: number | null = null;
    let lastError: string | null = null;

    for (const useMarkdown of [true, false]) {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: userId,
            text: cleanText,
            ...(useMarkdown ? { parse_mode: 'Markdown' } : {}),
          }),
        }
      );
      const tgData = await tgRes.json();
      if (tgData.ok) {
        telegramMessageId = tgData.result?.message_id ?? null;
        break;
      }
      lastError = tgData.description || 'unknown telegram error';
      // If error is not markdown-related, don't retry without markdown
      if (!useMarkdown) break;
      const isMarkdownError = /parse|markdown|entity|tag/i.test(lastError || '');
      if (!isMarkdownError) break;
    }

    if (telegramMessageId === null) {
      return NextResponse.json({
        ok: false,
        error: `Telegram error: ${lastError}`,
      }, { status: 502 });
    }

    // 2. Save to database
    const saved = await db.message.create({
      data: {
        userId,
        role: 'assistant',
        content: cleanText,
        modelUsed: 'admin-direct',
        status: 'done',
      },
    });

    return NextResponse.json({
      ok: true,
      messageId: saved.id,
      telegramMessageId,
    });
  } catch (error) {
    console.error('[/api/messages/send] Error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
