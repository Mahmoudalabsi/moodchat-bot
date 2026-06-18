import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const BUSINESS_ID = '264033988099879';
const APP_ID = '1337248955274773';
const API_VERSION = 'v21.0';

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 فحص الـ Token الجديد والبحث عن Phone Number ID');
  console.log('════════════════════════════════════════════════\n');
  console.log(`Token (أول 30): ${ACCESS_TOKEN.substring(0, 30)}...`);
  console.log('');

  // 1. فحص صلاحيات الـ Token
  console.log('🔐 [1] فحص صلاحيات الـ Token:');
  const r1 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/me?fields=id,name,permissions`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d1 = await r1.json();
  console.log(`   HTTP: ${r1.status}`);
  console.log(`   Name: ${d1.name || 'غير متاح'}`);
  console.log(`   ID: ${d1.id || 'غير متاح'}`);
  if (d1.permissions?.data) {
    console.log(`   📋 الصلاحيات:`);
    for (const p of d1.permissions.data) {
      console.log(`      ${p.status === 'granted' ? '✅' : '❌'} ${p.permission}`);
    }
  }
  console.log('');

  // 2. فحص الـ Business Account
  console.log('🏢 [2] معلومات Business Account:');
  const r2 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}?fields=name,whatsapp_business_accounts`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d2 = await r2.json();
  console.log(`   HTTP: ${r2.status}`);
  console.log(`   Name: ${d2.name || 'غير متاح'}`);
  console.log('');

  // 3. البحث عن WhatsApp Business Accounts عبر owned_whatsapp_business_accounts
  console.log('📱 [3] WhatsApp Business Accounts:');
  const r3 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${BUSINESS_ID}/owned_whatsapp_business_accounts`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d3 = await r3.json();
  console.log(`   HTTP: ${r3.status}`);
  
  if (d3.data?.length > 0) {
    for (const waba of d3.data) {
      console.log(`   ✅ WABA ID: ${waba.id}, Name: ${waba.name || 'غير متاح'}`);
      
      // جلب الأرقام من WABA
      console.log(`      📞 البحث عن الأرقام...`);
      const phonesRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${waba.id}/phone_numbers`,
        { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
      );
      const phonesData = await phonesRes.json();
      console.log(`      HTTP: ${phonesRes.status}`);
      if (phonesData.data?.length > 0) {
        console.log(`      🎉 تم العثور على الأرقام!`);
        for (const p of phonesData.data) {
          console.log(`      📱 ${p.display_phone_number} (ID: ${p.id})`);
          console.log(`         Verified: ${p.verified_name || 'لا'}`);
          console.log(`         Quality: ${p.quality_rating || 'غير متاح'}`);
        }
      } else {
        console.log(`      ❌ ${JSON.stringify(phonesData).substring(0, 200)}`);
      }
    }
  } else {
    console.log(`   ❌ ${JSON.stringify(d3).substring(0, 300)}`);
  }
  console.log('');

  // 4. فحص الـ App مباشرة
  console.log('📲 [4] معلومات التطبيق:');
  const r4 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d4 = await r4.json();
  console.log(`   HTTP: ${r4.status}`);
  console.log(`   App Name: ${d4.name || 'غير متاح'}`);
  console.log(`   App ID: ${d4.id || 'غير متاح'}`);
  console.log('');

  // 5. البحث عن WhatsApp Business Account عبر /whatsapp_business_account
  console.log('🔍 [5] محاولة بديلة - WhatsApp Business Account عبر App:');
  const r5 = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/whatsapp_business_account`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const d5 = await r5.json();
  console.log(`   HTTP: ${r5.status}`);
  if (r5.ok && d5.id) {
    console.log(`   ✅ WABA ID: ${d5.id}`);
    console.log(`   Name: ${d5.name || 'غير متاح'}`);
    
    // جلب الأرقام من WABA المباشر
    console.log(`   📞 البحث عن الأرقام من WABA ${d5.id}...`);
    const phonesRes2 = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${d5.id}/phone_numbers`,
      { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
    );
    const phonesData2 = await phonesRes2.json();
    console.log(`   HTTP: ${phonesRes2.status}`);
    if (phonesData2.data?.length > 0) {
      console.log(`   🎉 تم العثور على الأرقام!`);
      for (const p of phonesData2.data) {
        console.log(`   📱 ${p.display_phone_number} (ID: ${p.id})`);
      }
    } else {
      console.log(`   ❌ ${JSON.stringify(phonesData2).substring(0, 200)}`);
    }
  } else {
    console.log(`   ❌ ${JSON.stringify(d5).substring(0, 300)}`);
  }

  console.log('\n════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
