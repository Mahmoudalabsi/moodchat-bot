---
Task ID: wa-cloud-setup
Agent: main (Super Z)
Task: بناء بوت WhatsApp Cloud API الرسمي من Meta وربطه بالـ Dashboard والذكاء الاصطناعي الموجود

Work Log:
- تم استلام معطيات المستخدم:
  - ACCESS_TOKEN من System Users (Meta Business)
  - PHONE_NUMBER_ID = 1337248955274773
  - BUSINESS_ID = 264033988099879
  - VERIFY_TOKEN = MOOD_BOT_2026_WA (مختار من قبلنا)
- تم تحديث ملف .env و .env.local بالمعطيات الجديدة
- تم تعطيل بوت Baileys القديم (إعادة تسميته إلى whatsapp-bot.ts.bak)
- تم التحقق من وجود البنية الكاملة:
  - src/whatsapp-cloud.ts: بوت WhatsApp Cloud API الرئيسي (685 سطر)
  - src/app/api/whatsapp/webhook/route.ts: webhook endpoint
  - src/app/api/whatsapp/test/route.ts: اختبار الاتصال
  - src/app/api/whatsapp/send/route.ts: إرسال رسائل
  - src/app/api/whatsapp-status/route.ts: حالة البوت
  - src/app/page.tsx: قسم WhatsApp في الـ Dashboard (موجود مسبقاً)
- تم اختبار الاتصال بـ Meta Graph API:
  - HTTP 200 OK ✅
  - Phone Number ID متطابق
- تم تحديث قاعدة البيانات BotConfig:
  - wa_cloud_ready = true
  - wa_cloud_phone_number_id = 1337248955274773
  - wa_cloud_verify_token = MOOD_BOT_2026_WA
  - wa_cloud_api_version = v21.0
  - wa_cloud_business_id = 264033988099879
  - wa_bot_ready = false (إيقاف Baileys)
- تم تشغيل Next.js dev server والتحقق:
  - GET /api/whatsapp-status → 200 OK، connected: true
  - GET /api/whatsapp/webhook (verify) → 200 OK، يعيد challenge
- الـ webhook POST يحتاج رقم مستلم معتمد في Meta للاختبار الكامل

Stage Summary:
- بوت WhatsApp Cloud API الرسمي يعمل ومرتبط بنفس DB Telegram bot
- نفس Z-AI SDK (GLM-4 Plus)، نفس SYSTEM_PROMPT، نفس آلية anti-loop
- يدعم: نصوص، صور، مستندات (PDF/DOCX/Excel)، صوت، فيديو، ملصقات
- نظام الموافقة والانضمام (كلمة مرور MOOD2026) مطبق
- أوامر المدير: /stats، /إحصائيات
- التقسيم التلقائي للرسائل الطويلة (>3800 حرف)
- الـ Dashboard يعرض: حالة الاتصال، عدد المستخدمين، عدد الرسائل، نبضات الحياة
- الخطوة التالية للمستخدم: ضبط webhook URL في Meta لاستقبال الرسائل الواردة
