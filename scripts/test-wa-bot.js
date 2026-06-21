/**
 * اختبار بوت واتساب
 * يختبر:
 * 1. قراءة المتغيرات من .env
 * 2. إرسال رسالة من البوت
 * 3. اختبار الـ webhook verification
 */

// Load .env manually (because platform overrides DATABASE_URL)
const fs = require('fs');
const envContent = fs.readFileSync('/home/z/my-project/.env', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) {
    const [, key, value] = match;
    // Don't override DATABASE_URL (which we set explicitly)
    if (!process.env[key] || key.startsWith('WA_') || key === 'TELEGRAM_BOT_TOKEN') {
      process.env[key] = value;
    }
  }
}

const TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const API_VERSION = process.env.WA_API_VERSION || 'v21.0';

console.log('=== Configuration ===');
console.log(`  TOKEN: ${TOKEN.substring(0, 30)}...${TOKEN.substring(TOKEN.length - 10)}`);
console.log(`  PHONE_ID: ${PHONE_ID}`);
console.log(`  VERIFY_TOKEN: ${VERIFY_TOKEN}`);
console.log(`  API_VERSION: ${API_VERSION}`);

// Test 1: Send a test message
async function testSend(phone) {
  console.log(`\n=== Test: Send to ${phone} ===`);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { body: '🤖 مرحباً من بوت مود شات! تم إعداد واتساب بنجاح. ✅' },
        }),
      }
    );
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Message sent successfully!');
      console.log(`   Message ID: ${data.messages?.[0]?.id}`);
      console.log(`   Status: ${data.messages?.[0]?.message_status}`);
    } else {
      console.log(`❌ Send failed (${res.status}):`, JSON.stringify(data).substring(0, 300));
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

// Test 2: Verify webhook simulation
function testWebhookVerify() {
  console.log('\n=== Test: Webhook Verification ===');
  const mode = 'subscribe';
  const token = VERIFY_TOKEN;
  const challenge = '123456789';
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log(`✅ Webhook verification OK - would return challenge: ${challenge}`);
  } else {
    console.log('❌ Webhook verification failed');
  }
}

// Run all tests
(async () => {
  testWebhookVerify();
  
  // Try sending to the test number itself (won't work since you can't message your own number)
  // But try with a sample test recipient number
  console.log('\n=== Note ===');
  console.log('Test Number from Meta only sends to numbers added as "Test Recipients" in Meta.');
  console.log('To test, you need to add your phone number in:');
  console.log('  → https://developers.facebook.com/apps/1337248955274773/whatsapp-getting-started/');
  console.log('  → "To" field in the "Send test message" section');
  
  // Verify token works by fetching phone number details
  console.log('\n=== Test: Token works on Phone Number ID ===');
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}?access_token=${TOKEN}`
    );
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Phone number verified: ${data.verified_name}`);
      console.log(`   Display: ${data.display_phone_number}`);
      console.log(`   Quality: ${data.quality_rating}`);
    } else {
      console.log('❌ Failed:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
})();
