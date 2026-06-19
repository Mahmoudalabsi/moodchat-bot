#!/bin/bash
# Supervisor for worker-continuous.js
# Restarts the worker if it crashes

LOG=/home/z/my-project/worker.log
PIDFILE=/home/z/my-project/worker.pid

# Export correct env vars (override platform's wrong DATABASE_URL)
export DATABASE_URL="postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
export DIRECT_URL="postgresql://neondb_owner:npg_GECe5uDMb1np@ep-solitary-mountain-ahah7oqn-pooler.c-3.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
export TELEGRAM_BOT_TOKEN="8877954741:AAFFyxnxBmtXhctV_wBCzdFgros43n3QJDM"

cd /home/z/my-project

# Kill any existing worker
pkill -f "worker-continuous" 2>/dev/null
sleep 1

echo "[$(date)] 🚀 Supervisor started" > $LOG

# Infinite loop with auto-restart
while true; do
    echo "[$(date)] Starting worker..." >> $LOG
    node worker-continuous.js >> $LOG 2>&1
    EXIT_CODE=$?
    echo "[$(date)] ⚠️ Worker exited with code $EXIT_CODE, restarting in 3s..." >> $LOG
    sleep 3
done
