#!/bin/bash
# Permanent bot runner with auto-restart
# Survives shell exit via nohup, survives crashes via infinite loop
# Usage: bash /home/z/my-project/run-bot-permanent.sh

cd /home/z/my-project

# === Environment ===
export DATABASE_URL="postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
export TELEGRAM_BOT_TOKEN="8643651729:AAGnHfMAE73I1AJqdPsmpRtyeA4tw4oM_l8"
export ADMIN_IDS="1429407129"
export ZAI_BASE_URL="https://internal-api.z.ai/v1"
export ZAI_API_KEY="Z.ai"
export ZAI_CHAT_ID="chat-c2ae3234-5685-4053-8998-96e9a664f658"
export ZAI_USER_ID="014c4da7-4f7f-4efa-9157-9091a73a3570"
export ZAI_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0"
export NODE_OPTIONS="--max-old-space-size=512"

LOG_FILE="/home/z/my-project/.pm2-logs/worker-out.log"
PID_FILE="/home/z/my-project/worker-permanent.pid"
mkdir -p "$(dirname "$LOG_FILE")"

# === Prevent duplicate instances ===
if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
  OLD_PID=$(cat $PID_FILE)
  # Check if it's actually our wrapper (not some reused PID)
  if ps -p "$OLD_PID" -o cmd= 2>/dev/null | grep -q "run-bot-permanent"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Permanent wrapper already running (PID $OLD_PID), exiting" >> "$LOG_FILE"
    exit 0
  fi
fi

# Save our PID
echo $$ > "$PID_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Permanent bot wrapper started (PID $$) ===" >> "$LOG_FILE"

# === Infinite restart loop ===
RESTART_COUNT=0
LAST_RESTART=0

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_RESTART))
  
  # If the worker ran for > 30s before crashing, reset the counter
  if [ $ELAPSED -gt 30 ]; then
    RESTART_COUNT=0
  fi
  
  # Backoff on rapid crashes (avoid burning resources)
  if [ $RESTART_COUNT -ge 3 ]; then
    BACKOFF=$((RESTART_COUNT * 10))
    if [ $BACKOFF -gt 120 ]; then BACKOFF=120; fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ Rapid crash detected (#$RESTART_COUNT), backing off ${BACKOFF}s..." >> "$LOG_FILE"
    sleep $BACKOFF
  fi
  
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting worker (attempt #$((RESTART_COUNT + 1)))..." >> "$LOG_FILE"
  LAST_RESTART=$NOW
  
  node /home/z/my-project/worker-continuous.js >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  
  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Worker exited with code $EXIT_CODE, restarting in 3s..." >> "$LOG_FILE"
  sleep 3
done
