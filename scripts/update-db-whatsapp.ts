/**
 * تحديث قاعدة البيانات ببيانات WhatsApp Cloud API
 * لكي تظهر الحالة في الـ Dashboard
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
    },
  },
});

async function main() {
  console.log('📝 تحديث قاعدة البيانات بإعدادات WhatsApp Cloud API...\n');
  
  const config = {
    wa_cloud_ready: 'true',
    wa_cloud_phone_number_id: '1180359958489968',
    wa_cloud_display_phone: '+1 555-673-9898',
    wa_cloud_verify_token: 'MOOD_BOT_2026_WA',
    wa_cloud_api_version: 'v21.0',
    wa_cloud_configured_at: new Date().toISOString(),
    wa_cloud_business_id: '264033988099879',
    wa_cloud_waba_id: '995700279847597',
    // إيقاف بوت Baileys
    wa_bot_ready: 'false',
    wa_qr_code: '',
  };
  
  for (const [key, value] of Object.entries(config)) {
    await db.botConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    console.log(`  ✅ ${key}`);
  }
  
  console.log('\n✨ تم تحديث قاعدة البيانات بنجاح!');
  
  // عرض الإحصائيات
  const totalUsers = await db.telegramUser.count();
  const totalMessages = await db.message.count();
  console.log(`\n📊 الإحصائيات الحالية:`);
  console.log(`  المستخدمين: ${totalUsers}`);
  console.log(`  الرسائل: ${totalMessages}`);
  
  await db.$disconnect();
}

main().catch(err => {
  console.error('❌ خطأ:', err);
  process.exit(1);
});
