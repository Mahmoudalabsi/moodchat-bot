// supervisor.js - مشرف موحّد لكل من Telegram و WhatsApp workers
// يُعيد تشغيل أي بوت إذا توقف، مع سجلات الأخطاء

const { spawn } = require('child_process');
const fs = require('fs');

const LOG_FILE = '/home/z/my-project/worker.log';
const CRASH_LOG = '/home/z/my-project/worker-crashes.log';

// متغيرات البيئة الصحيحة
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  DIRECT_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  TELEGRAM_BOT_TOKEN: '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM',
  NODE_OPTIONS: '--max-old-space-size=512',
};

const workers = [
  {
    name: 'Telegram',
    script: 'worker-continuous.js',
    crashCount: 0,
    lastCrashTime: 0,
    child: null,
  },
  {
    name: 'WhatsApp',
    script: 'scripts/wa-worker.js',
    crashCount: 0,
    lastCrashTime: 0,
    child: null,
  },
];

const MAX_CRASHES_PER_MIN = 10;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function startWorker(worker) {
  log(`🔄 [${worker.name}] Spawning ${worker.script}...`);

  const child = spawn('node', [worker.script], {
    cwd: '/home/z/my-project',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  worker.child = child;

  child.stdout.on('data', (data) => {
    const text = data.toString();
    fs.appendFileSync(LOG_FILE, `[${worker.name}] ${text}`);
    // إذا كان wa-worker، انسخ السجل أيضاً إلى /tmp/wa-worker.log
    if (worker.name === 'WhatsApp') {
      fs.appendFileSync('/tmp/wa-worker.log', text);
    }
  });
  child.stderr.on('data', (data) => {
    fs.appendFileSync(LOG_FILE, `[${worker.name}][stderr] ${data.toString()}`);
    if (worker.name === 'WhatsApp') {
      fs.appendFileSync('/tmp/wa-worker.log', `[stderr] ${data.toString()}`);
    }
  });

  child.on('exit', (code, signal) => {
    log(`⚠️ [${worker.name}] Worker exited: code=${code} signal=${signal}`);

    const now = Date.now();
    if (now - worker.lastCrashTime < 60000) {
      worker.crashCount++;
    } else {
      worker.crashCount = 1;
    }
    worker.lastCrashTime = now;

    fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] [${worker.name}] exit code=${code} signal=${signal} crash#${worker.crashCount}\n`);

    if (worker.crashCount > MAX_CRASHES_PER_MIN) {
      log(`⛔ [${worker.name}] Too many crashes (${worker.crashCount}/min). Cooling down 30s...`);
      setTimeout(() => startWorker(worker), 30000);
      worker.crashCount = 0;
      return;
    }

    log(`🔄 [${worker.name}] Restarting in 2s...`);
    setTimeout(() => startWorker(worker), 2000);
  });

  child.on('error', (err) => {
    log(`❌ [${worker.name}] Spawn error: ${err.message}`);
    setTimeout(() => startWorker(worker), 2000);
  });

  log(`✅ [${worker.name}] Worker spawned with PID ${child.pid}`);
}

// بدء جميع البوتات
log('🚀 Supervisor started - managing both Telegram and WhatsApp bots');
for (const w of workers) {
  startWorker(w);
}

// Handle SIGTERM/SIGINT gracefully
function shutdown(signal) {
  log(`📤 Supervisor received ${signal}, killing all workers...`);
  for (const w of workers) {
    if (w.child) {
      try { w.child.kill('SIGTERM'); } catch (_) {}
    }
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep alive
setInterval(() => {}, 1000);
