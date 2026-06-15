import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { MessengerTransactionLayer } from "@mantle/messenger-core/chain/transactionLayer";
import { appChain } from "@mantle/messenger-core/wagmi";

import { tryWalletSendCallsBatch } from "../adapters/walletBatch";

export function createBrowserWalletTransactions(args: {
  ownerAddress: Address;
  walletClient: any;
}): MessengerTransactionLayer {
  return {
    writeContract: async (call) => {
      return args.walletClient.writeContract({
        account: args.ownerAddress,
        chain: appChain,
        ...call,
      } as any);
    },

    sendCallsBatch: async (calls) => {
      return tryWalletSendCallsBatch({
        from: args.ownerAddress,
        chainId: appChain.id,
        calls,
      });
    },
  };
}

export function createLocalSignerTransactions(args: {
  privateKey: Hex;
}): MessengerTransactionLayer {
  const account = privateKeyToAccount(args.privateKey);

  const walletClient = createWalletClient({
    account,
    chain: appChain,
    transport: http(appChain.rpcUrls.default.http[0]),
  });

  return {
    writeContract: async (call) => {
      return walletClient.writeContract({
        account,
        chain: appChain,
        ...call,
      } as any);
    },
  };
}
