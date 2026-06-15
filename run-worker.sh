#!/bin/bash
# MoodChat AI Worker - Reliable auto-restart script
cd /home/z/my-project
export $(grep -v '^#' .env | xargs)

echo "[$(date)] Starting MoodChat AI Worker..."

while true; do
  node dist/worker.js 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE. Restarting in 3 seconds..."
  sleep 3
done
