#!/bin/bash
# Auto-restart wrapper for worker - survives shell session exit via nohup
# Usage: nohup ./worker-persistent.sh &> /dev/null & disown

cd /home/z/my-project
export DATABASE_URL="postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
export TELEGRAM_BOT_TOKEN="8401809931:AAF3-GTJlr0R58VbDHENcsMP6yNg0mOol3g"
export ADMIN_IDS="1429407129"
export ZAI_BASE_URL="https://internal-api.z.ai/v1"
export ZAI_API_KEY="Z.ai"
export ZAI_CHAT_ID="chat-c2ae3234-5685-4053-8998-96e9a664f658"
export ZAI_USER_ID="014c4da7-4f7f-4efa-9157-9091a73a3570"
export ZAI_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDE0YzRkYTctNGY3Zi00ZWZhLTkxNTctOTA5MWE3M2EzNTcwIiwiY2hhdF9pZCI6ImNoYXQtYzJhZTMyMzQtNTY4NS00MDUzLTg5OTgtOTZlOWE2NjRmNjU4IiwicGxhdGZvcm0iOiJ6YWkifQ.az264PV1n9Z8hUkRR3TDrFJJTIOwx65wZfVuf5D1gN0"

LOG_FILE="/home/z/my-project/.pm2-logs/worker-out.log"
PID_FILE="/home/z/my-project/worker-persistent.pid"

# Prevent duplicate instances
if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
  echo "[$(date)] Worker already running with PID $(cat $PID_FILE), exiting" >> "$LOG_FILE"
  exit 0
fi

echo $$ > "$PID_FILE"
echo "[$(date)] === Persistent worker wrapper started (PID $$) ===" >> "$LOG_FILE"

while true; do
  echo "[$(date)] Starting node worker..." >> "$LOG_FILE"
  node /home/z/my-project/worker-continuous.js >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE, restarting in 5s..." >> "$LOG_FILE"
  sleep 5
done
