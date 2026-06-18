import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const API_VERSION = process.env.WA_API_VERSION || 'v21.0';

async function main() {
  const targetPhone = process.argv[2] || '970593265926';
  
  console.log('════════════════════════════════════════════════');
  console.log('  📨 إرسال رسالة WhatsApp تجريبية');
  console.log('════════════════════════════════════════════════');
  console.log('');
  console.log(`📞 المرسِل (البوت): +1 555-673-9898`);
  console.log(`📞 المرسِل إليه: ${targetPhone}`);
  console.log(`🆔 Phone Number ID: ${PHONE_NUMBER_ID}`);
  console.log('');

  const message = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'text',
    text: {
      body: `🎉 مرحباً من مود شات!

تم ربط بوت WhatsApp Cloud API بنجاح. ✅

أنا مساعدك الذكي الخبير في كل المجالات:
• البرمجة والتقنية
• الكتابة والترجمة
• الطب والعلوم
• الأدب والشعر
• التحليل والاستشارات
• وأي شيء تطلبه!

📝 جرّبني الآن:
أرسل أي سؤال وسأجيبك فوراً.

✨ مثال: "اكتب لي قصيدة عن الوطن" أو "اشرح لي الذكاء الاصطناعي"`
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );

    const data = await response.json();
    console.log(`HTTP Status: ${response.status}`);
    console.log('');

    if (response.ok) {
      console.log('✅ ✅ ✅ تم الإرسال بنجاح! ✅ ✅ ✅');
      console.log('');
      console.log('📋 تفاصيل الرسالة:');
      console.log(`  📨 Message ID: ${data.messages?.[0]?.id || 'غير متاح'}`);
      console.log(`  📞 للرقم: ${targetPhone}`);
      console.log('');
      console.log('📱 تحقق من هاتفك - يجب أن تصلك الرسالة في WhatsApp!');
    } else {
      console.log('❌ فشل الإرسال');
      console.log('');
      console.log('📋 تفاصيل الخطأ:');
      console.log(JSON.stringify(data, null, 2));
      console.log('');
      console.log('💡 الأسباب المحتملة:');
      
      if (data?.error?.code === 131030) {
        console.log('   ⚠️ الرقم غير مضاف في Meta كـ "Test Recipient"');
        console.log('   📍 الحل:');
        console.log('      1. اذهب لـ: developers.facebook.com/apps/1337248955274773/whatsapp/whatsapp_api_setup');
        console.log('      2. تحت "To" → اضغط "Manage phone number list"');
        console.log('      3. اضغط "Add phone number"');
        console.log('      4. أدخل رقمك: ' + targetPhone);
        console.log('      5. أدخل كود التحقق (SMS/WhatsApp)');
      } else if (data?.error?.code === 131047) {
        console.log('   ⚠️ الرقم غير مسجل في WhatsApp');
        console.log('   📍 يجب أن يكون الرقم مسجل في WhatsApp أولاً');
      } else if (data?.error?.code === 131026) {
        console.log('   ⚠️ الرقم غير مضاف للقائمة المعتمدة');
      }
    }
  } catch (err: any) {
    console.log(`❌ خطأ: ${err?.message}`);
  }

  console.log('');
  console.log('════════════════════════════════════════════════');
}

main();
