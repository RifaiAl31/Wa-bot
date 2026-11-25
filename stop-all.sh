#!/bin/sh
set -eu
cd "$(dirname "$0")"
node scripts/process-cli.js stop-tunnel || true
node scripts/process-cli.js stop-bot
node scripts/process-cli.js status
