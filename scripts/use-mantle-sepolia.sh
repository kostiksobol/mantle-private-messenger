#!/usr/bin/env bash
set -euo pipefail

cp apps/web/.env.mantle-sepolia.local apps/web/.env.local

echo "Using Mantle Sepolia:"
cat apps/web/.env.local
