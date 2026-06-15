#!/bin/bash
# Check if worker is running, restart if not
if ! pgrep -f "dist/worker.js" > /dev/null; then
  echo "[$(date)] Worker not running, starting..." >> /home/z/my-project/worker-restart.log
  cd /home/z/my-project
  export $(grep -v '^#' .env | xargs)
  node dist/worker.js >> /home/z/my-project/worker.log 2>&1 &
fi
