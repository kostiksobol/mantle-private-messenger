#!/usr/bin/env bash
set -euo pipefail

RPC_URL="https://rpc.sepolia.mantle.xyz"
CHAIN_ID="5003"
PK_FILE=".deploy/mantle-sepolia-deployer.pk"

AMOUNT_WEI="200000000000000000"      # 0.2 MNT
SKIP_IF_WEI="100000000000000000"     # skip if address already has >= 0.1 MNT
GAS_LIMIT="21000"

DEPLOYER_PK="$(cat "$PK_FILE")"
DEPLOYER_ADDRESS="$(cast wallet address --private-key "$DEPLOYER_PK")"

ADDRESSES=(
  "0x950546a7B3Fd2F4c12ee83cd0E49427D5eBFf609"
  "0x178191B5E5E8c115a3e33FB3720106D8AF522251"
  "0x55a7920dEc2030bCC426A1Fef4987D4520137d3e"
  "0x874f8507CDcb8099f5ABF6ef465622cC0b43A3b3"
  "0xb8c53Fcc3a86c1A46501D32c36E6CB0b97f1fAE3"
)

GAS_PRICE_HEX="$(
  curl --http1.1 -s "$RPC_URL" \
    -H "content-type: application/json" \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_gasPrice","params":[]}' \
    | jq -r '.result'
)"

GAS_PRICE="$(cast to-dec "$GAS_PRICE_HEX")"
GAS_PRICE="$((GAS_PRICE * 2))"

NONCE_HEX="$(
  curl --http1.1 -s "$RPC_URL" \
    -H "content-type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionCount\",\"params\":[\"$DEPLOYER_ADDRESS\",\"pending\"]}" \
    | jq -r '.result'
)"

NONCE="$(cast to-dec "$NONCE_HEX")"

echo "Funder:"
echo "$DEPLOYER_ADDRESS"

echo
echo "Funder balance before:"
cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" --ether

echo
echo "Gas price:"
echo "$GAS_PRICE"

echo
echo "Starting nonce:"
echo "$NONCE"

echo
echo "Funding..."
echo

for ADDRESS in "${ADDRESSES[@]}"; do
  BALANCE_WEI="$(cast balance "$ADDRESS" --rpc-url "$RPC_URL")"

  if [ "$BALANCE_WEI" -ge "$SKIP_IF_WEI" ]; then
    echo "Skipping $ADDRESS — already has $(cast balance "$ADDRESS" --rpc-url "$RPC_URL" --ether) MNT"
    continue
  fi

  echo "Funding $ADDRESS with 0.2 MNT using nonce $NONCE"

  cast send "$ADDRESS" \
    --value "$AMOUNT_WEI" \
    --rpc-url "$RPC_URL" \
    --chain-id "$CHAIN_ID" \
    --private-key "$DEPLOYER_PK" \
    --legacy \
    --nonce "$NONCE" \
    --gas-price "$GAS_PRICE" \
    --gas-limit "$GAS_LIMIT"

  NONCE="$((NONCE + 1))"

  sleep 3
  echo
done

echo "Balances after:"
for ADDRESS in "${ADDRESSES[@]}"; do
  BALANCE="$(cast balance "$ADDRESS" --rpc-url "$RPC_URL" --ether)"
  echo "$ADDRESS $BALANCE MNT"
done

echo
echo "Funder balance after:"
cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" --ether
