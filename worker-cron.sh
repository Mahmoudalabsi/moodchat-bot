#!/bin/bash
# MoodChat AI Worker - Robust version with process checking
# Uses process-pending.js (one-shot) instead of a long-running worker
cd /home/z/my-project

# Load .env safely (handles URLs with special chars like & ?)
set -a
. ./.env
set +a

LOG=/home/z/my-project/worker-cron.log
echo "[$(date)] Worker cron started (DATABASE_URL=${DATABASE_URL:0:50}...)" >> "$LOG"

while true; do
  node process-pending.js >> "$LOG" 2>&1
  sleep 3
done
