#!/bin/bash
# MoodChat AI Worker - Auto-restart script
cd /home/z/my-project
export $(grep -v '^#' .env | xargs)

while true; do
  echo "[$(date)] Starting AI Worker..."
  npx tsx src/ai-worker.ts
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE. Restarting in 5 seconds..."
  sleep 5
done
