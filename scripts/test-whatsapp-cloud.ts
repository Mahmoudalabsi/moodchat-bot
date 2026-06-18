/**
 * WhatsApp Cloud API Connection Test
 * يختبر الاتصال بـ WhatsApp Cloud API الرسمي
 */
import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const API_VERSION = process.env.WA_API_VERSION || 'v21.0';
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || '';

console.log('════════════════════════════════════════════════');
console.log('  📱 اختبار WhatsApp Cloud API');
console.log('════════════════════════════════════════════════');
console.log('');
console.log('📋 الإعدادات:');
console.log(`  API Version:    ${API_VERSION}`);
console.log(`  Phone Number ID: ${PHONE_NUMBER_ID}`);
console.log(`  Verify Token:   ${VERIFY_TOKEN}`);
console.log(`  Access Token:   ${ACCESS_TOKEN.substring(0, 30)}...`);
console.log('');

async function testConnection() {
  // 1. اختبار جلب معلومات رقم الهاتف
  console.log('🔍 [1] اختبار جلب معلومات رقم الهاتف...');
  try {
    const response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
      }
    );
    
    const data = await response.json();
    console.log(`  HTTP Status: ${response.status}`);
    
    if (response.ok && data?.id) {
      console.log('  ✅ نجح الاتصال!');
      console.log(`  📞 Display Phone: ${data.display_phone_number || 'غير متاح'}`);
      console.log(`  ✅ Verified Name: ${data.verified_name || 'غير متحقق'}`);
      console.log(`  🆔 ID: ${data.id}`);
      console.log(`  💬 Quality Rating: ${data.quality_rating || 'غير متاح'}`);
      return true;
    } else {
      console.log('  ❌ فشل الاتصال');
      console.log(`  الخطأ: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (err: any) {
    console.log(`  ❌ خطأ: ${err?.message}`);
    return false;
  }
}

async function testSendMessage(phoneNumber?: string) {
  if (!phoneNumber) {
    console.log('');
    console.log('ℹ️  [2] تخطي اختبار الإرسال - لم يتم تمرير رقم هاتف');
    return;
  }
  
  console.log('');
  console.log(`📨 [2] اختبار إرسال رسالة إلى ${phoneNumber}...`);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: { 
            body: '🎉 مرحباً! تم ربط بوت واتساب بنجاح!\n\nأنا مود شات - مساعدك الذكي الخبير.\n\nأرسل أي سؤال وسأجيبك فوراً.' 
          },
        }),
      }
    );
    
    const data = await response.json();
    console.log(`  HTTP Status: ${response.status}`);
    
    if (response.ok) {
      console.log('  ✅ تم الإرسال بنجاح!');
      console.log(`  📨 Message ID: ${data.messages?.[0]?.id || 'غير متاح'}`);
    } else {
      console.log('  ❌ فشل الإرسال');
      console.log(`  الخطأ: ${JSON.stringify(data, null, 2)}`);
    }
  } catch (err: any) {
    console.log(`  ❌ خطأ: ${err?.message}`);
  }
}

async function main() {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log('❌ متغيرات البيئة غير مضبوطة!');
    process.exit(1);
  }
  
  const connected = await testConnection();
  
  // إذا تم تمرير رقم هاتف كمعطى، اختبر الإرسال
  const testPhone = process.argv[2];
  if (connected) {
    await testSendMessage(testPhone);
  }
  
  console.log('');
  console.log('════════════════════════════════════════════════');
  if (connected) {
    console.log('🎉 النتيجة: تم ربط بوت WhatsApp Cloud API بنجاح!');
    console.log('');
    console.log('📋 الخطوات التالية:');
    console.log('  1. اضبط webhook في Meta لاستقبال الرسائل');
    console.log(`     URL: https://your-domain.com/api/whatsapp/webhook`);
    console.log(`     Verify Token: ${VERIFY_TOKEN}`);
    console.log('  2. اشترك في الأحداث: messages, message_status');
    console.log('  3. أضف رقم المستلم التجريبي في Meta');
  } else {
    console.log('⚠️  النتيجة: يوجد مشكلة في الاتصال');
  }
  console.log('════════════════════════════════════════════════');
  
  process.exit(0);
}

main();
