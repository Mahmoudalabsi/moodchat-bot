import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const BUSINESS_ID = '264033988099879';
const API_VERSION = 'v21.0';

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 البحث التلقائي عن Phone Number ID');
  console.log('════════════════════════════════════════════════\n');
  
  // قائمة جميع الـ apps في Business Account
  console.log('📱 [1] البحث في تطبيقات Business Account:');
  const r1 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/client_apps`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d1 = await r1.json();
  console.log(`   HTTP: ${r1.status}`);
  if (d1.data?.length > 0) {
    for (const app of d1.data) {
      console.log(`   📱 App: ${app.name} (ID: ${app.id})`);
      console.log(`      Link: ${app.link || 'غير متاح'}`);
    }
  } else {
    console.log(`   ${JSON.stringify(d1).substring(0, 200)}`);
  }
  console.log('');
  
  // قائمة جميع WhatsApp Business Accounts في Business
  console.log('🏢 [2] البحث عن WhatsApp Business Accounts:');
  const r2 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/owned_whatsapp_business_accounts`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d2 = await r2.json();
  console.log(`   HTTP: ${r2.status}`);
  if (d2.data?.length > 0) {
    for (const waba of d2.data) {
      console.log(`   📱 WABA: ${waba.name || waba.id} (ID: ${waba.id})`);
      
      // محاولة جلب الأرقام من WABA
      console.log(`      📞 البحث عن الأرقام...`);
      const phonesRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${waba.id}/phone_numbers`,
        { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
      );
      const phonesData = await phonesRes.json();
      console.log(`      HTTP: ${phonesRes.status}`);
      if (phonesData.data?.length > 0) {
        for (const p of phonesData.data) {
          console.log(`      ✅ 📱 ${p.display_phone_number} (ID: ${p.id})`);
        }
      } else {
        console.log(`      ❌ ${JSON.stringify(phonesData).substring(0, 200)}`);
      }
    }
  } else {
    console.log(`   ${JSON.stringify(d2).substring(0, 200)}`);
  }
  console.log('');
  
  // قائمة messaging_products
  console.log('📋 [3] جميع الـ WhatsApp Business Accounts (alternative):');
  const r3 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}?fields=name`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d3 = await r3.json();
  console.log(`   HTTP: ${r3.status}`);
  console.log(`   Business Name: ${d3.name}`);
  console.log('');
  
  // جرب إرسال test message باستخدام App ID كـ recipient
  console.log('🧪 [4] محاولة استخدام /messages endpoint:');
  // استخدام البحث العكسي: GET /v21.0/whatsapp_business_account?fields=phone_numbers
  const r4 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/whatsapp_business_account?access_token=${ACCESS_TOKEN}`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d4 = await r4.json();
  console.log(`   HTTP: ${r4.status}`);
  console.log(`   ${JSON.stringify(d4).substring(0, 200)}`);
  
  console.log('\n════════════════════════════════════════════════');
  console.log('📋 الخلاصة:');
  console.log('  تحتاج للحصول على Phone Number ID من:');
  console.log('  developers.facebook.com → تطبيقك → WhatsApp → API Setup');
  console.log('  في قسم "From" ستجد: Phone number ID (16-20 رقم)');
  console.log('════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
