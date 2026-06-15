import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { normalizeAddress } from "@mantle/messenger-core/db";
import { appChain } from "@mantle/messenger-core/wagmi";

export type WalletProviderInfo = {
  id: string;
  name: string;
  icon?: string;
  rdns?: string;
};

export type WalletAccountInfo = {
  address: Address;
  label: string;
  labelSource: "wallet" | "fallback";
  providerId: string;
  providerName: string;
  providerIcon?: string;
  providerRdns?: string;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

type ProviderEntry = WalletProviderInfo & {
  provider: EthereumProvider;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

function compactAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

function getFallbackProvider() {
  return (window as unknown as {
    ethereum?: EthereumProvider;
  }).ethereum;
}

function providerIdFrom(info: Eip6963ProviderDetail["info"]) {
  return info.rdns || info.uuid || info.name;
}

function hexChainIdToNumber(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return Number.parseInt(value, 16);
}

function pickLabel(value: unknown): string | undefined {
  if (typeof value === "string") {
    const label = value.trim();

    if (label && !label.startsWith("0x")) {
      return label;
    }
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const label =
    record.name ??
    record.label ??
    record.displayName ??
    record.accountName ??
    record.nickname ??
    record.alias;

  return typeof label === "string" && label.trim() ? label.trim() : undefined;
}

function pickAddress(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("0x")) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const address =
    record.address ??
    record.account ??
    record.accountAddress ??
    record.addr;

  return typeof address === "string" && address.startsWith("0x")
    ? address
    : undefined;
}

function mergeLabelsFromResult(
  labels: Map<Address, string>,
  result: unknown,
  addresses: Address[]
) {
  if (Array.isArray(result)) {
    result.forEach((item, index) => {
      const itemAddress = pickAddress(item);
      const label = pickLabel(item);

      if (itemAddress && label) {
        labels.set(toAddress(itemAddress), label);
        return;
      }

      if (!itemAddress && label && addresses[index]) {
        labels.set(addresses[index], label);
      }
    });

    return;
  }

  if (!result || typeof result !== "object") {
    return;
  }

  const record = result as Record<string, unknown>;

  for (const address of addresses) {
    const direct = record[address] ?? record[normalizeAddress(address)];
    const label = pickLabel(direct);

    if (label) {
      labels.set(address, label);
    }
  }

  for (const value of Object.values(record)) {
    const itemAddress = pickAddress(value);
    const label = pickLabel(value);

    if (itemAddress && label) {
      labels.set(toAddress(itemAddress), label);
    }
  }
}

async function readWalletAccountNames(
  provider: EthereumProvider,
  addresses: Address[]
) {
  const labels = new Map<Address, string>();

  const methods = [
    "wallet_getAccountNames",
    "wallet_getAccounts",
    "wallet_getAccountList",
    "wallet_getAccountInfo",
    "wallet_getAccountMetadata",
    "wallet_getAddressBook",
    "wallet_getAddressLabels",
    "wallet_getAddressNames",
    "rabby_getAccounts",
    "rabby_getAccountList",
    "rabby_getAccountInfo",
    "rabby_getAddressBook",
    "rabby_getAddressLabels",
    "rabby_getAddressNotes",
  ];

  for (const method of methods) {
    try {
      const result = await provider.request({ method });
      mergeLabelsFromResult(labels, result, addresses);
    } catch {
      // Wallet-specific method is not supported.
    }
  }

  return labels;
}

async function readAccountsFromProviders(entries: ProviderEntry[]) {
  const nextAccounts: WalletAccountInfo[] = [];

  for (const entry of entries) {
    let rawAccounts: unknown;

    try {
      rawAccounts = await entry.provider.request({ method: "eth_accounts" });
    } catch {
      continue;
    }

    const addresses = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .filter((item): item is string => typeof item === "string")
      .map(toAddress);

    const labels = await readWalletAccountNames(entry.provider, addresses);

    for (const address of addresses) {
      const label = labels.get(address);

      nextAccounts.push({
        address,
        label: label || `Wallet ${compactAddress(address)}`,
        labelSource: label ? "wallet" : "fallback",
        providerId: entry.id,
        providerName: entry.name,
        providerIcon: entry.icon,
        providerRdns: entry.rdns,
      });
    }
  }

  return nextAccounts;
}

export function useAppWallet() {
  const publicClient = usePublicClient({ chainId: appChain.id });

  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<WalletAccountInfo[]>([]);
  const [connectingProviderId, setConnectingProviderId] = useState<string>();

  const walletProviders = useMemo<WalletProviderInfo[]>(() => {
    return providers.map(({ provider: _provider, ...info }) => info);
  }, [providers]);

  const getProvider = useCallback(
    (providerId: string) => {
      const provider = providers.find((item) => item.id === providerId)?.provider;

      if (!provider) {
        throw new Error("Wallet provider is not available");
      }

      return provider;
    },
    [providers]
  );

  const refreshWalletAccounts = useCallback(async () => {
    const accounts = await readAccountsFromProviders(providers);
    setWalletAccounts(accounts);
  }, [providers]);

  useEffect(() => {
    const next = new Map<string, ProviderEntry>();
    let fallbackTimer: number | undefined;

    async function commitAndRead() {
      const entries = Array.from(next.values());
      setProviders(entries);
      setWalletAccounts(await readAccountsFromProviders(entries));
    }

    function addProvider(entry: ProviderEntry) {
      next.set(entry.id, entry);
      void commitAndRead();
    }

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;

      if (!detail?.provider || !detail.info) {
        return;
      }

      addProvider({
        id: providerIdFrom(detail.info),
        name: detail.info.name || detail.info.rdns || "Wallet",
        icon: detail.info.icon,
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    fallbackTimer = window.setTimeout(() => {
      if (next.size > 0) {
        return;
      }

      const fallback = getFallbackProvider();

      if (!fallback) {
        return;
      }

      addProvider({
        id: "legacy-window-ethereum",
        name: "Injected wallet",
        provider: fallback,
      });
    }, 250);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);

      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, []);

  useEffect(() => {
    const listeners: Array<() => void> = [];

    for (const entry of providers) {
      if (!entry.provider.on) {
        continue;
      }

      const handler = () => {
        void refreshWalletAccounts();
      };

      entry.provider.on("accountsChanged", handler);

      listeners.push(() => {
        entry.provider.removeListener?.("accountsChanged", handler);
      });
    }

    return () => {
      listeners.forEach((cleanup) => cleanup());
    };
  }, [providers, refreshWalletAccounts]);

  const connectWalletProvider = useCallback(
    async (providerId: string) => {
      const provider = getProvider(providerId);

      setConnectingProviderId(providerId);

      try {
        await provider.request({ method: "eth_requestAccounts" });
        await refreshWalletAccounts();
      } finally {
        setConnectingProviderId(undefined);
      }
    },
    [getProvider, refreshWalletAccounts]
  );

  const createWalletClientForAddress = useCallback(
    (account: Address, providerId: string) => {
      const provider = getProvider(providerId);

      return createWalletClient({
        account,
        chain: appChain,
        transport: custom(provider),
      });
    },
    [getProvider]
  );

  const getProviderChainId = useCallback(
    async (providerId: string) => {
      const provider = getProvider(providerId);
      const chainId = await provider.request({ method: "eth_chainId" });

      return hexChainIdToNumber(chainId);
    },
    [getProvider]
  );

  const switchProviderToAppChain = useCallback(
    async (providerId: string) => {
      const provider = getProvider(providerId);
      const chainIdHex = `0x${appChain.id.toString(16)}`;

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: number | string }).code
            : undefined;

        if (code !== 4902 && code !== "4902") {
          throw error;
        }

        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: appChain.name,
              nativeCurrency: appChain.nativeCurrency,
              rpcUrls: [...appChain.rpcUrls.default.http],
              blockExplorerUrls: appChain.blockExplorers?.default?.url
                ? [appChain.blockExplorers.default.url]
                : undefined,
            },
          ],
        });
      }

      await refreshWalletAccounts();
    },
    [getProvider, refreshWalletAccounts]
  );

  return {
    appChain,
    walletProviders,
    walletAccounts,
    isWalletConnected: walletAccounts.length > 0,
    connectingProviderId,
    publicClient,
    connectWalletProvider,
    createWalletClientForAddress,
    getProviderChainId,
    refreshWalletAccounts,
    switchProviderToAppChain,
  };
}
