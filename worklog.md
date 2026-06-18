
---
Task ID: implement-commands-in-worker
Agent: main (Super Z)
Task: إصلاح عدم عمل أوامر /start و /help والأوامر الأخرى في البوت — كانت تُتجاهل تماماً.

Work Log:
- اكتشفت أن الـ container أُعيد تشغيله من snapshot قديم — كل التغييرات السابقة اختفت محلياً.
- نفّذت `git reset --hard origin/main` لاستعادة آخر commit (3ec3299) من GitHub.
- تحققت أن كل التعديلات السابقة موجودة: التوكن الجديد، scripts/start-bot-detached.sh، run-bot-permanent.sh، fix upsertTelegramUser.
- فحص كود worker-continuous.js ووجدت السبب الحقيقي:
  * السطور 2015-2018: `if (text === '/start' || text === '/help') { return true; }` — يتجاهل الأمر بدون رد!
  * السبب: تعليق قديم "let Vercel handle these" لكن Vercel webhook معطّل — فقط الـ worker يعالج الرسائل.
- أضفت معالجة كاملة للأوامر في worker-continuous.js:
  * `/start` و `/help` → رد كامل بقائمة الأوامر (نسختان: admin/user)
  * `/clear` → يمسح ذاكرة المحادثة (DB marker)
  * `/stats` (admin) → إحصائيات DB (users, messages, pending)
  * `/aistatus` (admin) → ping Z-AI + رد بالحالة
- الأوامر الأخرى (`/search`, `/draw`, `/tts`, `/read`, `/agent`, `/think`, `/thinkagent`) كانت تعمل مسبقاً عبر startsWith() — لم تحتاج تعديل.
- commit ca1ba0c + push to origin/main (Vercel سيعيد البناء تلقائياً).
- شغّلت البوت عبر scripts/start-bot-detached.sh:
  * Bash wrapper PID 1342 ✅
  * Node worker PID 1349 ✅
  * Bot token: ...43n3QJDM ✅
  * Webhook deleted: OK ✅
  * DB connected ✅
  * لا أخطاء ✅

Stage Summary:
- البوت الآن يعالج كل الأوامر مباشرة بدون الحاجة لـ Vercel:
  /start, /help, /clear, /stats, /aistatus (جديدة)
  /search, /draw, /tts, /read, /agent, /think, /thinkagent (موجودة مسبقاً)
- المستخدم يجب أن يجرب: /start → سيرى قائمة الأوامر الكاملة.
- لوحة الإدارة على Vercel ستعمل تلقائياً بعد إعادة البناء (~60s).
