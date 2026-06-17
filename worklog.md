---
Task ID: 1
Agent: main
Task: Fix Worker file analysis - PDF parser, syntax errors, and Worker restart

Work Log:
- Read and analyzed telegram-bot.ts (918 lines) and ai-worker.ts (1216 lines)
- Found the code already had comprehensive file analysis support for PDF, DOCX, Excel, code, audio, video, images, stickers
- Discovered Worker was not running (last heartbeat 3+ hours ago) with 57 failed messages
- Fixed 5 syntax errors in ai-worker.ts (extra `]` brackets in console.error lines)
- Fixed PDF parser: pdf-parse v2 has incompatible class-based API, switched to pdfjs-dist directly
- Cleaned up stuck "processing" messages in database
- Restarted Worker - it's now running and processing messages
- Committed and pushed fixes to GitHub

Stage Summary:
- Worker is now running and processing messages with rate limit retry logic
- PDF parsing now uses pdfjs-dist directly (more reliable)
- All file types supported: PDF, DOCX, Excel, code, text, audio, video, images
- Key bug fix: pdf-parse v2 API was completely different from v1, causing "pdfParse is not a function" error
- The Vercel webhook already handles document, voice, audio, video, sticker uploads correctly

---
Task ID: WA-1
Agent: main
Task: إضافة بوت واتساب (WhatsApp Cloud API) بجانب بوت تيليجرام دون لمسه

Work Log:
- استنساخ المشروع من GitHub (Mahmoudalabsi/moodchat-bot)
- فحص معمق للبنية الحالية: telegram-bot.ts (47KB), worker.mjs, ai-worker.ts, dashboard page.tsx (2197 سطر)
- تأكيد عدم وجود أي كود واتساب سابق
- تحديث Prisma schema: إضافة WhatsAppUser model منفصل تماماً + WhatsAppJoinLog + حقول جديدة في Message (platform, whatsappPhone) مع جعل userId اختيارياً
- إنشاء src/lib/whatsapp-cloud.ts (450+ سطر): مكتبة كاملة للتعامل مع WhatsApp Cloud API v21.0
  - verifyWebhook, handleWhatsAppWebhook
  - sendTextMessage, sendLongTextMessage (تقسيم تلقائي عند 3800 حرف)
  - sendImageMessage, sendDocumentMessage, sendAudioMessage, sendVideoMessage, sendStickerMessage, sendLocationMessage, sendReaction
  - downloadMedia, uploadMedia
  - getOrCreateWhatsAppUser, isWhatsAppAdmin, logWhatsAppJoin
  - getBotStatus, sendTestMessage, getWhatsAppConfig
  - مكافحة الحلقة التكرارية (anti-loop via dedup cache)
  - نفس SYSTEM_PROMPT المستخدم في تيليجرام لضمان سلوك موحد
- إنشاء 6 مسارات API:
  - /api/whatsapp/webhook (GET verify + POST receive)
  - /api/whatsapp/send (POST إرسال + GET إحصائيات)
  - /api/whatsapp/test (POST اختبار + GET فحص اتصال)
  - /api/whatsapp-status (GET حالة كاملة)
  - /api/whatsapp-users (GET list + POST approve/block/unblock/delete)
  - /api/whatsapp-config (GET إعدادات عامة)
- إنشاء whatsapp-worker.mjs (450+ سطر): عامل خلفي مستقل تماماً عن worker.mjs الخاص بتيليجرام
  - يستعلم فقط عن platform='whatsapp' وstatus='pending'
  - يدعم: نص، صور (VLM)، مستندات (PDF/DOCX/Excel/text)، صوت (ASR)، فيديو
  - يستخدم نفس Z-AI SDK config
  - مكافحة المعالجة المزدوجة (processingIds Set)
  - heartbeat كل 30 ثانية
- إنشاء start-whatsapp-worker.sh لبدء العامل
- تحديث .env.example بإضافة كل متغيرات WhatsApp (WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, WA_API_VERSION, WA_ADMIN_PHONES, WABA_ID, BUSINESS_ID, APP_ID)
- تحديث vercel.json لمنح مدة 60 ثانية لـ whatsapp webhook (مثل telegram)
- إضافة 35+ مفتاح ترجمة جديد إلى src/lib/i18n.ts (عربي + إنجليزي) لتبويب WhatsApp
- تحديث src/app/page.tsx (اللوحة الإدارية):
  - إضافة تبويب "واتساب" جديد بجانب الإحصائيات/المستخدمين/المحادثات/الإعدادات
  - إضافة حالات (state) خاصة بـ WhatsApp: waStatus, waUsers, waLoading, waTestPhone, waTestText, waSending, waTestResult, waActionLoading
  - إضافة 6 دوال: fetchWhatsAppStatus, fetchWhatsAppUsers, refreshWhatsApp, sendWhatsAppTest, waUserAction, useEffect لتحميل البيانات عند فتح التبويب
  - إضافة قسم WhatsApp كامل يتضمن:
    * بطاقة الحالة (متصل/غير متصل) مع زر تحديث
    * معلومات الاتصال (API version, Phone Number ID, Display Number, Verified Name, Verify Token, Webhook URL)
    * تحذير عند عدم ضبط WA_ACCESS_TOKEN
    * إحصائيات واتساب (6 بطاقات: مستخدمون، موافقون، معلقون، محظورون، رسائل، معلقة)
    * نموذج إرسال رسالة اختبار
    * جدول مستخدمي واتساب مع أزرار (موافقة/حظر/فك حظر)
  - تحديث واجهة Message لتشمل platform و whatsappPhone
- اختبار البناء (next build) — نجح! تجاهل Next.js أخطاء TypeScript (كما في الإعداد الحالي)
- جميع مسارات WhatsApp ظهرت في ناتج البناء

Stage Summary:
- ✅ تمت إضافة بوت واتساب كامل بجانب بوت تيليجرام دون أي تعديل على كود تيليجرام
- ✅ بوت التلجرام لم يُلمس إطلاقاً (telegram-bot.ts, worker.mjs, ai-worker.ts كما هي)
- ✅ بيانات الواتساب منفصلة في نموذج WhatsAppUser منفصل عن TelegramUser
- ✅ نفس قاعدة البيانات (Neon PostgreSQL) + نفس الذكاء (Z-AI SDK / GLM-4 Plus)
- ✅ نفس اللوحة الإدارية مع تبويب WhatsApp منفصل
- ✅ نفس كلمة المرور (MOOD2026) + نظام الموافقة + الحظر
- ✅ مكافحة الحلقة التكرارية في كل من البوتين منفصلين
- ✅ عامل واتساب خلفي مستقل (whatsapp-worker.mjs) — يمكن تشغيله جنباً إلى جنب مع worker.mjs
- المسارات الجديدة: /api/whatsapp/webhook, /api/whatsapp/send, /api/whatsapp/test, /api/whatsapp-status, /api/whatsapp-users, /api/whatsapp-config
- الملفات الجديدة: src/lib/whatsapp-cloud.ts, src/app/api/whatsapp/* (6 routes), whatsapp-worker.mjs, start-whatsapp-worker.sh
- الملفات المعدلة: prisma/schema.prisma, .env.example, vercel.json, src/lib/i18n.ts, src/app/page.tsx

الخطوات التالية المطلوبة من المستخدم:
1. إضافة WA_ACCESS_TOKEN في Vercel env vars (System User Token من Meta Business)
2. تشغيل prisma db push على Vercel (سيتم تلقائياً عند النشر بسبب buildCommand)
3. إعداد الـ Webhook في Meta Dashboard: https://<vercel-domain>/api/whatsapp/webhook مع Verify Token = MOOD_BOT_2026_WA
4. الاشتراك في حقلي messages و message_status
5. تشغيل whatsapp-worker.mjs على VPS (بنفس طريقة worker.mjs): bun whatsapp-worker.mjs أو pm2 start whatsapp-worker.mjs --name moodchat-wa
