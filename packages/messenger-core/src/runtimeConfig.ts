import type { Address } from "viem";

export type MessengerRuntimeConfig = {
  appNetwork: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  mainConnectorAddress: Address | "";
  nativeCurrencyName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  blockExplorerUrl?: string;
};

export type MessengerRuntimeConfigOverride = {
  rpcUrl?: string;
  mainConnectorAddress?: Address | "";
  chainId?: number;
  chainName?: string;
  nativeCurrencyName?: string;
  nativeCurrencySymbol?: string;
  nativeCurrencyDecimals?: number;
  appNetwork?: string;
};

export const MESSENGER_RUNTIME_CONFIG_STORAGE_KEY =
  "mantle-messenger:runtime-config:v1";

function readStorage(): MessengerRuntimeConfigOverride | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  try {
    const raw = localStorage.getItem(MESSENGER_RUNTIME_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getKnownChainMetadata(chainId: number) {
  const known: Record<
    number,
    {
      chainName: string;
      nativeCurrencyName: string;
      nativeCurrencySymbol: string;
      nativeCurrencyDecimals: number;
      appNetwork: string;
    }
  > = {
    1: {
      chainName: "Ethereum",
      nativeCurrencyName: "Ether",
      nativeCurrencySymbol: "ETH",
      nativeCurrencyDecimals: 18,
      appNetwork: "ethereum",
    },
    11155111: {
      chainName: "Sepolia",
      nativeCurrencyName: "Sepolia Ether",
      nativeCurrencySymbol: "ETH",
      nativeCurrencyDecimals: 18,
      appNetwork: "sepolia",
    },
    31337: {
      chainName: "Anvil",
      nativeCurrencyName: "Ether",
      nativeCurrencySymbol: "ETH",
      nativeCurrencyDecimals: 18,
      appNetwork: "anvil",
    },
    5000: {
      chainName: "Mantle",
      nativeCurrencyName: "Mantle",
      nativeCurrencySymbol: "MNT",
      nativeCurrencyDecimals: 18,
      appNetwork: "mantle",
    },
    5003: {
      chainName: "Mantle Sepolia",
      nativeCurrencyName: "Mantle",
      nativeCurrencySymbol: "MNT",
      nativeCurrencyDecimals: 18,
      appNetwork: "mantle-sepolia",
    },
  };

  return known[chainId];
}

export function getDefaultMessengerRuntimeConfig(): MessengerRuntimeConfig {
  const appNetwork = cleanString(import.meta.env.VITE_APP_NETWORK) || "anvil";

  const chainId = cleanNumber(
    import.meta.env.VITE_CHAIN_ID ?? import.meta.env.VITE_APP_CHAIN_ID,
    appNetwork.includes("mantle") ? 5003 : 31337
  );

  const known = getKnownChainMetadata(chainId);

  const nativeCurrencySymbol =
    cleanString(import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL) ||
    known?.nativeCurrencySymbol ||
    (appNetwork.includes("mantle") ? "MNT" : "ETH");

  return {
    appNetwork,
    chainId,
    chainName:
      cleanString(import.meta.env.VITE_CHAIN_NAME) ||
      known?.chainName ||
      (appNetwork.includes("mantle") ? "Mantle Sepolia" : "Anvil"),
    rpcUrl:
      cleanString(import.meta.env.VITE_RPC_URL) ||
      cleanString(import.meta.env.VITE_APP_RPC_URL) ||
      "http://127.0.0.1:8545",
    mainConnectorAddress:
      (cleanString(import.meta.env.VITE_MAIN_CONNECTOR_ADDRESS) as Address | "") ||
      "",
    nativeCurrencyName:
      cleanString(import.meta.env.VITE_NATIVE_CURRENCY_NAME) ||
      known?.nativeCurrencyName ||
      nativeCurrencySymbol,
    nativeCurrencySymbol,
    nativeCurrencyDecimals: cleanNumber(
      import.meta.env.VITE_NATIVE_CURRENCY_DECIMALS,
      known?.nativeCurrencyDecimals || 18
    ),
    blockExplorerUrl:
      cleanString(import.meta.env.VITE_BLOCK_EXPLORER_URL) || undefined,
  };
}

export function getMessengerRuntimeConfig(): MessengerRuntimeConfig {
  const defaults = getDefaultMessengerRuntimeConfig();
  const override = readStorage();

  if (!override || typeof override !== "object") {
    return defaults;
  }

  const chainId = cleanNumber(override.chainId, defaults.chainId);
  const known = getKnownChainMetadata(chainId);

  return {
    ...defaults,
    appNetwork:
      cleanString(override.appNetwork) ||
      known?.appNetwork ||
      `chain-${chainId}`,
    chainId,
    chainName:
      cleanString(override.chainName) ||
      known?.chainName ||
      `Unknown chain ${chainId}`,
    rpcUrl: cleanString(override.rpcUrl) || defaults.rpcUrl,
    mainConnectorAddress:
      (cleanString(override.mainConnectorAddress) as Address | "") ||
      defaults.mainConnectorAddress,
    nativeCurrencyName:
      cleanString(override.nativeCurrencyName) ||
      known?.nativeCurrencyName ||
      defaults.nativeCurrencyName,
    nativeCurrencySymbol:
      cleanString(override.nativeCurrencySymbol) ||
      known?.nativeCurrencySymbol ||
      defaults.nativeCurrencySymbol,
    nativeCurrencyDecimals: cleanNumber(
      override.nativeCurrencyDecimals,
      known?.nativeCurrencyDecimals || defaults.nativeCurrencyDecimals
    ),
  };
}

export function saveMessengerRuntimeConfigOverride(
  override: MessengerRuntimeConfigOverride
) {
  localStorage.setItem(
    MESSENGER_RUNTIME_CONFIG_STORAGE_KEY,
    JSON.stringify({
      rpcUrl: cleanString(override.rpcUrl),
      mainConnectorAddress:
        cleanString(override.mainConnectorAddress) as Address | "",
      chainId: override.chainId,
      chainName: cleanString(override.chainName),
      nativeCurrencyName: cleanString(override.nativeCurrencyName),
      nativeCurrencySymbol: cleanString(override.nativeCurrencySymbol),
      nativeCurrencyDecimals: override.nativeCurrencyDecimals,
      appNetwork: cleanString(override.appNetwork),
    })
  );
}

export function saveMessengerRuntimeConfig(config: MessengerRuntimeConfig) {
  saveMessengerRuntimeConfigOverride(config);
}

export function resetMessengerRuntimeConfig() {
  localStorage.removeItem(MESSENGER_RUNTIME_CONFIG_STORAGE_KEY);
}
