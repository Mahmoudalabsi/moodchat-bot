#!/usr/bin/env node
/**
 * تشغيل بوت مود شات - وضع الاستقصاء (Polling)
 * يعمل مع Z-AI internal API (سريع وموثوق)
 */

// تحميل متغيرات البيئة
import { config } from 'dotenv';
config({ path: '/home/z/my-project/.env' });

// تشغيل البوت
import('./bot-polling.js');
