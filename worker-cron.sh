#!/bin/bash
# MoodChat AI Worker - Robust version with process checking
# Uses process-pending.js (one-shot) instead of a long-running worker
cd /home/z/my-project
export $(grep -v '^#' .env | xargs)

LOG=/home/z/my-project/worker-cron.log
echo "[$(date)] Worker cron started" >> "$LOG"

while true; do
  node process-pending.js >> "$LOG" 2>&1
  sleep 3
done
