// Debug sendVoice from Node
const FormData = require('form-data');
const fs = require('fs');

async function test() {
  const form = new FormData();
  form.append('chat_id', '1429407129');
  form.append('voice', fs.createReadStream('/tmp/moodchat-bot/tts_1781766548211_0.ogg'));

  console.log('Headers:', form.getHeaders());

  const res = await fetch('https://api.telegram.org/bot8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM/sendVoice', {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
  });

  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.substring(0, 500));
}

test().catch(e => console.error('Error:', e));
