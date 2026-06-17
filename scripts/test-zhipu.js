// Test Zhipu AI JWT generation + chat completion
const crypto = require('crypto');

const ZHIPU_KEY = process.argv[2] || 'ba0c0421a5a2409ca7ded8f64a5504ce.wY6XGMuaApa32mCf';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const [id, secret] = ZHIPU_KEY.split('.');
console.log('API Key ID:', id);
console.log('Secret length:', secret.length);

const header = { alg: 'HS256', sign_type: 'SIGN' };
const now = Math.floor(Date.now() / 1000);
const payload = { api_key: id, exp: now + 3600, timestamp: now };

const headerB64 = base64url(JSON.stringify(header));
const payloadB64 = base64url(JSON.stringify(payload));
const data = headerB64 + '.' + payloadB64;
const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
const signatureB64 = Buffer.from(signature, 'hex').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const jwt = data + '.' + signatureB64;
console.log('JWT (first 60):', jwt.substring(0, 60) + '...');
console.log('JWT length:', jwt.length);

async function testModel(model) {
  const start = Date.now();
  try {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + jwt,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'مرحبا، رد بكلمة واحدة' }],
      }),
    });
    const text = await res.text();
    console.log(`[${model}] Status: ${res.status} | Time: ${Date.now() - start}ms`);
    console.log(`[${model}] Body: ${text.substring(0, 300)}`);
  } catch (e) {
    console.log(`[${model}] ERR: ${e.message}`);
  }
}

(async () => {
  // Try multiple known model names
  const models = [
    'glm-4-flash',
    'glm-4-flashx',
    'glm-4-air',
    'glm-4-airx',
    'glm-4-plus',
    'glm-4',
    'glm-4v-flash',
    'glm-4v',
  ];
  for (const m of models) {
    await testModel(m);
    console.log('---');
  }
})();
