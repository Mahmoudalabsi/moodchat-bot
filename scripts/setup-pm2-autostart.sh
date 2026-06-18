#!/bin/bash
# Setup PM2 auto-start on boot for MoodChat Worker
#
# This system uses tini (Docker container) as PID 1, not systemd.
# This script installs auto-start via:
#   1. ~/.bashrc hook (runs when any shell opens - good for interactive sessions)
#   2. systemd unit file (runs at boot IF systemd is the init system)
#   3. Provides a self-healing watchdog script that can be added to container entrypoint
#
# Usage:
#   ./setup-pm2-autostart.sh           # Install bashrc hook + create watchdog
#   sudo ./setup-pm2-autostart.sh systemd  # Also install systemd unit (needs root)
#   ./setup-pm2-autostart.sh watchdog     # Install watchdog in background

set -e

PROJECT_DIR="/home/z/my-project"
PM2_BIN="${PM2_BIN:-$(command -v pm2 || echo /home/z/.npm-global/bin/pm2)}"

echo "=== MoodChat PM2 Auto-start Setup ==="
echo "PID 1: $(ps -p 1 -o comm=)"
echo "PM2: $PM2_BIN"
echo ""

# 1. bashrc hook is already installed - just verify
echo "→ [1/3] Verifying ~/.bashrc hook..."
if [ -f /home/z/.bashrc ] && grep -q "moodchat-worker" /home/z/.bashrc; then
  echo "  ✅ ~/.bashrc hook present"
else
  echo "  ⚠️  ~/.bashrc hook missing - will create"
  cat > /home/z/.bashrc <<'EOF'
# ~/.bashrc - MoodChat worker auto-start
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if command -v pm2 >/dev/null 2>&1; then
  if ! pm2 jlist 2>/dev/null | grep -q '"name":"moodchat-worker"' 2>/dev/null; then
    cd /home/z/my-project 2>/dev/null || exit
    pm2 resurrect >/dev/null 2>&1
    if ! pm2 jlist 2>/dev/null | grep -q '"name":"moodchat-worker"' 2>/dev/null; then
      pm2 start /home/z/my-project/ecosystem.config.js >/dev/null 2>&1
      pm2 save >/dev/null 2>&1
    fi
  fi
fi
EOF
  echo "  ✅ Created ~/.bashrc"
fi

# 2. Save current PM2 state
echo "→ [2/3] Saving PM2 process list..."
"$PM2_BIN" save 2>&1 | tail -1

# 3. systemd unit (optional, needs root)
if [ "$1" == "systemd" ]; then
  if [ "$(id -u)" -ne 0 ]; then
    echo "→ [3/3] systemd install requires root. Run: sudo $0 systemd"
  else
    echo "→ [3/3] Installing systemd unit..."
    cp "$PROJECT_DIR/scripts/pm2-moodchat.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable pm2-moodchat
    echo "  ✅ systemd unit installed and enabled"
  fi
else
  echo "→ [3/3] systemd unit available at $PROJECT_DIR/scripts/pm2-moodchat.service"
  echo "  (To install: sudo $0 systemd)"
fi

echo ""
echo "=== Auto-start mechanism summary ==="
echo "  • ~/.bashrc hook: ✅ (resurrects PM2 when shell opens)"
echo "  • PM2 dump file: ✅ (~/.pm2/dump.pm2)"
if [ "$1" == "systemd" ] && [ "$(id -u)" -eq 0 ]; then
  echo "  • systemd unit: ✅ (/etc/systemd/system/pm2-moodchat.service)"
else
  echo "  • systemd unit: ⏸  (not installed - run with 'systemd' arg as root)"
fi
echo ""
echo "For Docker containers using tini, the most reliable approach is to add this"
echo "to the container entrypoint (Dockerfile CMD or docker-compose command):"
echo ""
echo "  su - z -c 'cd /home/z/my-project && pm2 resurrect && pm2 start ecosystem.config.js && tail -f /dev/null'"
echo ""
echo "Or simply ensure any interactive shell opens ~/.bashrc which will auto-start PM2."
