
---
Task ID: switch-bot-token
Agent: main (Super Z)
Task: تبديل توكن البوت من @chatmoodebot إلى @moodvhatbot (البوت الذي يستخدمه المستخدم فعلياً) لإزالة إعلانات "join our channel https://t.me/A_ToolsX" التي تُحقن من خدمة خارجية.

Work Log:
- اكتشفت أن المستخدم يراسل @moodvhatbot (ID 8401809931) لكن كودنا يعمل على @chatmoodebot (ID 8643651729).
- إعلان "🚀 To use this bot, you must join our channel: https://t.me/A_ToolsX" ليس في الكود إطلاقاً — يُحقن من خدمة خارجية تُدير @moodvhatbot.
- المستخدم قدم التوكن الصحيح: 8401809931:AAF3-GTJlr0R58VbDHENcsMP6yNg0mOol3g
- استبدلت التوكن القديم بالجديد في 20 ملف:
  * worker-continuous.js, run-bot-permanent.sh, worker-persistent.sh
  * ecosystem.config.js, process-pending.js
  * src/lib/telegram-bot.ts, src/ai-worker.ts, src/whatsapp-bot.ts
  * src/app/api/messages/send/route.ts
  * src/app/api/process-pending/route.ts
  * src/app/api/tg-auto-process/route.ts
  * src/app/api/dashboard/route.ts
  * src/app/api/photo-proxy/route.ts, src/app/api/file-proxy/route.ts
  * src/app/api/profile-photos/route.ts
  * src/app/api/test-tg-file/route.ts, src/app/api/test-vlm/route.ts
  * src/app/api/debug/route.ts
  * scripts/test-send-voice.js, scripts/test-send-voice2.js
- commit: 6506439 "fix: switch bot token from @chatmoodebot to @moodvhatbot (user's actual bot)"
- دُفع إلى GitHub (Vercel سيعيد البناء تلقائياً).
- قتلت العمليات القديمة (PID 4122 bash + 8857 worker) وأعدت تشغيل bash wrapper بـ nohup.
- بدأ الـ worker الجديد (PID 10293) بنجاح:
  * Bot token: ...g0mOol3g (التوكن الجديد ✅)
  * Webhook deleted: OK ✅
  * DB connected ✅
  * لا أخطاء getUpdates ✅
  * لا أخطاء Conflict ✅

Stage Summary:
- البوت الآن يعمل على التوكن الصحيح (@moodvhatbot).
- كودنا أصبح يتولى polling — الخدمة الخارجية التي كانت تُحقن الإعلان ستحصل على Conflict وتتوقف تلقائياً.
- لا حاجة لإعادة تشغيل الخدمة الخارجية — Telegram يسمح فقط لـ polling واحد لكل توكن.
- المستخدم يجب أن يجرب إرسال رسالة للبوت للتأكد من عدم ظهور الإعلان.
