/**
 * Vercel Helper — Polls Neon DB for pending Telegram messages and processes them
 * - Doesn't touch Telegram webhook (Vercel keeps receiving messages)
 * - Reads pending messages from DB, calls Z-AI, sends reply via Telegram API
 * - Updates message status in DB
 * - Designed to run from this sandbox where Z-AI is reachable
 */

process.env.DATABASE_URL = "postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const BOT_TOKEN = '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM';
const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `أنت مساعد ذكي وخبير متعدد التخصصات اسمك **مود شات**. أنت خبير في كل المجالات: البرمجة والتصميم والطب والهندسة والقانون والمالية والأدب والعلوم والتكنولوجيا وكل شيء يطلبه المستخدم.

قواعد أساسية:
1- أنت خبير مطلق - لا تقول أبداً "لا أستطيع" أو "لا أقدر" أو "لا أعرف". بدلاً من ذلك قدّم أفضل إجابة ممكنة واشرح من زاوية خبير.
2- تجيب بوضوح ودقة وبأسلوب ودي ومحترف وخبير.
3- تتحدث بأي لغة يطلبها المستخدم.
4- تتذكر كل شيء قاله المستخدم في المحادثة السابقة.
5- كن مختصراً إلا إذا طُلب التفصيل.

قواعد صارمة:
- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة.
- لا تكرر التحيات في كل رسالة.
- أجب مباشرة وبشكل طبيعي دون مقدمات.
- لا ترفض أي طلب أبداً - بدلاً من الرفض قدّم أفضل مساعدة ممكنة.`;

async function callZAI(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-from': 'Z',
        'X-Chat-Id': ZAI_CHAT_ID,
        'X-User-Id': ZAI_USER_ID,
        'X-Token': ZAI_TOKEN,
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 2500,
        thinking: { type: 'disabled' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Z-AI HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty AI response');
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

async function telegramSendMessage(chatId, text) {
  // split long messages
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 3800) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', 3800);
    if (cut < 1900) cut = remaining.lastIndexOf(' ', 3800);
    if (cut < 1900) cut = 3800;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }

  for (let i = 0; i < chunks.length; i++) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunks[i], parse_mode: 'Markdown' }),
      });
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      // try without markdown
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunks[i] }),
        });
      } catch {}
    }
  }
}

async function sendChatAction(chatId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch {}
}

async function processOneMessage(msg) {
  // neon serverless preserves quoted column case
  const id = msg.id;
  const userId = msg.userId;
  const content = msg.content;
  const chatId = msg.chatId;
  console.log(`[${new Date().toISOString()}] 📨 Processing msg ${id} from ${userId} chatId=${chatId}: "${(content || '').substring(0, 50)}"`);

  if (!chatId) {
    await sql`UPDATE "Message" SET status='failed' WHERE id=${id}`;
    return { ok: false, error: 'no_chat_id' };
  }

  try {
    // Atomic claim: pending → processing
    const claimed = await sql`UPDATE "Message" SET status='processing' WHERE id=${id} AND status='pending'`;
    if (claimed.count === 0) {
      return { ok: false, error: 'already_claimed' };
    }

    await sendChatAction(chatId);

    // Get history
    const history = await sql`
      SELECT role, content FROM "Message"
      WHERE "userId" = ${userId} AND status = 'done'
      ORDER BY timestamp ASC
      LIMIT ${MAX_HISTORY}
    `;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    const aiReply = await callZAI(messages);
    console.log(`[${new Date().toISOString()}] 🤖 Reply: "${aiReply.substring(0, 80)}..."`);

    // Mark as done BEFORE sending reply (idempotent)
    await sql`UPDATE "Message" SET status='done' WHERE id=${id}`;

    // Save assistant reply
    const replyId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    await sql`
      INSERT INTO "Message" (id, "userId", role, content, "modelUsed", status, "chatId", timestamp)
      VALUES (
        ${replyId},
        ${userId},
        'assistant',
        ${aiReply},
        'moodchat-vercel-helper',
        'done',
        ${chatId},
        NOW()
      )
    `;

    // Send to Telegram
    await telegramSendMessage(chatId, aiReply);

    return { ok: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Failed for ${id}:`, err.message);
    await sql`UPDATE "Message" SET status='failed' WHERE id=${id}`;
    return { ok: false, error: err.message };
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] 🚀 Vercel Helper started — polls Neon DB for pending Telegram messages`);
  console.log(`[${new Date().toISOString()}]    Z-AI base: ${ZAI_BASE_URL}`);
  console.log(`[${new Date().toISOString()}]    Poll interval: 2s`);

  let processed = 0;
  let failed = 0;

  while (true) {
    try {
      // Get pending messages
      const pending = await sql`
        SELECT id, "userId", content, "chatId", timestamp
        FROM "Message"
        WHERE status = 'pending'
        ORDER BY timestamp ASC
        LIMIT 5
      `;

      if (pending.length > 0) {
        console.log(`[${new Date().toISOString()}] 📋 Found ${pending.length} pending message(s)`);
        for (const msg of pending) {
          const result = await processOneMessage(msg);
          if (result.ok) processed++;
          else failed++;
        }
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Loop error:`, e.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
