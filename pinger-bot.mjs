#!/usr/bin/env node
/**
 * Universal Cron Pinger (pinger-bot.mjs)
 * =======================================
 * يعمل بشكل دائم على هذا الخادم، ويستدعي Vercel endpoints
 * لمعالجة الرسائل المعلقة كل 10 ثوانٍ.
 *
 * يعمل كبديل لـ VPS worker.mjs (الذي يتوقف):
 *  - يستدعي /api/process-tg-messages كل 10 ثوانٍ → يعالج رسائل تيليجرام
 *  - يستدعي /api/process-wa-messages كل 10 ثوانٍ → يعالج رسائل واتساب
 *  - لا يحتاج DATABASE_URL (يعمل عبر Vercel API فقط)
 *  - لا يلمس أي كود تيليجرام (يستدعي endpoint آمن)
 *  - يُعيد المحاولة تلقائياً عند الفشل
 *  - يسجل نبضات حياة في worklog
 *
 * التشغيل: node pinger-bot.mjs  (أو: bun pinger-bot.mjs)
 * يعمل بشكل دائم — استخدم Ctrl+C لإيقافه.
 */

const VERCEL_URL = process.env.VERCEL_URL || 'https://my-project-green-ten.vercel.app';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10); // 10s
const ENDPOINTS = [
  { name: 'telegram', path: '/api/process-tg-messages' },
  { name: 'whatsapp', path: '/api/process-wa-messages' },
];

let stats = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  messagesProcessed: 0,
  startTime: Date.now(),
  lastSuccess: null,
  lastError: null,
};

async function pingEndpoint(endpoint) {
  const url = `${VERCEL_URL}${endpoint.path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s (under Vercel 60s limit)

  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MoodChat-Pinger/1.0',
      },
      body: JSON.stringify({ source: 'pinger-bot', timestamp: start }),
      signal: controller.signal,
    });

    const durationMs = Date.now() - start;
    stats.totalCalls++;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
    }

    const data = await res.json().catch(() => ({}));
    stats.successfulCalls++;
    stats.lastSuccess = new Date().toISOString();

    const processed = data?.processed || 0;
    if (processed > 0) {
      stats.messagesProcessed += processed;
      console.log(`[${new Date().toISOString()}] ✅ ${endpoint.name}: processed=${processed} ok=${data.successful} failed=${data.failed} duration=${data.duration_ms || durationMs}ms`);
    } else {
      // Quiet log (no pending messages) — only every 60s
      if (stats.totalCalls % 12 === 0) {
        console.log(`[${new Date().toISOString()}] 💤 ${endpoint.name}: no pending messages (duration=${durationMs}ms)`);
      }
    }
    return data;
  } catch (err) {
    stats.failedCalls++;
    stats.lastError = `${err.message} (${endpoint.name})`;
    console.error(`[${new Date().toISOString()}] ❌ ${endpoint.name} ping failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tick() {
  // Run both endpoints in parallel
  await Promise.allSettled(ENDPOINTS.map(ep => pingEndpoint(ep)));
}

// Health check pinger (every 5 min, prints stats)
function printStats() {
  const uptimeSec = Math.floor((Date.now() - stats.startTime) / 1000);
  const uptimeMin = Math.floor(uptimeSec / 60);
  const uptimeHr = Math.floor(uptimeMin / 60);
  console.log('\n=== Pinger Stats ===');
  console.log(`  Uptime: ${uptimeHr}h ${uptimeMin % 60}m ${uptimeSec % 60}s`);
  console.log(`  Total API calls: ${stats.totalCalls}`);
  console.log(`  Successful: ${stats.successfulCalls}  |  Failed: ${stats.failedCalls}`);
  console.log(`  Messages processed: ${stats.messagesProcessed}`);
  console.log(`  Last success: ${stats.lastSuccess || 'never'}`);
  console.log(`  Last error: ${stats.lastError || 'none'}`);
  console.log(`  Target URL: ${VERCEL_URL}`);
  console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log('===================\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Pinger stopping gracefully...');
  printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Pinger received SIGTERM...');
  printStats();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Pinger] Uncaught exception:', err.message);
  // Don't exit — keep running
});

process.on('unhandledRejection', (err) => {
  console.error('[Pinger] Unhandled rejection:', err?.message || err);
});

console.log('🚀 MoodChat Pinger Bot starting...');
console.log(`📡 Target: ${VERCEL_URL}`);
console.log(`⏱️  Poll interval: ${POLL_INTERVAL_MS}ms (${POLL_INTERVAL_MS/1000}s)`);
console.log(`🎯 Endpoints: ${ENDPOINTS.map(e => e.path).join(', ')}`);
console.log('💚 Pinger will run forever. Press Ctrl+C to stop.\n');

// Start polling
setInterval(tick, POLL_INTERVAL_MS);
setInterval(printStats, 5 * 60 * 1000); // Stats every 5 minutes

// Initial tick immediately
tick();
printStats();
