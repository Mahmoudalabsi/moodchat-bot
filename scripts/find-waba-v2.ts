import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const BUSINESS_ID = '264033988099879';
const APP_ID = '1337248955274773';
const API_VERSION = 'v21.0';

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 البحث عن رقم البوت بطرق متعددة');
  console.log('════════════════════════════════════════════════\n');

  // محاولة 1: استخدام whatsapp_business_management لجلب WABA via App
  console.log('🎯 [محاولة 1] جلب WABA عبر /apps/{id}/whatsapp_business_management:');
  const r1 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/whatsapp_business_management`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d1 = await r1.json();
  console.log(`   HTTP: ${r1.status}`);
  console.log(`   ${JSON.stringify(d1).substring(0, 300)}`);
  console.log('');

  // محاولة 2: جلب كل الـ subscriptions للـ App
  console.log('🎯 [محاولة 2] جلب subscriptions للتطبيق:');
  const r2 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/subscriptions`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d2 = await r2.json();
  console.log(`   HTTP: ${r2.status}`);
  console.log(`   ${JSON.stringify(d2).substring(0, 300)}`);
  console.log('');

  // محاولة 3: استخدام /me/accounts لجلب كل الصفحات/الأعمال المرتبطة
  console.log('🎯 [محاولة 3] /me/accounts:');
  const r3 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/me/accounts`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d3 = await r3.json();
  console.log(`   HTTP: ${r3.status}`);
  console.log(`   ${JSON.stringify(d3).substring(0, 500)}`);
  console.log('');

  // محاولة 4: استخدام /me/businesses
  console.log('🎯 [محاولة 4] /me/businesses:');
  const r4 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/me/businesses`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d4 = await r4.json();
  console.log(`   HTTP: ${r4.status}`);
  console.log(`   ${JSON.stringify(d4).substring(0, 500)}`);
  console.log('');

  // محاولة 5: استخدام /{business_id}/whatsapp_business_account
  console.log('🎯 [محاولة 5] /{business_id}/whatsapp_business_account:');
  const r5 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/whatsapp_business_account`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d5 = await r5.json();
  console.log(`   HTTP: ${r5.status}`);
  console.log(`   ${JSON.stringify(d5).substring(0, 300)}`);
  console.log('');

  // محاولة 6: استرجاع رقم البوت عبر /whatsapp_business_account/{waba_id}/phone_numbers
  // نحتاج WABA ID. نجرب مباشرة بـ BUSINESS_ID
  console.log('🎯 [محاولة 6] /{business_id}/phone_numbers:');
  const r6 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/phone_numbers`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d6 = await r6.json();
  console.log(`   HTTP: ${r6.status}`);
  console.log(`   ${JSON.stringify(d6).substring(0, 300)}`);
  console.log('');

  // محاولة 7: الإرسال لرقم تجريبي محتمل (1-628-xxx)
  // في Test Mode, Meta توفر رقم تجريبي ثابت: 16505551234 (للبوت فقط)
  // لكن نحتاج Phone Number ID. نجرب بـ Business ID كـ Phone Number ID
  console.log('🎯 [محاولة 7] استخدام BUSINESS_ID كـ Phone Number ID:');
  const testPayload = {
    messaging_product: 'whatsapp',
    to: '1', // رقم وهمي - فقط لرؤية رد الـ API
    type: 'text',
    text: { body: 'test' },
  };
  const r7 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    }
  );
  const d7 = await r7.json();
  console.log(`   HTTP: ${r7.status}`);
  console.log(`   ${JSON.stringify(d7).substring(0, 400)}`);
  console.log('');

  // محاولة 8: same but with APP_ID as Phone Number ID
  console.log('🎯 [محاولة 8] استخدام APP_ID كـ Phone Number ID:');
  const r8 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    }
  );
  const d8 = await r8.json();
  console.log(`   HTTP: ${r8.status}`);
  console.log(`   ${JSON.stringify(d8).substring(0, 400)}`);
  console.log('');

  console.log('════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
