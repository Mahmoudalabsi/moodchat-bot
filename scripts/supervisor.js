// supervisor.js - Reliable supervisor for worker-continuous.js
// Restarts the worker if it crashes, with crash logging

const { spawn } = require('child_process');
const fs = require('fs');

const LOG_FILE = '/home/z/my-project/worker.log';
const CRASH_LOG = '/home/z/my-project/worker-crashes.log';

// Correct env vars (override platform's wrong DATABASE_URL)
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  DIRECT_URL: 'postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  TELEGRAM_BOT_TOKEN: '8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM',
  NODE_OPTIONS: '--max-old-space-size=512',
};

let crashCount = 0;
let lastCrashTime = 0;
const MAX_CRASHES_PER_MIN = 10;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function startWorker() {
  log('🔄 Spawning worker-continuous.js...');
  
  const child = spawn('node', ['worker-continuous.js'], {
    cwd: '/home/z/my-project',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Pipe stdout/stderr to log
  child.stdout.on('data', (data) => {
    fs.appendFileSync(LOG_FILE, data.toString());
  });
  child.stderr.on('data', (data) => {
    fs.appendFileSync(LOG_FILE, `[stderr] ${data.toString()}`);
  });

  child.on('exit', (code, signal) => {
    log(`⚠️ Worker exited: code=${code} signal=${signal}`);
    
    // Record crash
    const now = Date.now();
    if (now - lastCrashTime < 60000) {
      crashCount++;
    } else {
      crashCount = 1;
    }
    lastCrashTime = now;
    
    fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] exit code=${code} signal=${signal} crash#${crashCount}\n`);
    
    // Prevent crash loop
    if (crashCount > MAX_CRASHES_PER_MIN) {
      log(`⛔ Too many crashes (${crashCount}/min). Cooling down 30s...`);
      setTimeout(startWorker, 30000);
      crashCount = 0;
      return;
    }
    
    // Restart after short delay
    log(`🔄 Restarting in 2s...`);
    setTimeout(startWorker, 2000);
  });

  child.on('error', (err) => {
    log(`❌ Spawn error: ${err.message}`);
    setTimeout(startWorker, 2000);
  });

  log(`✅ Worker spawned with PID ${child.pid}`);
  
  // Handle SIGTERM/SIGINT gracefully
  process.on('SIGTERM', () => {
    log('📤 Supervisor received SIGTERM, killing worker...');
    child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  });
  process.on('SIGINT', () => {
    log('📤 Supervisor received SIGINT, killing worker...');
    child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  });
}

log('🚀 Supervisor started');
startWorker();

// Keep alive
setInterval(() => {}, 1000);
