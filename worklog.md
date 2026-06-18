
---
Task ID: switch-to-new-bot-token
Agent: main (Super Z)
Task: تبديل التوكن إلى بوت جديد أنشأه المستخدم: @moodchatbot (ID 8877954741) — بوت نظيف بدون خدمات خارجية تُحقن إعلانات.

Work Log:
- استلمت التوكن الجديد: 8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM
- تحققت من صحة التوكن: getMe → {"id":8877954741,"username":"moodchatbot","first_name":"CHATBOT"} ✅
- استبدلت التوكن القديم (8401809931) بالجديد في 20 ملف:
  * worker-continuous.js, run-bot-permanent.sh, worker-persistent.sh
  * ecosystem.config.js, process-pending.js
  * src/lib/telegram-bot.ts, src/ai-worker.ts, src/whatsapp-bot.ts
  * src/app/api/messages/send/route.ts, process-pending/route.ts
  * src/app/api/tg-auto-process/route.ts, dashboard/route.ts
  * src/app/api/photo-proxy/route.ts, file-proxy/route.ts, profile-photos/route.ts
  * src/app/api/test-tg-file/route.ts, test-vlm/route.ts, debug/route.ts
  * scripts/test-send-voice.js, scripts/test-send-voice2.js
- commit c68a8d9 + push to origin/main (Vercel سيعيد البناء تلقائياً).
- فحصت البوت الجديد على Telegram: لا webhook مفعّل، لا أوامر مضمنة، لا descriptions.
- المشكلة التي ظهرت: الـ worker كان يموت عند انتهاء جلسة الـ bash التي أطلقته (SIGHUP).
- الحل: أنشأت scripts/start-bot-detached.sh يستخدم setsid+nohup+disown للفصل الكامل.
- شغّلت البوت بالـ launcher الجديد:
  * Bash wrapper PID 10930 ✅
  * Node worker PID 10937 ✅
  * Bot token: ...43n3QJDM ✅
  * Webhook deleted: OK ✅
  * DB connected ✅
  * مستقر بعد 55+ ثانية بدون أي خطأ ✅

Stage Summary:
- البوت الجديد @moodchatbot (8877954741) يعمل الآن بكودنا مباشرة.
- لا إعلانات، لا خدمات خارجية، لا تضارب.
- Vercel سيعيد نشر الـ API routes بالتوكن الجديد تلقائياً خلال دقيقة.
- للمستخدم: جرّب إرسال /start إلى @moodchatbot — يجب أن يعمل فوراً وبدون إعلان A_ToolsX.
- للحفاظ على استقرار البوت في الجلسات القادمة: استخدم `bash /home/z/my-project/scripts/start-bot-detached.sh` بعد إعادة تشغيل الـ VPS.
