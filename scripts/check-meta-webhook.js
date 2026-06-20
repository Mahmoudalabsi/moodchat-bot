// التحقق من حالة الـ Webhook على Meta وإرسال رسالة اختبار
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const WA_TOKEN = process.env.WA_TOKEN;
const WABA_ID = process.env.WA_BUSINESS_ID;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const API_VERSION = process.env.WA_API_VERSION || 'v25.0';

async function checkWebhookSubscriptions() {
  console.log('=== فحص اشتراكات الـ Webhook على Meta ===\n');
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
    );
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

async function checkPhoneNumber() {
  console.log('\n=== فحص رقم الهاتف ===\n');
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
      { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
    );
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

async function sendMessage(toPhone, message) {
  console.log(`\n=== إرسال رسالة إلى ${toPhone} ===\n`);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    console.error('Error:', e.message);
  }
}

(async () => {
  await checkWebhookSubscriptions();
  await checkPhoneNumber();
})();
