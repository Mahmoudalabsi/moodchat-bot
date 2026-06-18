#!/bin/bash
# MoodChat Worker Watchdog
#
# Runs in the background and ensures the moodchat-worker is always alive.
# If PM2 itself died or the worker is stuck in 'errored'/'stopped' state,
# this script will restart it.
#
# Usage:
#   nohup ./scripts/worker-watchdog.sh >> /home/z/my-project/.pm2-logs/watchdog.log 2>&1 &
#
# Or add to ~/.bashrc to auto-start:
#   pgrep -f "worker-watchdog" >/dev/null || nohup /home/z/my-project/scripts/worker-watchdog.sh >> /home/z/my-project/.pm2-logs/watchdog.log 2>&1 &

PROJECT_DIR="/home/z/my-project"
PM2_BIN="${PM2_BIN:-$(command -v pm2 || echo /home/z/.npm-global/bin/pm2)}"
CHECK_INTERVAL=30   # seconds between checks
MAX_LOG_LINES=200   # trim log when it gets too big

LOG_FILE="/home/z/my-project/.pm2-logs/watchdog.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE"
}

log "=== MoodChat Watchdog started (PID $$, interval=${CHECK_INTERVAL}s) ==="

while true; do
  # 1. Check if PM2 daemon is running
  if ! "$PM2_BIN" jlist >/dev/null 2>&1; then
    log "⚠️ PM2 daemon not responding, starting it..."
    "$PM2_BIN" resurrect >> "$LOG_FILE" 2>&1
    sleep 5
    continue
  fi

  # 2. Get moodchat-worker status
  STATUS=$( "$PM2_BIN" jlist 2>/dev/null | python3 -c "
import json, sys
try:
  procs = json.load(sys.stdin)
  for p in procs:
    if p.get('name') == 'moodchat-worker':
      env = p.get('pm2_env', {})
      print(f\"{env.get('status','?')}|{env.get('restart_time',0)}|{p.get('pid',0)}\")
      break
  else:
    print('not_found|0|0')
except Exception as e:
  print(f'error|0|0')
" 2>/dev/null)

  STATE=$(echo "$STATUS" | cut -d'|' -f1)
  RESTARTS=$(echo "$STATUS" | cut -d'|' -f2)
  PID=$(echo "$STATUS" | cut -d'|' -f3)

  case "$STATE" in
    online)
      # Healthy - just log every ~10 min (20 cycles)
      [ $((RANDOM % 20)) -eq 0 ] && log "✅ moodchat-worker healthy (pid=$PID, restarts=$RESTARTS)"
      ;;
    errored|stopped)
      log "❌ moodchat-worker state=$STATE — restarting from ecosystem.config.js"
      "$PM2_BIN" delete moodchat-worker >/dev/null 2>&1
      sleep 2
      cd "$PROJECT_DIR" && "$PM2_BIN" start ecosystem.config.js >> "$LOG_FILE" 2>&1
      sleep 5
      ;;
    not_found)
      log "⚠️ moodchat-worker not in PM2 — starting from ecosystem.config.js"
      cd "$PROJECT_DIR" && "$PM2_BIN" start ecosystem.config.js >> "$LOG_FILE" 2>&1
      sleep 5
      ;;
    error)
      log "❌ Could not query PM2 — will retry in ${CHECK_INTERVAL}s"
      ;;
    *)
      log "❓ Unknown state: $STATE — will retry in ${CHECK_INTERVAL}s"
      ;;
  esac

  # Trim log if too long
  if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt $MAX_LOG_LINES ]; then
    tail -n $((MAX_LOG_LINES / 2)) "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi

  sleep $CHECK_INTERVAL
done
