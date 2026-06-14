#!/usr/bin/env bash
set -euo pipefail

RPC_URL="http://127.0.0.1:8545"
WS_RPC_URL="ws://127.0.0.1:8545"
CHAIN_ID="31337"

DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

ENV_ANVIL="apps/web/.env.anvil.local"
ENV_LOCAL="apps/web/.env.local"

echo "Checking Anvil..."
cast chain-id --rpc-url "$RPC_URL" >/dev/null

echo "Building contracts..."
forge build

BYTECODE="$(forge inspect contracts/MainConnector.sol:MainConnector bytecode)"

echo "Deploying MainConnector to Anvil..."

DEPLOY_JSON="$(
  cast send \
    --rpc-url "$RPC_URL" \
    --chain-id "$CHAIN_ID" \
    --private-key "$DEPLOYER_PK" \
    --json \
    --create "$BYTECODE"
)"

TX_HASH="$(echo "$DEPLOY_JSON" | jq -r '.transactionHash // .hash // empty')"
MAIN_CONNECTOR="$(echo "$DEPLOY_JSON" | jq -r '.contractAddress // .contract_address // empty')"

if [ -z "$MAIN_CONNECTOR" ] || [ "$MAIN_CONNECTOR" = "null" ]; then
  MAIN_CONNECTOR="$(
    cast receipt "$TX_HASH" \
      --rpc-url "$RPC_URL" \
      --json | jq -r '.contractAddress // .contract_address // empty'
  )"
fi

if [ -z "$MAIN_CONNECTOR" ] || [ "$MAIN_CONNECTOR" = "null" ]; then
  echo "Deploy failed:"
  echo "$DEPLOY_JSON" | jq
  exit 1
fi

cat > "$ENV_ANVIL" <<ENVEOF
VITE_APP_NETWORK=anvil
VITE_ANVIL_HTTP_RPC_URL=$RPC_URL
VITE_ANVIL_WS_RPC_URL=$WS_RPC_URL
VITE_MAIN_CONNECTOR_ADDRESS=$MAIN_CONNECTOR
ENVEOF

cp "$ENV_ANVIL" "$ENV_LOCAL"

echo
echo "MainConnector deployed to Anvil:"
echo "$MAIN_CONNECTOR"

echo
echo "Written to:"
echo "$ENV_ANVIL"
echo "$ENV_LOCAL"
