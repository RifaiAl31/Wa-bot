#!/bin/sh
set -eu
cd "$(dirname "$0")"
node scripts/process-cli.js restart-tunnel || true
node scripts/process-cli.js restart-bot
