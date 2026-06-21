import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

/**
 * Diagnostic endpoint: /api/whatsapp/debug
 * يختبر كل المكونات: Z-AI SDK، اتصال Meta، webhook، worker، إرسال رسالة
 * ويعطي تعليمات واضحة للمستخدم لماذا البوت لا يعمل
 */
const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const test = searchParams.get('test') || 'all';
  const phone = searchParams.get('phone') || '';

  const result: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    vercel_url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    tests: {},
    diagnosis: [],
    next_steps: [],
  };

  // 1. فحص متغيرات البيئة
  const token = process.env.WA_TOKEN || process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const verifyToken = process.env.WA_VERIFY_TOKEN || 'MOOD_BOT_2026_WA';

  result.tests.env = {
    WA_TOKEN: !!token,
    WA_PHONE_NUMBER_ID: phoneId,
    WA_BUSINESS_ID: process.env.WA_BUSINESS_ID,
    WA_PHONE_NUMBER: process.env.WA_PHONE_NUMBER,
    WA_VERIFY_TOKEN: verifyToken,
    DATABASE_URL: !!process.env.DATABASE_URL,
  };

  if (!token || !phoneId) {
    result.diagnosis.push('❌ متغيرات البيئة غير مكتملة (WA_TOKEN أو WA_PHONE_NUMBER_ID مفقود)');
    result.next_steps.push('أضف WA_TOKEN و WA_PHONE_NUMBER_ID في إعدادات Vercel Environment Variables');
  } else {
    result.diagnosis.push('✅ متغيرات البيئة مكتملة');
  }

  // 2. اتصال Meta Graph API
  if (test === 'all' || test === 'meta') {
    try {
      const start = Date.now();
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const elapsed = Date.now() - start;
      result.tests.meta = {
        ok: res.ok,
        status: res.status,
        elapsed_ms: elapsed,
        display_phone_number: data?.display_phone_number,
        verified_name: data?.verified_name,
        error: data?.error?.message,
      };
      if (res.ok && data?.display_phone_number) {
        result.diagnosis.push(`✅ اتصال Meta ناجح - رقم البوت: ${data.display_phone_number}`);
      } else {
        result.diagnosis.push(`❌ فشل اتصال Meta: ${data?.error?.message || res.status}`);
      }
    } catch (err: any) {
      result.tests.meta = { ok: false, error: String(err?.message || err).substring(0, 300) };
      result.diagnosis.push(`❌ خطأ في اتصال Meta: ${err?.message?.substring(0, 100)}`);
    }
  }

  // 3. Z-AI SDK (محلياً يعمل، على Vercel لا)
  if (test === 'all' || test === 'ai') {
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAIClass = ZAIModule.default;
      const zai = new ZAIClass({
        baseUrl: 'https://internal-api.z.ai/v1',
        apiKey: 'Z.ai',
        userId: '014c4da7-4f7f-4efa-9157-9091a73a3570',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0',
      });

      const start = Date.now();
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: 'قل: OK' }],
        model: 'glm-4-plus',
        temperature: 0.7,
        max_tokens: 20,
        thinking: { type: 'disabled' },
      });
      const elapsed = Date.now() - start;
      const reply = completion?.choices?.[0]?.message?.content;

      result.tests.ai = {
        ok: !!reply,
        elapsed_ms: elapsed,
        reply: reply?.substring(0, 200),
      };
      if (reply) {
        result.diagnosis.push(`✅ Z-AI SDK يعمل على Vercel (${elapsed}ms)`);
      } else {
        result.diagnosis.push('⚠️ Z-AI SDK عاد بدون رد على Vercel');
      }
    } catch (err: any) {
      result.tests.ai = {
        ok: false,
        error: String(err?.message || err || '').substring(0, 300),
      };
      result.diagnosis.push('⚠️ Z-AI SDK لا يعمل على Vercel (هذا طبيعي - المعالجة تتم محلياً عبر wa-worker)');
    }
  }

  // 4. حالة الـ Worker المحلي (من نبضات الحياة في DB)
  if (test === 'all' || test === 'worker') {
    try {
      const heartbeat = await db.botConfig.findUnique({ where: { key: 'wa_worker_heartbeat' } });
      const startedAt = await db.botConfig.findUnique({ where: { key: 'wa_worker_started_at' } });
      const lastHeartbeatMs = heartbeat?.value ? Date.now() - new Date(heartbeat.value).getTime() : null;
      const isAlive = lastHeartbeatMs !== null && lastHeartbeatMs < 60000;
      result.tests.worker = {
        alive: isAlive,
        last_heartbeat: heartbeat?.value,
        last_heartbeat_age_seconds: lastHeartbeatMs !== null ? Math.round(lastHeartbeatMs / 1000) : null,
        started_at: startedAt?.value,
      };
      if (isAlive) {
        result.diagnosis.push(`✅ WhatsApp Worker يعمل (آخر نبضة منذ ${Math.round(lastHeartbeatMs! / 1000)} ثانية)`);
      } else {
        result.diagnosis.push('❌ WhatsApp Worker متوقف أو لا يوجد نبضة حياة');
        result.next_steps.push('شغّل الـ Worker محلياً: `node scripts/wa-worker.js` أو `node scripts/supervisor.js`');
      }
    } catch (err: any) {
      result.tests.worker = { ok: false, error: String(err?.message || err).substring(0, 200) };
      result.diagnosis.push(`❌ خطأ في فحص الـ Worker: ${err?.message?.substring(0, 100)}`);
    }
  }

  // 5. رسائل WA في قاعدة البيانات
  if (test === 'all' || test === 'db') {
    try {
      const waUsers = await db.telegramUser.count({ where: { username: { startsWith: 'wa_' } } });
      const pendingWaMessages = await db.message.count({
        where: {
          status: 'pending',
          role: 'user',
          user: { username: { startsWith: 'wa_' } },
        },
      });
      const totalWaMessages = await db.message.count({
        where: { user: { username: { startsWith: 'wa_' } } },
      });
      result.tests.db = {
        wa_users: waUsers,
        pending_wa_messages: pendingWaMessages,
        total_wa_messages: totalWaMessages,
      };

      if (totalWaMessages === 0) {
        result.diagnosis.push('❌ لا توجد أي رسائل واتساب في قاعدة البيانات - هذا يعني أن Meta لم ترسل أي رسالة للـ webhook');
        result.next_steps.push('⚠️ يجب ضبط webhook URL في Meta WhatsApp dashboard:');
        result.next_steps.push(`   1. اذهب إلى: https://developers.facebook.com/apps/${process.env.WA_BUSINESS_ID || 'YOUR_APP_ID'}/whatsapp_api/`);
        result.next_steps.push('   2. اضغط "Configuration" ثم "Edit" بجانب Webhook');
        result.next_steps.push(`   3. Callback URL: https://YOUR_VERCEL_DOMAIN.vercel.app/api/whatsapp/webhook`);
        result.next_steps.push(`   4. Verify Token: ${verifyToken}`);
        result.next_steps.push('   5. اشترك في: messages, message_status');
        result.next_steps.push('   6. أضف رقم هاتفك في "Test Recipients" (Test Number فقط يرسل للأرقام المعتمدة)');
      } else if (pendingWaMessages > 0) {
        result.diagnosis.push(`⚠️ يوجد ${pendingWaMessages} رسالة واتساب معلقة - الـ Worker المحلي لم يعالجها بعد`);
        result.next_steps.push('تأكد من تشغيل الـ Worker: `node scripts/wa-worker.js`');
      } else {
        result.diagnosis.push(`✅ ${totalWaMessages} رسالة واتساب في DB، ${waUsers} مستخدم`);
      }
    } catch (err: any) {
      result.tests.db = { ok: false, error: String(err?.message || err).substring(0, 200) };
      result.diagnosis.push(`❌ خطأ في فحص DB: ${err?.message?.substring(0, 100)}`);
    }
  }

  // 6. اختبار إرسال رسالة (يتطلب phone)
  if (test === 'send' && phone) {
    try {
      const start = Date.now();
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: '🤖 رسالة اختبار من مود شات - واتساب يعمل بنجاح!' },
          }),
        }
      );
      const data = await res.json();
      const elapsed = Date.now() - start;
      result.tests.send = {
        ok: res.ok,
        status: res.status,
        elapsed_ms: elapsed,
        to: phone,
        response: data,
      };
      if (res.ok) {
        result.diagnosis.push(`✅ تم إرسال رسالة لـ ${phone} بنجاح`);
      } else {
        const errMsg = data?.error?.message || 'unknown';
        result.diagnosis.push(`❌ فشل إرسال رسالة لـ ${phone}: ${errMsg}`);
        if (errMsg.includes('recipient') || errMsg.includes('Test')) {
          result.next_steps.push('⚠️ رقم الهاتف غير معتمد. أضفه في: WhatsApp API Setup → "To" field → "Manage phone number list"');
        }
      }
    } catch (err: any) {
      result.tests.send = { ok: false, error: String(err?.message || err).substring(0, 300) };
      result.diagnosis.push(`❌ خطأ في الإرسال: ${err?.message?.substring(0, 100)}`);
    }
  }

  // 7. خطوات تالية تلقائية إذا كان هناك مشاكل
  if (result.diagnosis.length === 0) {
    result.next_steps.push('كل شيء يعمل! ✅');
  } else if (result.next_steps.length === 0) {
    result.next_steps.push('كل الفحوصات نجحت. إذا كان البوت لا يستجيب، تحقق من:');
    result.next_steps.push('1. أنك ترسل للرقم الصحيح: ' + (process.env.WA_PHONE_NUMBER || 'غير محدد'));
    result.next_steps.push('2. أن رقمك في قائمة Test Recipients على Meta dashboard');
    result.next_steps.push('3. أن الـ Worker المحلي يعمل (node scripts/wa-worker.js)');
  }

  return NextResponse.json(result, { status: 200 });
}
