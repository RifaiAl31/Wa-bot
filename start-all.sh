#!/bin/sh
set -eu
cd "$(dirname "$0")"
node scripts/process-cli.js start-bot
node scripts/process-cli.js start-tunnel || true
node scripts/process-cli.js status
