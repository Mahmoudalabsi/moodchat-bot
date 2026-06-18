const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const userId = 1429407129;
  // Test /tts with WAV
  await db.message.create({
    data: { userId, role: 'user', content: 'tts:مرحبا بك في بوت مود شات، صباح الخير', modelUsed: 'bot-tts', status: 'pending', chatId: userId }
  });
  console.log('✅ Created TTS test message');

  // Test /read with real article
  await db.message.create({
    data: { userId, role: 'user', content: 'read:https://en.wikipedia.org/wiki/Artificial_intelligence', modelUsed: 'bot-read', status: 'pending', chatId: userId }
  });
  console.log('✅ Created read test message (Wikipedia)');

  // Test /draw
  await db.message.create({
    data: { userId, role: 'user', content: 'draw:قطة كرتونية لطيفة', modelUsed: 'bot-draw', status: 'pending', chatId: userId }
  });
  console.log('✅ Created draw test message');

  // Test auto URL detection (regular moodchat message with URL)
  await db.message.create({
    data: { userId, role: 'user', content: 'ما هذا الموقع؟ https://news.ycombinator.com', modelUsed: 'moodchat', status: 'pending', chatId: userId }
  });
  console.log('✅ Created auto-URL test message');

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
