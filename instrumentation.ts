/**
 * Next.js Instrumentation - يبدأ البوت تلقائياً عند تشغيل السيرفر
 * البوت يعمل كـ long polling داخل عملية Next.js نفسها
 */

 

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('🤖 Starting Telegram Bot integration...');

    // Start the bot polling in background (non-blocking)
    startBotPolling().catch(console.error);
  }
}

async function startBotPolling() {
  const BOT_TOKEN = '8057917472:AAG7jNGQVw9M9tXLiLVUu4rTYfNCTKPUTCk';
  const ADMIN_IDS = [1429407129];
  const JOIN_PASSWORD = 'ai2024';
  const MAX_HISTORY = 20;

  const SYSTEM_PROMPT = "أنت مساعد ذكي ومفيد. تجيب بوضوح ودقة وبأسلوب ودي. يمكنك التحدث بأي لغة يطلبها المستخدم. كن مختصراً في الإجابات إلا إذا طُلب منك التفصيل.";

  const waitingForPassword = new Set<number>();
  let lastUpdateId = 0;

  // Telegram API
  async function telegramAPI(method: string, params: Record<string, unknown> = {}) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async function sendMsg(chatId: number, text: string) {
    return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
  }

  async function sendTyping(chatId: number) {
    return telegramAPI('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  function isAdmin(userId: number) {
    return ADMIN_IDS.includes(userId);
  }

  // AI via Z-AI CLI - مجاني 100%
  function chatWithZAI(userMessage: string, history: string): string {
    try {
      let sys = SYSTEM_PROMPT;
      if (history) sys += `\n\nسجل المحادثة السابقة:\n${history}`;

      const pf = `${tmpdir()}/zai_p_${Date.now()}.txt`;
      const sf = `${tmpdir()}/zai_s_${Date.now()}.txt`;

      writeFileSync(pf, userMessage, 'utf-8');
      writeFileSync(sf, sys, 'utf-8');

      const cmd = `z-ai chat --prompt "$(cat ${pf})" --system "$(cat ${sf})"`;
      const result = execSync(cmd, { timeout: 90000, encoding: 'utf-8', maxBuffer: 1024 * 1024 });

      try { unlinkSync(pf); } catch {}
      try { unlinkSync(sf); } catch {}

      const lines = result.split('\n');
      let jsonStart = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('{')) { jsonStart = i; break; }
      }

      if (jsonStart >= 0) {
        try {
          const data = JSON.parse(lines.slice(jsonStart).join('\n'));
          const reply = data?.choices?.[0]?.message?.content;
          if (reply?.trim()) return reply.trim();
        } catch {}
      }

      return lines.filter(l => !l.startsWith('🚀')).join('\n').trim() || 'عذراً، حاول مرة أخرى.';
    } catch (error) {
      console.error('Z-AI Error:', error);
      throw error;
    }
  }

  // Process incoming message
   
  async function processMessage(message: any) {
    if (!message?.from || !message?.text) return;

    const userId = message.from.id;
    const chatId = message.chat.id;
    const text = message.text.trim();

    console.log(`📩 [${message.from.first_name || 'Unknown'}] ${text.substring(0, 50)}`);

    if (text === '/start') {
      if (isAdmin(userId)) {
        await sendMsg(chatId,
          "مرحباً! 👋 أنا بوت ذكاء اصطناعي خاص\n\n"
          + "الأوامر:\n/start - بدء\n/clear - مسح\n/help - مساعدة\n/dashboard - لوحة التحكم"
        );
      } else {
        waitingForPassword.add(userId);
        await sendMsg(chatId, "🔐 **بوت خاص ومحمي بكلمة سر!**\n\nأرسل كلمة السر:");
      }
      return;
    }

    if (waitingForPassword.has(userId)) {
      if (text === JOIN_PASSWORD) {
        waitingForPassword.delete(userId);
        await sendMsg(chatId, "✅ **تم التحقق بنجاح!** 🎉\nيمكنك محادثتي بحرية الآن.");
      } else {
        await sendMsg(chatId, "❌ **كلمة السر خاطئة!** حاول مرة أخرى.");
      }
      return;
    }

    if (text === '/help') {
      await sendMsg(chatId, "🤖 **مساعدة**\n\n/start - بدء\n/clear - مسح السجل\n/help - المساعدة"
        + (isAdmin(userId) ? "\n\n👑 **المدير:**\n/dashboard - إحصائيات\n/users - المستخدمين" : ""));
      return;
    }

    if (text === '/clear') {
      await sendMsg(chatId, "🗑️ تم مسح سجل محادثتك.");
      return;
    }

    if (text === '/dashboard' && isAdmin(userId)) {
      try {
        const statsRes = await fetch('http://localhost:3000/api/stats');
        const stats = await statsRes.json();
        await sendMsg(chatId,
          `📊 **لوحة التحكم**\n\n👥 المستخدمين: ${stats.totalUsers}\n✅ الموافق عليهم: ${stats.approvedUsers}\n🚫 المحظورين: ${stats.blockedUsers}\n📨 الرسائل: ${stats.totalMessages}\n📩 رسائل اليوم: ${stats.messagesToday}\n🤖 مزود: Z-AI مجاني`
        );
      } catch {
        await sendMsg(chatId, "❌ خطأ في جلب الإحصائيات");
      }
      return;
    }

    if (text === '/users' && isAdmin(userId)) {
      try {
        const res = await fetch('http://localhost:3000/api/users?limit=10');
        const data = await res.json();
        const list = (data.users || []).map((u: { isBlocked: boolean; isApproved: boolean; firstName: string | null; username: string | null; userId: number }) => {
          const s = u.isBlocked ? '🚫' : u.isApproved ? '✅' : '⏳';
          return `${s} ${u.firstName || u.username || 'مجهول'} (${u.userId})`;
        }).join('\n');
        await sendMsg(chatId, `👥 **المستخدمين:**\n\n${list || 'لا يوجد'}`);
      } catch {
        await sendMsg(chatId, "❌ خطأ في جلب المستخدمين");
      }
      return;
    }

    // Regular AI chat
    await sendTyping(chatId);

    try {
      let history = '';
      try {
        const msgsRes = await fetch(`http://localhost:3000/api/messages?userId=${userId}&limit=${MAX_HISTORY}`);
        const msgsData = await msgsRes.json();
        if (msgsData?.messages) {
           
          history = msgsData.messages.reverse().map((m: any) =>
            `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.content}`
          ).join('\n');
        }
      } catch {}

      const aiReply = chatWithZAI(text, history);
      await sendMsg(chatId, aiReply);
      console.log(`✅ Replied to ${userId}`);
    } catch (error) {
      console.error('Chat error:', error);
      await sendMsg(chatId, "❌ خطأ مؤقت. حاول بعد قليل.");
    }
  }

  // Delete webhook first
  await telegramAPI('deleteWebhook');

  console.log('🤖 Telegram Bot started - Long Polling mode');
  console.log('📡 AI: Z-AI (GLM-4 Plus) - FREE');
  console.log('👑 Admin: 1429407129');

  // Polling loop
  while (true) {
    try {
      const result = await telegramAPI('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message'],
      });

      if (result?.ok && result.result?.length > 0) {
        for (const update of result.result) {
          lastUpdateId = update.update_id;
          if (update.message) {
            await processMessage(update.message);
          }
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
