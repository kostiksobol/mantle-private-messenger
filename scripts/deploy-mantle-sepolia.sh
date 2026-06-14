#!/usr/bin/env bash
set -euo pipefail

RPC_URL="https://rpc.sepolia.mantle.xyz"
CHAIN_ID="5003"
GAS_LIMIT="8000000"

PK_FILE=".deploy/mantle-sepolia-deployer.pk"
ENV_FILE="apps/web/.env.local"

DEPLOYER_PK="$(cat "$PK_FILE")"
DEPLOYER_ADDRESS="$(cast wallet address --private-key "$DEPLOYER_PK")"

echo "Mantle Sepolia deployer:"
echo "$DEPLOYER_ADDRESS"

echo
echo "Balance:"
cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" --ether

echo
echo "Building contracts..."
forge build

BYTECODE="$(forge inspect contracts/MainConnector.sol:MainConnector bytecode)"

NONCE="$(
  curl --http1.1 -s "$RPC_URL" \
    -H "content-type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionCount\",\"params\":[\"$DEPLOYER_ADDRESS\",\"latest\"]}" \
    | jq -r '.result' \
    | xargs cast to-dec
)"

EXPECTED_ADDRESS="$(
  cast compute-address --nonce "$NONCE" "$DEPLOYER_ADDRESS" \
    | grep -Eo '0x[a-fA-F0-9]{40}' \
    | tail -n 1
)"

echo
echo "Nonce:"
echo "$NONCE"

echo
echo "Expected MainConnector address:"
echo "$EXPECTED_ADDRESS"

GAS_PRICE_HEX="$(
  curl --http1.1 -s "$RPC_URL" \
    -H "content-type: application/json" \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_gasPrice","params":[]}' \
    | jq -r '.result'
)"

GAS_PRICE="$(
  cast to-dec "$GAS_PRICE_HEX"
)"

GAS_PRICE="$((GAS_PRICE * 2))"

echo
echo "Gas price:"
echo "$GAS_PRICE"

echo
echo "Deploying MainConnector..."

set +e
DEPLOY_OUTPUT="$(
  cast send \
    --rpc-url "$RPC_URL" \
    --chain-id "$CHAIN_ID" \
    --private-key "$DEPLOYER_PK" \
    --legacy \
    --nonce "$NONCE" \
    --gas-price "$GAS_PRICE" \
    --gas-limit "$GAS_LIMIT" \
    --json \
    --create "$BYTECODE" 2>&1
)"
SEND_STATUS=$?
set -e

echo "$DEPLOY_OUTPUT"

TX_HASH="$(echo "$DEPLOY_OUTPUT" | jq -r '.transactionHash // .hash // empty' 2>/dev/null || true)"

if [ -n "$TX_HASH" ] && [ "$TX_HASH" != "null" ]; then
  echo
  echo "Deploy tx:"
  echo "$TX_HASH"
fi

echo
echo "Waiting for code at expected address..."

for i in $(seq 1 120); do
  CODE="$(
    curl --http1.1 -s "$RPC_URL" \
      -H "content-type: application/json" \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$EXPECTED_ADDRESS\",\"latest\"]}" \
      | jq -r '.result // empty'
  )"

  if [ -n "$CODE" ] && [ "$CODE" != "0x" ] && [ "$CODE" != "null" ]; then
    cat > "$ENV_FILE" <<ENVEOF
VITE_MANTLE_SEPOLIA_RPC_URL=$RPC_URL
VITE_MAIN_CONNECTOR_ADDRESS=$EXPECTED_ADDRESS
ENVEOF

    echo
    echo "MainConnector deployed:"
    echo "$EXPECTED_ADDRESS"

    echo
    echo "Written to:"
    echo "$ENV_FILE"

    echo
    echo "Explorer:"
    echo "https://explorer.sepolia.mantle.xyz/address/$EXPECTED_ADDRESS"

    exit 0
  fi

  sleep 3
done

echo
echo "No code appeared at expected address."

if [ "$SEND_STATUS" -ne 0 ]; then
  echo
  echo "cast send failed before deployment was confirmed."
fi

exit 1
