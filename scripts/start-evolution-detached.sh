#!/bin/bash
# Detached launcher for Evolution API
# Survives shell exit via setsid + nohup

cd /home/z/my-project/evolution-api

LOG_FILE="/home/z/my-project/.pm2-logs/evolution-api.log"
PID_FILE="/home/z/my-project/.pm2-logs/evolution-api.pid"
mkdir -p "$(dirname "$LOG_FILE")"

# Kill any existing instance
pkill -f "evolution-api/src/main.ts" 2>/dev/null
sleep 2

# Launch with full detachment
setsid nohup npx tsx ./src/main.ts </dev/null >"$LOG_FILE" 2>&1 &
disown

echo $! > "$PID_FILE"
echo "Evolution API launcher started (PID $!)"
echo "Log file: $LOG_FILE"

sleep 8
if pgrep -f "evolution-api/src/main.ts" > /dev/null; then
  echo "✅ Evolution API is running: $(pgrep -f 'evolution-api/src/main.ts' | tr '\n' ' ')"
else
  echo "❌ Evolution API failed — check $LOG_FILE"
  tail -20 "$LOG_FILE"
fi
