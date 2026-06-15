#!/bin/bash
# MoodChat AI Worker - Calls the local Next.js API every 3 seconds
# This approach is more reliable than running a separate Node.js process
cd /home/z/my-project

echo "[$(date)] Starting MoodChat loop worker..." >> /home/z/my-project/loop-worker.log

while true; do
  curl -s http://localhost:3000/api/process-pending >> /home/z/my-project/loop-worker.log 2>&1
  echo "" >> /home/z/my-project/loop-worker.log
  sleep 3
done
