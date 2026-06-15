import { http } from "viem";
import { defineChain } from "viem";
import { createConfig } from "wagmi";

import { getMessengerRuntimeConfig } from "./runtimeConfig";

const runtimeConfig = getMessengerRuntimeConfig();

export const appChain = defineChain({
  id: runtimeConfig.chainId,
  name: runtimeConfig.chainName,
  nativeCurrency: {
    name: runtimeConfig.nativeCurrencyName,
    symbol: runtimeConfig.nativeCurrencySymbol,
    decimals: runtimeConfig.nativeCurrencyDecimals,
  },
  rpcUrls: {
    default: {
      http: [runtimeConfig.rpcUrl],
    },
  },
  blockExplorers: runtimeConfig.blockExplorerUrl
    ? {
        default: {
          name: "Explorer",
          url: runtimeConfig.blockExplorerUrl,
        },
      }
    : undefined,
});

export const config = createConfig({
  chains: [appChain],
  transports: {
    [appChain.id]: http(runtimeConfig.rpcUrl),
  },
});
