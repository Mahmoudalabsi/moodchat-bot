// Test sendVoice using Node's built-in FormData and Blob
const fs = require('fs');

async function test() {
  // Node 18+ has global FormData and Blob
  const fileBuffer = fs.readFileSync('/tmp/moodchat-bot/tts_1781766548211_0.ogg');
  const blob = new Blob([fileBuffer], { type: 'audio/ogg' });

  const form = new FormData();
  form.append('chat_id', '1429407129');
  form.append('voice', blob, 'voice.ogg');

  const res = await fetch('https://api.telegram.org/bot8401809931:AAF3-GTJlr0R58VbDHENcsMP6yNg0mOol3g/sendVoice', {
    method: 'POST',
    body: form,
  });

  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.substring(0, 500));
}

test().catch(e => console.error('Error:', e));
