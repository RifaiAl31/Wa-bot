#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Deployment satu perintah. Set ALLOW_DIRTY=1 hanya bila Anda tahu risikonya.
exec node scripts/deploy-cli.js deploy ${ALLOW_DIRTY:+--allow-dirty}
