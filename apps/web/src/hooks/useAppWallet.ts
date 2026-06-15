import { useCallback, useMemo } from "react";
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

  const ownerAddress = useMemo(() => {
    return address ? toAddress(address) : undefined;
  }, [address]);

  const walletClient = useMemo(() => {
    if (!ownerAddress) {
      return undefined;
    }

    try {
      return createWalletClient({
        account: ownerAddress,
        chain: appChain,
        transport: custom(getEthereumProvider()),
      });
    } catch {
      return undefined;
    }
  }, [ownerAddress]);

  const wrongNetwork = isConnected && chainId !== appChain.id;

  const switchToAppChain = useCallback(async () => {
    await switchInjectedWalletToAppChain();
  }, []);

  return {
    appChain,
    address,
    ownerAddress,
    isConnected,
    chainId,
    wrongNetwork,
    connectors,
    connect,
    isConnecting,
    disconnect,
    publicClient,
    walletClient,
    switchToAppChain,
  };
}
