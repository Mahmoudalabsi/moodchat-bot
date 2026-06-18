#!/bin/bash
# Fully detached bot launcher using double-fork + setsid + nohup
# Survives parent shell exit, terminal close, and SIGHUP.
# Writes a startup log to /tmp/bot-startup.log for debugging.

cd /home/z/my-project

# Clean stale PID
rm -f worker-permanent.pid

# Kill any existing instance
pkill -f "run-bot-permanent.sh" 2>/dev/null
pkill -f "worker-continuous.js" 2>/dev/null
sleep 2

# Launch with full detachment: setsid + nohup + </dev/null + disown
setsid nohup bash /home/z/my-project/run-bot-permanent.sh </dev/null >/tmp/bot-startup.log 2>&1 &
disown

echo "Bot launcher started (PID $!)"
echo "Startup log: /tmp/bot-startup.log"
echo "Worker log:  /home/z/my-project/.pm2-logs/worker-out.log"

# Wait briefly to confirm it actually started
sleep 5
if pgrep -f "worker-continuous.js" > /dev/null; then
  echo "✅ Worker is running: $(pgrep -f 'worker-continuous.js' | tr '\n' ' ')"
else
  echo "❌ Worker failed to start — check /tmp/bot-startup.log"
fi
