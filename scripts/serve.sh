#!/bin/bash
# Start the Personal-Assistant backend server in the background
# Usage: scripts/serve.sh
set -e
cd /workspace/Personal-Assistant
rm -f /tmp/server.log /tmp/server.pid
nohup setsid npx tsx server/index.ts > /tmp/server.log 2>&1 < /dev/null &
echo $! > /tmp/server.pid
disown
echo "started pid=$(cat /tmp/server.pid)"
sleep 1
ls -la /proc/$(cat /tmp/server.pid)/cwd 2>&1 || true
