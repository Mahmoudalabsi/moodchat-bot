#!/bin/bash
# Bot watchdog - ensures the permanent bot wrapper is running
# Designed to be called periodically (e.g., from cron or another loop)
# If the wrapper isn't running, it starts it.
# This is a "second line of defense" - the wrapper itself restarts the worker
# on crash, and this script restarts the wrapper if it dies.

cd /home/z/my-project

PID_FILE="/home/z/my-project/worker-permanent.pid"
LOG_FILE="/home/z/my-project/.pm2-logs/worker-out.log"

mkdir -p "$(dirname "$LOG_FILE")"

# Check if wrapper is running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    # Check it's actually our wrapper
    if ps -p "$PID" -o cmd= 2>/dev/null | grep -q "run-bot-permanent"; then
      # Wrapper is alive, check the worker child too
      WORKER_PID=$(pgrep -f "node.*worker-continuous.js" 2>/dev/null | head -1)
      if [ -n "$WORKER_PID" ]; then
        # Both alive - all good
        exit 0
      else
        # Wrapper alive but no worker — wrapper will restart it, just wait
        exit 0
      fi
    fi
  fi
fi

# Wrapper is dead or missing — restart it
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WATCHDOG] Wrapper not running, restarting..." >> "$LOG_FILE"
rm -f "$PID_FILE"
pkill -f "node.*worker-continuous.js" 2>/dev/null
sleep 1

# Start fresh (using setsid for true detachment)
setsid nohup bash /home/z/my-project/run-bot-permanent.sh </dev/null >/dev/null 2>&1 &
disown

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WATCHDOG] Restart triggered" >> "$LOG_FILE"
