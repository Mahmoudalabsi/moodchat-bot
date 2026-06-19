#!/bin/bash
# Auto-restart watchdog for Evolution API
# Checks every 60s if the server is alive; if not, restarts it.

LOG_FILE="/home/z/my-project/.pm2-logs/evo-watchdog.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "=== Evolution API Watchdog started (PID $$) ==="

while true; do
  # Primary check: HTTP health endpoint
  if curl -sf http://localhost:8084/ >/dev/null 2>&1; then
    : # healthy
  else
    log "⚠️ Evolution API not responding on :8084 — restarting..."
    # Kill any stale tsx/npx processes for evolution-api
    pkill -f "evolution-api/src/main.ts" 2>/dev/null
    pkill -f "evolution-api.*tsx" 2>/dev/null
    pkill -f "npm exec tsx.*evolution-api" 2>/dev/null
    sleep 3
    cd /home/z/my-project/evolution-api
    setsid nohup npx tsx ./src/main.ts </dev/null >>/home/z/my-project/.pm2-logs/evolution-api.log 2>&1 &
    disown
    log "✅ Restart triggered, PID=$!"
    sleep 15
  fi

  sleep 60
done
