import 'dotenv/config';

const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const BUSINESS_ID = '264033988099879';
const API_VERSION = 'v21.0';

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  🔍 فحص بيانات Meta Cloud API');
  console.log('════════════════════════════════════════════════\n');
  
  // 1. معلومات رقم البوت
  console.log('📱 [1] معلومات رقم البوت (Phone Number ID):');
  const phoneRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,status,account,name`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const phoneData = await phoneRes.json();
  console.log(`   HTTP: ${phoneRes.status}`);
  console.log(`   📞 Display: ${phoneData.display_phone_number || 'غير متاح'}`);
  console.log(`   ✅ Verified: ${phoneData.verified_name || 'غير متحقق'}`);
  console.log(`   💬 Quality: ${phoneData.quality_rating || 'غير متاح'}`);
  console.log(`   📋 Status: ${phoneData.status || 'غير متاح'}`);
  console.log(`   🆔 Account ID: ${phoneData.account?.id || 'غير متاح'}\n`);
  
  // 2. معلومات حساب WhatsApp Business
  const wabaId = phoneData.account?.id || BUSINESS_ID;
  console.log(`🏢 [2] معلومات WhatsApp Business Account (${wabaId}):`);
  const wabaRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${wabaId}`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const wabaData = await wabaRes.json();
  console.log(`   HTTP: ${wabaRes.status}`);
  console.log(`   📛 Name: ${wabaData.name || 'غير متاح'}`);
  console.log(`   📊 Currency: ${wabaData.currency || 'غير متاح'}`);
  console.log(`   🌍 Country: ${wabaData.country || 'غير متاح'}`);
  
  // 3. قائمة أرقام الهواتف المرتبطة
  console.log('\n📞 [3] قائمة الأرقام المرتبطة بالحساب:');
  const phonesRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${wabaId}/phone_numbers`,
    { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
  );
  const phonesData = await phonesRes.json();
  if (phonesData.data?.length > 0) {
    for (const p of phonesData.data) {
      console.log(`   📱 ${p.display_phone_number} (ID: ${p.id}, Verified: ${p.verified_name || 'لا'})`);
    }
  } else {
    console.log('   لا توجد أرقام إضافية');
    console.log('   Raw:', JSON.stringify(phonesData).substring(0, 300));
  }
  
  console.log('\n════════════════════════════════════════════════');
}

main().catch(err => console.error('Error:', err.message));
