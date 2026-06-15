#!/bin/bash
cd /home/z/my-project
export $(grep -v '^#' .env | xargs)

# Delete webhook first
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook" > /dev/null 2>&1
sleep 2

# Clear pending updates
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1&timeout=0" > /dev/null 2>&1
sleep 2

# Start the bot
exec npx tsx src/bot-runner.ts
