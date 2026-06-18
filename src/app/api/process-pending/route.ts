/**
 * Vercel Cron Worker - Processes pending messages
 *
 * Called by Vercel Cron every minute. Uses atomic claim pattern
 * (status: pending → processing) to prevent duplicate processing.
 *
 * Provider chain: Z-AI SDK → Pollinations → smart fallback
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
// NOTE: ZAI_CHAT_ID intentionally NOT used — bot operates independently
// from any specific z.ai web chat session.
const ZAI_USER_ID = process.env.ZAI_USER_ID || '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `أنت مساعد ذكي اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل ما قاله المستخدم. كن مختصراً إلا إذا طُلب التفصيل. لا تبدأ ردك بالسلام، أجب مباشرة.`;

// === AI Provider Chain ===

async function callZAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  // Decoupled from any specific Z.ai web chat — no X-Chat-Id header
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Z-AI-From': 'Z',
  };
  if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
  if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 1024, thinking: { type: 'disabled' } }),
    });
    if (!res.ok) throw new Error(`Z-AI ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Z-AI response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages: Array<{ role: string; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        model: 'openai',
        temperature: 0.7,
        seed: Math.floor(Math.random() * 10000),
      }),
    });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty Pollinations response');
  } finally {
    clearTimeout(timeout);
  }
}

async function getAIResponse(
  messages: Array<{ role: string; content: string }>,
  pollinationsEnabled: boolean
): Promise<{ reply: string; provider: string }> {
  // Try Z-AI first (always on — fast, ~0.4s)
  try {
    const reply = await callZAI(messages);
    return { reply, provider: 'zai-sdk' };
  } catch (e) {
    console.error('[Vercel Worker] Z-AI failed:', (e as Error).message);
  }
  // Fall back to Pollinations ONLY if enabled in DB settings
  if (pollinationsEnabled) {
    try {
      const reply = await callPollinations(messages);
      return { reply, provider: 'pollinations' };
    } catch (e) {
      console.error('[Vercel Worker] Pollinations failed:', (e as Error).message);
    }
  }
  // Final fallback
  return {
    reply: 'عذراً، واجهت خطأ في الاتصال بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل 🙏',
    provider: 'fallback',
  };
}

// === Telegram ===

async function sendTelegram(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.substring(0, 4000),
      parse_mode: 'Markdown',
    }),
  });
}

async function sendTyping(chatId: number): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch {}
}

// === Auth ===

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET || 'moodchat-cron-secret-2026';
  if (authHeader === `Bearer ${expectedToken}`) return true;
  // Allow Vercel Cron (sends x-vercel-cron-auth header in some setups)
  const url = new URL(request.url);
  if (url.searchParams.get('secret') === expectedToken) return true;
  return false;
}

// === Main Handler ===

async function processPending(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  // Atomic claim: pending → processing for up to 3 messages at a time
  const claimed = await db.message.updateMany({
    where: { status: 'pending', role: 'user' },
    data: { status: 'processing' },
  });

  if (claimed.count === 0) {
    return { processed: 0, failed: 0 };
  }

  // Check if Pollinations fallback is enabled in DB settings
  let pollinationsEnabled = false;
  try {
    const cfg = await db.botConfig.findUnique({ where: { key: 'pollinations_fallback_enabled' } });
    pollinationsEnabled = cfg?.value === 'true';
  } catch (e) {
    console.error('[Vercel Worker] Failed to read pollinations_fallback_enabled:', (e as Error).message);
  }

  // Fetch the claimed messages
  const messages = await db.message.findMany({
    where: { status: 'processing', role: 'user' },
    orderBy: { timestamp: 'asc' },
    take: 3,
  });

  console.log(`[Vercel Worker] Claimed ${messages.length} messages (Pollinations fallback: ${pollinationsEnabled ? 'ON' : 'OFF'})`);

  for (const msg of messages) {
    try {
      const chatId = msg.chatId || msg.userId;
      await sendTyping(chatId);

      // Get history
      const history = await db.message.findMany({
        where: { userId: msg.userId, status: 'done' },
        orderBy: { timestamp: 'asc' },
        take: MAX_HISTORY,
      });

      const aiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: msg.content },
      ];

      const { reply, provider } = await getAIResponse(aiMessages, pollinationsEnabled);

      // Save assistant reply
      await db.message.create({
        data: {
          userId: msg.userId,
          role: 'assistant',
          content: reply,
          modelUsed: `vercel-${provider}`,
          status: 'done',
        },
      });

      // Mark user message as done
      await db.message.update({
        where: { id: msg.id },
        data: { status: 'done' },
      });

      // Send reply
      await sendTelegram(chatId, reply);
      processed++;
      console.log(`[Vercel Worker] ✅ Replied to ${msg.userId} via ${provider}`);
    } catch (error) {
      console.error(`[Vercel Worker] ❌ Error for msg ${msg.id}:`, (error as Error).message);
      // Revert to pending so it can be retried on next cron tick
      await db.message.update({
        where: { id: msg.id },
        data: { status: 'pending' },
      }).catch(() => {});
      failed++;
    }
  }

  return { processed, failed };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Safety: also re-claim any stuck 'processing' messages (older than 60s)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    await db.message.updateMany({
      where: { status: 'processing', role: 'user', timestamp: { lt: sixtySecondsAgo } },
      data: { status: 'pending' },
    });

    const result = await processPending();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Vercel Worker] Fatal:', error);
    return NextResponse.json({
      ok: false,
      error: (error as Error).message,
    }, { status: 500 });
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

export async function POST(request: Request) {
  return GET(request);
}
