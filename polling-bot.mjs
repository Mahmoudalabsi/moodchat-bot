#!/usr/bin/env node
/**
 * MoodChat Local Polling Bot
 * يعمل في بيئة Z.ai ويستخدم internal-api.z.ai
 * هذا هو المزود الأساسي للردود الذكية
 * 
 * التشغيل: node polling-bot.mjs
 */

const BOT_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
const ADMIN_IDS = [1429407129];
const JOIN_PASSWORD = 'MOOD2026';
const MAX_HISTORY = 20;
const POLL_TIMEOUT = 30; // seconds

const ZAI_INTERNAL_URL = 'https://internal-api.z.ai/v1';
const ZAI_API_KEY = 'Z.ai';
const ZAI_CHAT_ID = 'chat-c2ae3234-5685-4053-8998-96e9a664f658';
const ZAI_USER_ID = '014c4da7-4f7f-4efa-9157-9091a73a3570';
const ZAI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0';

const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد اسمك مود شات. تجيب بوضوح ودقة وبأسلوب ودي ومحترم. يمكنك التحدث بأي لغة يطلبها المستخدم. تذكر كل شيء قاله المستخدم في المحادثة السابقة واستخدمه في إجاباتك. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل. قواعد صارمة: 1- لا تبدأ أبداً ردك بكلمة السلام أو وعليكم السلام، أجب مباشرة على السؤال. 2- لا تكرر التحيات في كل رسالة. 3- أجب مباشرة وبشكل طبيعي دون مقدمات.";

const DATABASE_URL = 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

let lastUpdateId = 0;
let zaiSdkInstance = null;

// ============================
// Telegram API
// ============================

async function telegramAPI(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

async function sendChatAction(chatId) {
  return telegramAPI('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ============================
// Z-AI Internal API
// ============================

async function getAIResponse(messages) {
  // Try SDK first
  try {
    if (!zaiSdkInstance) {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      zaiSdkInstance = new ZAI({
        baseUrl: ZAI_INTERNAL_URL,
        apiKey: ZAI_API_KEY,
        chatId: ZAI_CHAT_ID,
        userId: ZAI_USER_ID,
        token: ZAI_TOKEN,
      });
    }

    const completion = await zaiSdkInstance.chat.completions.create({
      messages,
      model: 'glm-4-plus',
      temperature: 0.7,
      max_tokens: 800,
    });

    const reply = completion?.choices?.[0]?.message?.content;
    if (reply?.trim()) {
      console.log('[Z-AI SDK] Success');
      return { reply: reply.trim(), provider: 'zai-sdk' };
    }
  } catch (err) {
    console.log('[Z-AI SDK] Failed:', err.message?.substring(0, 80));
    zaiSdkInstance = null;
  }

  // Try direct API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${ZAI_INTERNAL_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': ZAI_CHAT_ID,
        'X-User-Id': ZAI_USER_ID,
        'X-Token': ZAI_TOKEN,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'glm-4-plus',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        thinking: { type: 'disabled' },
      }),
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      console.log('[Z-AI Direct] Rate limited, waiting...');
      await new Promise(r => setTimeout(r, 5000));
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errText.substring(0, 100)}`);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (reply?.trim()) {
      console.log('[Z-AI Direct] Success');
      return { reply: reply.trim(), provider: 'zai-direct' };
    }
  } catch (err) {
    console.log('[Z-AI Direct] Failed:', err.message?.substring(0, 80));
  }

  // Pollinations fallback
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages,
          temperature: 0.7,
          seed: Math.floor(Math.random() * 100000),
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (response.status === 429) continue;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply?.trim()) return { reply: reply.trim(), provider: 'pollinations' };
    } catch (err) {
      console.log(`[Pollinations] Attempt ${attempt + 1} failed:`, err.message?.substring(0, 60));
    }
  }

  return { reply: "عذراً، أواجه ضغطاً على الخوادم حالياً. حاول مرة أخرى بعد قليل.\n\n/clear - مسح الذاكرة\n/help - المساعدة", provider: 'fallback' };
}

// ============================
// Database helpers (using fetch to Vercel API)
// ============================

async function dbQuery(table, action, params = {}) {
  // Use the Vercel API endpoints for database operations
  const baseUrl = 'https://my-project-green-ten.vercel.app/api';
  try {
    const res = await fetch(`${baseUrl}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    });
    return await res.json();
  } catch (err) {
    console.log(`[DB] Error querying ${table}:`, err.message);
    return null;
  }
}

// ============================
// Simple in-memory state (for polling bot)
// ============================

const userState = new Map(); // userId -> { isApproved, isBlocked, waitingForPassword }

async function getUserState(userId) {
  if (userState.has(userId)) return userState.get(userId);
  // Default: unknown user
  const state = { isApproved: ADMIN_IDS.includes(userId), isBlocked: false, waitingForPassword: false };
  userState.set(userId, state);
  return state;
}

function setUserState(userId, updates) {
  const current = userState.get(userId) || {};
  userState.set(userId, { ...current, ...updates });
}

// Simple message history (in-memory)
const messageHistory = new Map();

function addMessage(userId, role, content) {
  if (!messageHistory.has(userId)) messageHistory.set(userId, []);
  const history = messageHistory.get(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) {
    messageHistory.set(userId, history.slice(-MAX_HISTORY));
  }
}

function getMessageHistory(userId) {
  return messageHistory.get(userId) || [];
}

// ============================
// Message Handler
// ============================

function sanitizeMarkdown(text) {
  let c = text.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  if (((c.match(/\*\*/g) || []).length) % 2 !== 0) c = c.replace(/\*\*([^*]*)$/, '*$1*');
  if (((c.match(/`/g) || []).length) % 2 !== 0) c += '`';
  c = c.replace(/~~/g, '');
  c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return c;
}

async function handleMessage(message) {
  if (!message?.from || !message?.text) return;

  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const isAdmin = ADMIN_IDS.includes(userId);
  const state = await getUserState(userId);

  console.log(`[Message] ${message.from.first_name || 'User'} (${userId}): ${text.substring(0, 50)}`);

  // Password system
  if (state.waitingForPassword && !isAdmin) {
    if (text === JOIN_PASSWORD) {
      setUserState(userId, { isApproved: true, waitingForPassword: false });
      await sendMessage(chatId, "السلام عليكم ورحمة الله وبركاته\n\nأهلاً وسهلاً بك في بوت **مود شات**!\n\n- ذاكرة ذكية - أتذكر كل محادثاتنا\n- متعدد اللغات - أتحدث أي لغة\n- يعمل بـ Z-AI (GLM-4 Plus)\n\nابدأ محادثتك الآن!");
    } else {
      await sendMessage(chatId, "كلمة المرور خاطئة!\n\nحاول مرة أخرى.");
    }
    return;
  }

  // /start
  if (text === '/start') {
    if (isAdmin || state.isApproved) {
      await sendMessage(chatId, "السلام عليكم ورحمة الله وبركاته\n\nأهلاً بك في بوت **مود شات**!\n\n- ذاكرة ذكية - أتذكر كل محادثاتنا\n- متعدد اللغات - أتحدث أي لغة\n- يعمل بـ Z-AI (GLM-4 Plus)\n\n/clear - مسح الذاكرة\n/help - المساعدة");
    } else {
      setUserState(userId, { waitingForPassword: true });
      await sendMessage(chatId, "**هذا البوت خاص ومحمي بكلمة مرور!**\n\nأرسل كلمة المرور:");
    }
    return;
  }

  // Auth check
  if (!state.isApproved || state.isBlocked) {
    if (!state.isApproved && !state.waitingForPassword) {
      setUserState(userId, { waitingForPassword: true });
    }
    await sendMessage(chatId, state.isBlocked ? "تم حظرك." : "أرسل كلمة المرور.");
    return;
  }

  // Commands
  if (text === '/help') {
    await sendMessage(chatId, "**مود شات - المساعدة**\n\n- ذاكرة ذكية\n- متعدد اللغات\n- يعمل بـ Z-AI (GLM-4 Plus)\n\n/start - بدء المحادثة\n/clear - مسح الذاكرة\n/help - المساعدة");
    return;
  }
  if (text === '/clear') {
    messageHistory.delete(userId);
    await sendMessage(chatId, "تم مسح سجل محادثتك.\n\nابدأ محادثة جديدة!");
    return;
  }
  if (text === '/aistatus' && isAdmin) {
    let status = "**حالة AI (Polling Bot):**\n\n";
    try {
      const start = Date.now();
      await getAIResponse([{ role: 'user', content: 'مرحبا' }]);
      status += `Z-AI: يعمل (${Date.now()-start}ms)\n`;
    } catch {
      status += `Z-AI: خطأ\n`;
    }
    status += `\nالبوت يعمل بنظام Polling محلي`;
    await sendMessage(chatId, status);
    return;
  }

  // Regular chat - process with AI
  await sendChatAction(chatId);

  addMessage(userId, 'user', text);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getMessageHistory(userId).slice(-MAX_HISTORY),
  ];

  const { reply, provider } = await getAIResponse(messages);

  addMessage(userId, 'assistant', reply);

  const clean = sanitizeMarkdown(reply);
  await sendMessage(chatId, clean);

  console.log(`[Reply] Provider: ${provider}, Length: ${reply.length}`);
}

// ============================
// Polling Loop
// ============================

async function getUpdates() {
  try {
    const result = await telegramAPI('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: POLL_TIMEOUT,
      allowed_updates: ['message'],
    });

    if (!result.ok) {
      console.log('[Poll] Error:', result.description);
      return;
    }

    for (const update of result.result) {
      if (update.update_id >= lastUpdateId) {
        lastUpdateId = update.update_id;
      }
      if (update.message) {
        await handleMessage(update.message);
      }
    }
  } catch (err) {
    console.log('[Poll] Network error:', err.message);
  }
}

async function main() {
  console.log('🤖 MoodChat Polling Bot starting...');
  console.log('📡 Using Z-AI internal API (GLM-4 Plus)');
  console.log('🔑 Admin IDs:', ADMIN_IDS.join(', '));

  // Test Z-AI connection
  try {
    const start = Date.now();
    const result = await getAIResponse([{ role: 'user', content: 'مرحبا، اختصار' }]);
    console.log(`✅ Z-AI connection OK (${Date.now()-start}ms): ${result.reply.substring(0, 30)}...`);
  } catch (err) {
    console.log('⚠️  Z-AI test failed:', err.message);
  }

  // Delete any existing webhook (polling mode requires it)
  console.log('🔄 Deleting webhook for polling mode...');
  const delResult = await telegramAPI('deleteWebhook', {});
  console.log('   Result:', delResult.description || delResult.ok);

  console.log('🚀 Bot is running! Press Ctrl+C to stop.\n');

  // Main polling loop
  while (true) {
    await getUpdates();
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Bot shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.log('[Error] Uncaught:', err.message);
});

main().catch(err => {
  console.log('Fatal error:', err);
  process.exit(1);
});
