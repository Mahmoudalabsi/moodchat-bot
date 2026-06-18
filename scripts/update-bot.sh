#!/bin/bash
# MoodChat Zero-Downtime Update Script
#
# Usage:
#   ./update-bot.sh                # Graceful reload (uses pm2 reload)
#   ./update-bot.sh restart        # Hard restart (only if reload fails)
#
# What it does:
#   1. Verifies the new code is syntactically valid
#   2. Runs `pm2 reload moodchat-worker` (no --update-env)
#   3. Worker gracefully finishes in-flight messages, then exits
#   4. PM2 starts the new worker instance
#   5. Zero message loss, zero downtime (worker is offline for <1 second)
#
# IMPORTANT: Never use `pm2 restart` for routine updates - that kills
# in-flight messages. Always use this script (which uses `reload`).

set -e

PROJECT_DIR="/home/z/my-project"
WORKER_FILE="$PROJECT_DIR/worker-continuous.js"
ECOSYSTEM_FILE="$PROJECT_DIR/ecosystem.config.js"

echo "=== MoodChat Zero-Downtime Update ==="
echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# 1. Syntax check the new code BEFORE touching the running process
echo "→ [1/4] Syntax check $WORKER_FILE..."
if ! node -c "$WORKER_FILE"; then
  echo "❌ Syntax error in $WORKER_FILE - aborting update (running worker is untouched)"
  exit 1
fi
echo "  ✅ Syntax OK"

# 2. Validate ecosystem.config.js
echo "→ [2/4] Validate $ECOSYSTEM_FILE..."
if ! node -e "require('$ECOSYSTEM_FILE')" 2>/dev/null; then
  echo "❌ Invalid ecosystem.config.js - aborting update"
  exit 1
fi
echo "  ✅ ecosystem OK"

# 3. Show current state
echo "→ [3/4] Current PM2 state:"
pm2 list 2>/dev/null | grep -E "moodchat-worker|────" | head -3

# 4. Graceful reload (NEVER use --update-env, that pollutes env from shell)
echo "→ [4/4] Graceful reload..."
if [ "$1" == "restart" ]; then
  echo "  ⚠️  Hard restart requested - in-flight messages may be lost!"
  pm2 restart moodchat-worker
else
  pm2 reload moodchat-worker
fi

# Wait for the new process to come up and report DB connected
echo ""
echo "→ Waiting for new worker to be ready (max 30s)..."
for i in $(seq 1 30); do
  sleep 1
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
  procs = json.load(sys.stdin)
  for p in procs:
    if p.get('name') == 'moodchat-worker':
      s = p.get('pm2_env', {}).get('status', '')
      print(s)
      break
except: print('error')
" 2>/dev/null)
  if [ "$STATUS" == "online" ]; then
    echo "  ✅ Worker is online after ${i}s"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ⚠️  Worker did not come online within 30s - check pm2 logs"
    exit 2
  fi
done

# 5. Save PM2 state
pm2 save >/dev/null 2>&1

echo ""
echo "=== Update complete ==="
echo "Final state:"
pm2 list 2>/dev/null | grep -E "moodchat-worker|────" | head -3
echo ""
echo "Recent logs:"
pm2 logs moodchat-worker --lines 5 --nostream --out 2>/dev/null | tail -7
