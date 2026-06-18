import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const BUSINESS_ID = '264033988099879';
const API_VERSION = 'v21.0';

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 البحث عن رقم البوت عبر WhatsApp Business API');
  console.log('════════════════════════════════════════════════\n');
  
  // محاولة 1: GET phone_number مباشرة بدون fields
  console.log('📱 [محاولة 1] جلب رقم البوت مباشرة:');
  const r1 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d1 = await r1.json();
  console.log(`   HTTP: ${r1.status}`);
  console.log(`   Response: ${JSON.stringify(d1).substring(0, 300)}`);
  console.log('');
  
  // محاولة 2: استخدام messaging_product endpoint
  console.log('📱 [محاولة 2] WhatsApp Business Account مع phone_numbers:');
  const r2 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}?fields=whatsapp_business_account`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d2 = await r2.json();
  console.log(`   HTTP: ${r2.status}`);
  console.log(`   Response: ${JSON.stringify(d2).substring(0, 300)}`);
  console.log('');
  
  // محاولة 3: business_accounts/{id}/owned_whatsapp_business_accounts
  console.log('🏢 [محاولة 3] WhatsApp Business Accounts داخل Business:');
  const r3 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/owned_whatsapp_business_accounts`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d3 = await r3.json();
  console.log(`   HTTP: ${r3.status}`);
  if (d3.data?.length > 0) {
    for (const waba of d3.data) {
      console.log(`   WABA ID: ${waba.id}, Name: ${waba.name || 'غير متاح'}`);
      
      // جلب الأرقام من WABA
      const phonesRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${waba.id}/phone_numbers`,
        { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
      );
      const phonesData = await phonesRes.json();
      console.log(`   📞 الأرقام:`);
      if (phonesData.data?.length > 0) {
        for (const p of phonesData.data) {
          console.log(`      📱 ${p.display_phone_number} (ID: ${p.id})`);
        }
      } else {
        console.log(`      ${JSON.stringify(phonesData).substring(0, 200)}`);
      }
    }
  } else {
    console.log(`   ${JSON.stringify(d3).substring(0, 200)}`);
  }
  console.log('');
  
  // محاولة 4: إرسال رسالة لاختبار Test Number
  console.log('📨 [محاولة 4] محاولة إرسال رسالة اختبار للرقم التجريبي...');
  console.log('   (نحتاج رقم المستلم - لن يتم الإرسال بدون رقم)');
  console.log('');
  
  console.log('════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
