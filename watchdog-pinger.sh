#!/bin/bash
# ============================================================
# Watchdog script for pinger-bot — keeps it running forever
# يُشغّل الـ pinger ويعيد تشغيله فوراً إذا توقف لأي سبب
# ============================================================

cd "$(dirname "$0")"

LOG_FILE="/tmp/pinger.log"
PID_FILE="/tmp/pinger.pid"
MAX_LOG_SIZE=1048576  # 1MB
MAX_RESTARTS_PER_HOUR=20
RESTART_COUNTER_FILE="/tmp/pinger_restarts"

# Rotate log if too big
if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
  echo "[$(date)] Log rotated" > "$LOG_FILE"
fi

# Restart rate limiter (max 20 restarts/hour)
reset_counter_if_needed() {
  if [ -f "$RESTART_COUNTER_FILE" ]; then
    local last_reset=$(head -1 "$RESTART_COUNTER_FILE" 2>/dev/null)
    local now=$(date +%s)
    local diff=$((now - last_reset))
    if [ $diff -gt 3600 ]; then
      echo "$now" > "$RESTART_COUNTER_FILE"
      echo "0" >> "$RESTART_COUNTER_FILE"
    fi
  else
    echo "$(date +%s)" > "$RESTART_COUNTER_FILE"
    echo "0" >> "$RESTART_COUNTER_FILE"
  fi
}

get_restart_count() {
  tail -1 "$RESTART_COUNTER_FILE" 2>/dev/null || echo 0
}

increment_restart_count() {
  local count=$(get_restart_count)
  count=$((count + 1))
  local first_line=$(head -1 "$RESTART_COUNTER_FILE")
  echo "$first_line" > "$RESTART_COUNTER_FILE"
  echo "$count" >> "$RESTART_COUNTER_FILE"
}

echo "[$(date)] 🐕 Watchdog starting — keeping pinger alive forever"

restart_count=0
while true; do
  reset_counter_if_needed
  restart_count=$(get_restart_count)

  if [ $restart_count -ge $MAX_RESTARTS_PER_HOUR ]; then
    echo "[$(date)] ⚠️  Too many restarts ($restart_count/hour). Cooling down for 60s..."
    sleep 60
    continue
  fi

  # Check if pinger is running
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      # Pinger is alive — sleep and check again
      sleep 10
      continue
    fi
  fi

  # Pinger is dead — start it
  echo "[$(date)] 🔄 Pinger not running. Starting fresh instance..."
  echo "[$(date)] 🔄 Restart count this hour: $restart_count"

  # Use node (more stable than bun for long-running)
  nohup node pinger-bot.mjs >> "$LOG_FILE" 2>&1 &
  NEW_PID=$!
  echo "$NEW_PID" > "$PID_FILE"
  increment_restart_count

  echo "[$(date)] ✅ Started pinger with PID $NEW_PID"

  # Wait a bit before checking
  sleep 5

  # Verify it started
  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    echo "[$(date)] ❌ Pinger died immediately! Check log:"
    tail -20 "$LOG_FILE"
    rm -f "$PID_FILE"
    sleep 10  # Wait before retry to avoid rapid loop
  fi
done
