// التحقق من حالة الـ Webhook على Meta وإرسال رسالة اختبار
const WA_TOKEN = 'EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb';
const WABA_ID = '995700279847597';
const PHONE_NUMBER_ID = '1180359958489968';
const API_VERSION = 'v21.0';

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
