import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const API_VERSION = 'v21.0';

const candidates = [
  '995700279847597',    // الأول
  '1180359958489968',   // الثاني
];

async function testPhoneId(id: string) {
  console.log(`\n📋 فحص ID: ${id}`);
  console.log('─'.repeat(50));
  
  // 1. GET معلومات الرقم
  const r = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${id}`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d = await r.json();
  console.log(`HTTP: ${r.status}`);
  
  if (r.ok && !d.error) {
    console.log(`✅ نوع الكائن: ${d.category || d.objective || 'غير محدد'}`);
    console.log(`📛 الاسم: ${d.name || d.display_phone_number || 'غير متاح'}`);
    console.log(`📞 Display Phone: ${d.display_phone_number || 'غير متاح'}`);
    console.log(`✅ Verified: ${d.verified_name || 'غير متاح'}`);
    console.log(`🆔 Account ID: ${d.account?.id || 'غير متاح'}`);
    
    // محاولة إرسال رسالة اختبار
    if (d.display_phone_number) {
      console.log(`\n📨 محاولة إرسال رسالة اختبار (لن تنجح بدون recipient)`);
      const sendRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '1234567890', // رقم وهمي - فقط لاختبار صلاحية الـ ID
            type: 'text',
            text: { body: 'test' },
          }),
        }
      );
      const sendData = await sendRes.json();
      console.log(`HTTP Send: ${sendRes.status}`);
      console.log(`Response: ${JSON.stringify(sendData).substring(0, 300)}`);
      
      // إذا كان الخطأ عن recipient وليس عن ID فالـ ID صحيح
      if (sendData.error?.message?.includes('recipient') || 
          sendData.error?.message?.includes('phone number') ||
          sendData.error?.code === 131030 ||
          sendData.error?.code === 131047) {
        console.log(`\n🎉 هذا هو Phone Number ID الصحيح!`);
        console.log(`   البوت يمكنه الإرسال من: ${d.display_phone_number}`);
        return { id, success: true, phone: d.display_phone_number };
      }
    }
  } else {
    console.log(`❌ ${d.error?.message || 'خطأ غير معروف'}`);
  }
  
  return { id, success: false };
}

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 اختبار الرقمين لمعرفة Phone Number ID الصحيح');
  console.log('════════════════════════════════════════════════');
  console.log(`Token: ${ACCESS_TOKEN.substring(0, 30)}...`);
  
  let foundId = null;
  let foundPhone = null;
  
  for (const id of candidates) {
    const result = await testPhoneId(id);
    if (result.success) {
      foundId = result.id;
      foundPhone = result.phone;
    }
  }
  
  console.log('\n════════════════════════════════════════════════');
  if (foundId) {
    console.log('🎉 النتيجة: تم العثور على Phone Number ID الصحيح!');
    console.log(`   Phone Number ID: ${foundId}`);
    console.log(`   رقم البوت: ${foundPhone}`);
  } else {
    console.log('⚠️  لم يتم العثور على Phone Number ID صحيح');
    console.log('   جرب نسخ الرقم من قسم "From" في صفحة API Setup');
  }
  console.log('════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
