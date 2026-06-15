import { createConfig, fallback, http, webSocket } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

const appNetwork = import.meta.env.VITE_APP_NETWORK || "anvil";

const anvilHttpRpcUrl =
  import.meta.env.VITE_ANVIL_HTTP_RPC_URL || "http://127.0.0.1:8545";

const anvilWsRpcUrl =
  import.meta.env.VITE_ANVIL_WS_RPC_URL || "ws://127.0.0.1:8545";

const mantleSepoliaRpcUrl =
  import.meta.env.VITE_MANTLE_SEPOLIA_RPC_URL ||
  "https://rpc.sepolia.mantle.xyz";

const mantleSepoliaWsRpcUrl =
  import.meta.env.VITE_MANTLE_SEPOLIA_WS_RPC_URL || "";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [anvilHttpRpcUrl],
      webSocket: [anvilWsRpcUrl],
    },
  },
  testnet: true,
});

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: {
    name: "MNT",
    symbol: "MNT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [mantleSepoliaRpcUrl],
      webSocket: mantleSepoliaWsRpcUrl ? [mantleSepoliaWsRpcUrl] : undefined,
    },
  },
  blockExplorers: {
    default: {
      name: "Mantle Sepolia Explorer",
      url: "https://explorer.sepolia.mantle.xyz",
    },
  },
  testnet: true,
});

export const appChain =
  appNetwork === "mantle-sepolia" ? mantleSepolia : anvil;

export const config = createConfig({
  chains: [anvil, mantleSepolia],
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
  ],
  transports: {
    [anvil.id]: fallback([
      webSocket(anvilWsRpcUrl),
      http(anvilHttpRpcUrl),
    ]),
    [mantleSepolia.id]: mantleSepoliaWsRpcUrl
      ? fallback([
          webSocket(mantleSepoliaWsRpcUrl),
          http(mantleSepoliaRpcUrl),
        ])
      : http(mantleSepoliaRpcUrl),
  },
  multiInjectedProviderDiscovery: true,
});
