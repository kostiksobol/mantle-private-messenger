#!/usr/bin/env bash
set -euo pipefail

RPC_URL="http://127.0.0.1:8545"

# 1000 ETH
BALANCE_HEX="0x3635c9adc5dea00000"

ADDRESSES=(
  "0x950546a7B3Fd2F4c12ee83cd0E49427D5eBFf609"
  "0x178191B5E5E8c115a3e33FB3720106D8AF522251"
  "0x55a7920dEc2030bCC426A1Fef4987D4520137d3e"
  "0x874f8507CDcb8099f5ABF6ef465622cC0b43A3b3"
  "0xb8c53Fcc3a86c1A46501D32c36E6CB0b97f1fAE3"
)

echo "Checking Anvil..."
cast chain-id --rpc-url "$RPC_URL" >/dev/null

for ADDRESS in "${ADDRESSES[@]}"; do
  cast rpc \
    --rpc-url "$RPC_URL" \
    anvil_setBalance \
    "$ADDRESS" \
    "$BALANCE_HEX" >/dev/null

  BALANCE="$(cast balance "$ADDRESS" --rpc-url "$RPC_URL" --ether)"
  echo "$ADDRESS $BALANCE ETH"
done
