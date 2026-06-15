/**
 * Process Pending Messages API Route
 * يعالج الرسائل المعلقة باستخدام Z-AI SDK
 * يعمل على خادم Z.ai المحلي حيث Z-AI API متاح
 *
 * GET /api/process-pending → يعالج حتى 5 رسائل معلقة
 * ⚠️ يتحقق من حالة تفعيل المستخدم قبل المعالجة
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8';
const ADMIN_IDS: number[] = (process.env.ADMIN_IDS || '1429407129').split(',').map(Number);
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = process.env.ZAI_API_KEY || 'Z.ai';
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || '';
const ZAI_USER_ID = process.env.ZAI_USER_ID || '';
const ZAI_TOKEN = process.env.ZAI_TOKEN || '';
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = "أنت مساعد ذكي اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي ومحترم. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. قواعد صارمة: 1- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال. 2- لا تكرر التحيات في كل رسالة. 3- أجب مباشرة وبشكل طبيعي دون مقدمات.";

async function callZAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'X-Z-AI-From': 'Z',
  };
  if (ZAI_CHAT_ID) headers['X-Chat-Id'] = ZAI_CHAT_ID;
  if (ZAI_USER_ID) headers['X-User-Id'] = ZAI_USER_ID;
  if (ZAI_TOKEN) headers['X-Token'] = ZAI_TOKEN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 800, thinking: { type: 'disabled' } }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Z-AI ${res.status}: ${errText.substring(0, 100)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply?.trim()) return reply.trim();
    throw new Error('Empty response');
  } finally {
    clearTimeout(timeout);
  }
}

async function callPollinations(messages: Array<{ role: string; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ messages, model: 'openai', temperature: 0.7, seed: Math.floor(Math.random() * 10000) }),
    });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'عذراً، لا أستطيع الرد الآن';
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

function sanitizeMarkdown(text: string): string {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  c = c.replace(/~~/g, '');
  c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return c;
}

export async function GET() {
  try {
    const pending = await db.message.findMany({
      where: { status: 'pending', role: 'user' },
      orderBy: { timestamp: 'asc' },
      take: 5,
    });

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No pending messages' });
    }

    const results: Array<{ id: string; success: boolean; reply?: string; error?: string; skipped?: boolean }> = [];

    for (const msg of pending) {
      try {
        const chatId = msg.chatId || msg.userId;

        // ==========================================
        // ⚠️ فحص حالة التفعيل - لا تعالج مستخدم غير مفعل
        // ==========================================
        const user = await db.telegramUser.findUnique({ where: { userId: msg.userId } });

        if (!user) {
          // مستخدم غير موجود - احذف الرسالة
          await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
          results.push({ id: msg.id, success: false, skipped: true, error: 'User not found' });
          continue;
        }

        if (user.isBlocked) {
          // مستخدم محظور - احذف الرسالة
          await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
          await sendTelegram(chatId, "🚫 تم حظرك من استخدام هذا البوت.");
          results.push({ id: msg.id, success: false, skipped: true, error: 'User blocked' });
          continue;
        }

        if (!user.isApproved && !ADMIN_IDS.includes(msg.userId)) {
          // مستخدم غير مفعل - لا تعالج رسالته، اطلب كلمة مرور
          await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });
          await sendTelegram(chatId, "🔒 **هذا البوت خاص ومحمي بكلمة مرور!**\n\nأرسل كلمة المرور لتفعيل حسابك:");
          results.push({ id: msg.id, success: false, skipped: true, error: 'User not approved' });
          continue;
        }

        // ==========================================
        // المستخدم مفعل - عالج الرسالة
        // ==========================================

        // Send typing action
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        });

        // Get conversation history
        const history = await db.message.findMany({
          where: { userId: msg.userId, status: 'done' },
          orderBy: { timestamp: 'asc' },
          take: MAX_HISTORY,
        });

        const messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: msg.content },
        ];

        // Try Z-AI first, then Pollinations
        let reply: string;
        let provider = 'zai';
        try {
          reply = await callZAI(messages);
        } catch (e) {
          console.error('Z-AI failed:', e);
          try {
            reply = await callPollinations(messages);
            provider = 'pollinations';
          } catch {
            reply = "عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً. حاول مرة أخرى لاحقاً 🙏";
            provider = 'fallback';
          }
        }

        // Save AI reply
        await db.message.create({
          data: { userId: msg.userId, role: 'assistant', content: reply, modelUsed: `moodchat-${provider}`, status: 'done' },
        });

        // Mark user message as done
        await db.message.update({ where: { id: msg.id }, data: { status: 'done' } });

        // Send reply via Telegram
        await sendTelegram(chatId, sanitizeMarkdown(reply));

        // Update worker heartbeat
        await db.botConfig.upsert({
          where: { key: 'worker_heartbeat' },
          update: { value: new Date().toISOString() },
          create: { key: 'worker_heartbeat', value: new Date().toISOString() },
        });

        results.push({ id: msg.id, success: true, reply: reply.substring(0, 50) });
      } catch (error) {
        console.error(`Error processing ${msg.id}:`, error);
        await db.message.update({ where: { id: msg.id }, data: { status: 'done' } }).catch(() => {});
        results.push({ id: msg.id, success: false, error: String(error) });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error('Process pending error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
