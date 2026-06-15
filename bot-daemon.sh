#!/bin/bash
# MoodChat Polling Bot - Auto-restart wrapper
# This script ensures the bot stays running 24/7

BOT_SCRIPT="/home/z/my-project/polling-bot.mjs"
LOG_FILE="/home/z/my-project/polling-bot.log"
PID_FILE="/home/z/my-project/polling-bot.pid"
MAX_RESTARTS=10
RESTART_DELAY=5

cd /home/z/my-project

restart_count=0

while [ $restart_count -lt $MAX_RESTARTS ]; do
    echo "[$(date)] Starting MoodChat Polling Bot (attempt $((restart_count+1))/$MAX_RESTARTS)..."
    
    node "$BOT_SCRIPT" >> "$LOG_FILE" 2>&1
    exit_code=$?
    
    echo "[$(date)] Bot exited with code $exit_code"
    
    if [ $exit_code -eq 0 ]; then
        echo "[$(date)] Clean shutdown, not restarting."
        break
    fi
    
    restart_count=$((restart_count + 1))
    echo "[$(date)] Restarting in ${RESTART_DELAY}s..."
    sleep $RESTART_DELAY
done

echo "[$(date)] Max restarts reached. Stopping."
