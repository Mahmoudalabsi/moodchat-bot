#!/bin/bash
# Auto-restart watchdog for MoodChat Telegram bot
# Checks every 60s if the worker is alive; if not, restarts it.
# Designed to be launched at container boot (e.g. from ~/.bashrc or systemd).
# Survives shell exit via setsid+nohup.

LOG_FILE="/home/z/my-project/.pm2-logs/watchdog.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "=== Watchdog started (PID $$) ==="

while true; do
  # Check if the wrapper is alive
  WRAPPER_PID=$(pgrep -f "run-bot-permanent.sh" 2>/dev/null | head -1)
  WORKER_PID=$(pgrep -f "node.*worker-continuous.js" 2>/dev/null | head -1)

  if [ -z "$WRAPPER_PID" ] || [ -z "$WORKER_PID" ]; then
    log "⚠️ Wrapper=$WRAPPER_PID Worker=$WORKER_PID — restarting bot..."
    # Clean up any stale state
    pkill -f "run-bot-permanent.sh" 2>/dev/null
    pkill -f "worker-continuous.js" 2>/dev/null
    rm -f /home/z/my-project/worker-permanent.pid
    sleep 2
    # Start the bot detached
    setsid nohup bash /home/z/my-project/run-bot-permanent.sh </dev/null >>/home/z/my-project/.pm2-logs/worker-out.log 2>&1 &
    disown
    log "✅ Restart triggered, wrapper PID=$!"
    sleep 15  # give it time to come up
  fi

  sleep 60
done
