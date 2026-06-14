#!/usr/bin/env bash
set -euo pipefail

if [ ! -f apps/web/.env.anvil.local ]; then
  echo "apps/web/.env.anvil.local does not exist."
  echo "Run scripts/deploy-anvil.sh first."
  exit 1
fi

cp apps/web/.env.anvil.local apps/web/.env.local

echo "Using Anvil:"
cat apps/web/.env.local
