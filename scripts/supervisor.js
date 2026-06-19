/**
 * Supervisor for worker-continuous.js — restarts on crash with backoff.
 * Logs to /home/z/my-project/worker.log
 */
const { spawn } = require('child_process');
const fs = require('fs');

const WORKER = '/home/z/my-project/worker-continuous.js';
const LOG = '/home/z/my-project/worker.log';
const MAX_BACKOFF = 30000; // 30s max backoff
const MIN_BACKOFF = 1000;

function ts() { return new Date().toISOString(); }

function log(line) {
  const out = `[${ts()}] ${line}`;
  console.log(out);
  try { fs.appendFileSync(LOG, out + '\n'); } catch (_) {}
}

let crashCount = 0;
let lastStart = 0;

function spawnWorker() {
  log('🔄 [Telegram] Spawning worker-continuous.js...');
  lastStart = Date.now();
  const child = spawn('node', [WORKER], {
    cwd: '/home/z/my-project',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', d => {
    const lines = d.toString().split('\n').filter(Boolean);
    for (const l of lines) {
      try { fs.appendFileSync(LOG, l + '\n'); } catch (_) {}
      console.log(l);
    }
  });
  child.stderr.on('data', d => {
    const lines = d.toString().split('\n').filter(Boolean);
    for (const l of lines) {
      try { fs.appendFileSync(LOG, '[stderr] ' + l + '\n'); } catch (_) {}
      console.error('[stderr]', l);
    }
  });

  child.on('exit', (code, signal) => {
    const uptime = Date.now() - lastStart;
    log(`⚠️ [Telegram] Worker exited: code=${code} signal=${signal} (uptime ${(uptime/1000).toFixed(0)}s)`);
    if (uptime > 60000) {
      // Long-lived run — reset crash count
      crashCount = 0;
    } else {
      crashCount++;
    }
    const backoff = Math.min(MIN_BACKOFF * Math.pow(2, Math.min(crashCount, 5)), MAX_BACKOFF);
    log(`🔄 [Telegram] Restarting in ${(backoff/1000).toFixed(1)}s... (crash count: ${crashCount})`);
    setTimeout(spawnWorker, backoff);
  });

  child.on('error', err => {
    log(`❌ [Telegram] Spawn error: ${err.message}`);
    setTimeout(spawnWorker, 5000);
  });

  log(`✅ [Telegram] Worker spawned with PID ${child.pid}`);
  return child;
}

// Handle SIGTERM/SIGINT to forward to child
let currentChild = null;
process.on('SIGTERM', () => {
  log('Supervisor received SIGTERM, forwarding to worker...');
  if (currentChild) currentChild.kill('SIGTERM');
  setTimeout(() => process.exit(0), 2000);
});
process.on('SIGINT', () => {
  log('Supervisor received SIGINT, forwarding to worker...');
  if (currentChild) currentChild.kill('SIGINT');
  setTimeout(() => process.exit(0), 2000);
});

log('🚀 [Telegram] Supervisor started — managing worker-continuous.js');
currentChild = spawnWorker();
