#!/bin/bash
# MoodChat AI Worker - Robust auto-restart wrapper
cd /home/z/my-project

# Load .env safely
set -a
. ./.env
set +a

LOG=/home/z/my-project/worker-cron.log
PIDFILE=/home/z/my-project/worker-cron.pid

echo $$ > "$PIDFILE"
echo "[$(date)] === Worker started (PID $$, DATABASE_URL=${DATABASE_URL:0:50}) ===" >> "$LOG"

while true; do
  # Check if already running (avoid duplicates)
  if pgrep -f "node.*process-pending.js" > /dev/null 2>&1; then
    sleep 2
    continue
  fi
  
  echo "[$(date)] Running process-pending.js..." >> "$LOG"
  node process-pending.js >> "$LOG" 2>&1
  EXIT=$?
  
  if [ $EXIT -ne 0 ]; then
    echo "[$(date)] Exited with code $EXIT, waiting 3s before retry" >> "$LOG"
    sleep 3
  else
    sleep 2
  fi
done
