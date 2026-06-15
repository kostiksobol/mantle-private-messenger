import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
} from "wagmi";

import { normalizeAddress } from "@mantle/messenger-core/db";
import { appChain } from "@mantle/messenger-core/wagmi";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

function getEthereumProvider() {
  const ethereum = (window as unknown as {
    ethereum?: EthereumProvider;
  }).ethereum;

  if (!ethereum) {
    throw new Error("Injected wallet provider is missing");
  }

  return ethereum;
}

function getOptionalEthereumProvider() {
  return (window as unknown as {
    ethereum?: EthereumProvider;
  }).ethereum;
}

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

async function switchInjectedWalletToAppChain() {
  const ethereum = getEthereumProvider();
  const chainIdHex = `0x${appChain.id.toString(16)}`;

  try {
    await ethereum.request({
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

    await ethereum.request({
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
}

export function useAppWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const publicClient = usePublicClient({ chainId: appChain.id });

  const [walletAccounts, setWalletAccounts] = useState<Address[]>([]);

  const ownerAddress = useMemo(() => {
    return address ? toAddress(address) : undefined;
  }, [address]);

  const refreshWalletAccounts = useCallback(async () => {
    const ethereum = getOptionalEthereumProvider();

    if (!ethereum) {
      setWalletAccounts([]);
      return;
    }

    const result = await ethereum.request({ method: "eth_accounts" });
    const accounts = Array.isArray(result) ? result : [];

    setWalletAccounts(
      accounts
        .filter((item): item is string => typeof item === "string")
        .map(toAddress)
    );
  }, []);

  useEffect(() => {
    void refreshWalletAccounts();
  }, [isConnected, ownerAddress, refreshWalletAccounts]);

  useEffect(() => {
    const ethereum = getOptionalEthereumProvider();

    if (!ethereum?.on) {
      return;
    }

    const handleAccountsChanged = () => {
      void refreshWalletAccounts();
    };

    ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [refreshWalletAccounts]);

  const createWalletClientForAddress = useCallback((account: Address) => {
    return createWalletClient({
      account,
      chain: appChain,
      transport: custom(getEthereumProvider()),
    });
  }, []);

  const walletClient = useMemo(() => {
    if (!ownerAddress) {
      return undefined;
    }

    try {
      return createWalletClientForAddress(ownerAddress);
    } catch {
      return undefined;
    }
  }, [createWalletClientForAddress, ownerAddress]);

  const wrongNetwork = isConnected && chainId !== appChain.id;

  const switchToAppChain = useCallback(async () => {
    await switchInjectedWalletToAppChain();
  }, []);

  return {
    appChain,
    address,
    ownerAddress,
    walletAccounts,
    isConnected,
    chainId,
    wrongNetwork,
    connectors,
    connect,
    isConnecting,
    disconnect,
    publicClient,
    walletClient,
    createWalletClientForAddress,
    refreshWalletAccounts,
    switchToAppChain,
  };
}
