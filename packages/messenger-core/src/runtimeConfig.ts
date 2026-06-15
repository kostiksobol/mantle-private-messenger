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

export type SavedMessengerRuntimeContext = {
  id: string;
  label: string;
  rpcUrl: string;
  mainConnectorAddress: Address;
  chainId: number;
  chainName: string;
  nativeCurrencyName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  appNetwork: string;
  createdAt: number;
  updatedAt: number;
};

export const MESSENGER_RUNTIME_CONFIG_STORAGE_KEY =
  "mantle-messenger:runtime-config:v1";

export const MESSENGER_RUNTIME_CONTEXTS_STORAGE_KEY =
  "mantle-messenger:runtime-contexts:v1";

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

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
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

export function makeMessengerRuntimeContextId(args: {
  rpcUrl: string;
  mainConnectorAddress: Address;
  chainId: number;
}) {
  return `${args.chainId}:${args.mainConnectorAddress.toLowerCase()}:${args.rpcUrl.trim()}`;
}

function readSavedContextsRaw(): SavedMessengerRuntimeContext[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(MESSENGER_RUNTIME_CONTEXTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => {
        return (
          item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.rpcUrl === "string" &&
          isAddress(item.mainConnectorAddress) &&
          typeof item.chainId === "number"
        );
      })
      .map((item) => ({
        id: item.id,
        label: cleanString(item.label) || `Chain ${item.chainId}`,
        rpcUrl: cleanString(item.rpcUrl),
        mainConnectorAddress: item.mainConnectorAddress as Address,
        chainId: cleanNumber(item.chainId, 31337),
        chainName: cleanString(item.chainName) || `Unknown chain ${item.chainId}`,
        nativeCurrencyName: cleanString(item.nativeCurrencyName) || "Ether",
        nativeCurrencySymbol: cleanString(item.nativeCurrencySymbol) || "ETH",
        nativeCurrencyDecimals: cleanNumber(item.nativeCurrencyDecimals, 18),
        appNetwork: cleanString(item.appNetwork) || `chain-${item.chainId}`,
        createdAt: cleanNumber(item.createdAt, Date.now()),
        updatedAt: cleanNumber(item.updatedAt, Date.now()),
      }));
  } catch {
    return [];
  }
}

function writeSavedContexts(contexts: SavedMessengerRuntimeContext[]) {
  localStorage.setItem(
    MESSENGER_RUNTIME_CONTEXTS_STORAGE_KEY,
    JSON.stringify(contexts)
  );
}

export function getSavedMessengerRuntimeContexts() {
  return readSavedContextsRaw().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveMessengerRuntimeContext(
  context: Omit<SavedMessengerRuntimeContext, "id" | "createdAt" | "updatedAt"> &
    Partial<Pick<SavedMessengerRuntimeContext, "id" | "createdAt" | "updatedAt">>
) {
  const now = Date.now();

  const id =
    context.id ||
    makeMessengerRuntimeContextId({
      rpcUrl: context.rpcUrl,
      mainConnectorAddress: context.mainConnectorAddress,
      chainId: context.chainId,
    });

  const existing = readSavedContextsRaw();
  const previous = existing.find((item) => item.id === id);

  const nextContext: SavedMessengerRuntimeContext = {
    ...context,
    id,
    createdAt: previous?.createdAt || context.createdAt || now,
    updatedAt: now,
  };

  writeSavedContexts([
    nextContext,
    ...existing.filter((item) => item.id !== id),
  ]);

  return nextContext;
}

export function deleteSavedMessengerRuntimeContext(id: string) {
  writeSavedContexts(readSavedContextsRaw().filter((item) => item.id !== id));
}

export function applySavedMessengerRuntimeContext(
  context: SavedMessengerRuntimeContext
) {
  saveMessengerRuntimeConfigOverride(context);
  saveMessengerRuntimeContext(context);
}
