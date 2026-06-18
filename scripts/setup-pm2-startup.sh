#!/bin/bash
# Script to set up PM2 auto-start on boot for the moodchat-worker
#
# WARNING: This system uses tini as PID 1, not systemd. So the standard
# `pm2 startup systemd` command will not work.
#
# Options:
#   1) If the container/host supports systemd, run:
#        sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u z --hp /home/z
#        pm2 save
#
#   2) If running in a Docker container with custom entrypoint, add this
#      to the container's entrypoint script (as root):
#        su - z -c "cd /home/z/my-project && pm2 resurrect"
#
#   3) For a simple always-on approach without systemd, use this script
#      as part of the container CMD/entrypoint.

set -e

echo "=== PM2 Auto-start Setup for moodchat-worker ==="
echo ""
echo "This system uses $(ps -p 1 -o comm=) as PID 1."
echo ""

# Check if pm2 is installed
PM2_BIN="/home/z/.npm-global/lib/node_modules/pm2/bin/pm2"
if [ ! -x "$PM2_BIN" ] && ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 not found. Install with: npm install -g pm2"
  exit 1
fi

PM2_CMD="${PM2_BIN:-$(which pm2)}"

# Try the standard PM2 startup approach (needs sudo + systemd)
if [ "$1" == "--systemd" ] && [ "$(id -u)" -eq 0 ]; then
  echo "→ Setting up systemd unit for PM2..."
  $PM2_CMD startup systemd -u z --hp /home/z
  $PM2_CMD save
  echo "✅ PM2 startup configured for systemd"
  exit 0
fi

# Default: just resurrect the saved PM2 processes
echo "→ Resurrecting saved PM2 processes..."
$PM2_CMD resurrect
$PM2_CMD list
echo ""
echo "✅ PM2 processes restored."
echo ""
echo "ℹ️  To make this run on every boot, add this script to:"
echo "   - Your container's entrypoint (as user z)"
echo "   - Or run with sudo + --systemd flag if systemd is available:"
echo "       sudo $0 --systemd"
