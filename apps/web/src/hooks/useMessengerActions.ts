import { useCallback, useMemo, useState } from "react";
import type { Address, Hash } from "viem";

import { db } from "../lib/db";
import { ensureRsaKeyPair, loadRsaKeyPair } from "../lib/localKeys";
import {
  MAIN_CONNECTOR_ADDRESS,
  mainConnectorAbi,
} from "../lib/contracts";
import { appChain } from "../lib/wagmi";
import {
  createChat,
  inviteChatMember,
  sendChatMessage,
  type MessengerWriteContext,
} from "../lib/messenger/writeActions";
import type { LocalChat, SelfProfile } from "../components/types";

type UseMessengerActionsArgs = {
  ownerAddress?: Address;
  chainId?: number;
  publicClient?: any;
  walletClient?: any;
  selfProfile?: SelfProfile;
  selectedChat?: LocalChat;
  login: string;
  displayName: string;
  chatName: string;
  messageText: string;
  inviteTarget: string;
  onChatNameChange: (value: string) => void;
  onSelectedChatIdChange: (value: string) => void;
  onMessageTextChange: (value: string) => void;
  onInviteTargetChange: (value: string) => void;
};

export function useMessengerActions({
  ownerAddress,
  chainId,
  publicClient,
  walletClient,
  selfProfile,
  selectedChat,
  login,
  displayName,
  chatName,
  messageText,
  inviteTarget,
  onChatNameChange,
  onSelectedChatIdChange,
  onMessageTextChange,
  onInviteTargetChange,
}: UseMessengerActionsArgs) {
  const [keyVersion, setKeyVersion] = useState(0);
  const [syncNonce, setSyncNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);

  const rsaKeys = useMemo(() => {
    return ownerAddress ? loadRsaKeyPair(ownerAddress) : undefined;
  }, [ownerAddress, keyVersion]);

  const addActivity = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setActivity((current) => [`${time} ${message}`, ...current].slice(0, 80));
  }, []);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (busy) {
        return;
      }

      setBusy(true);
      addActivity(`${label}: start`);

      try {
        await action();
        addActivity(`${label}: ok`);
      } catch (error) {
        console.error(error);
        addActivity(`${label}: failed`);
        alert(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [addActivity, busy]
  );

  const requireWallet = useCallback(() => {
    if (!ownerAddress) {
      throw new Error("Wallet address is missing");
    }

    if (!publicClient) {
      throw new Error("Public RPC client is not ready");
    }

    if (!walletClient) {
      throw new Error("Wallet signing client is not ready. Reconnect wallet.");
    }

    if (chainId !== appChain.id) {
      throw new Error("Switch wallet to configured network");
    }

    if (!MAIN_CONNECTOR_ADDRESS) {
      throw new Error("MainConnector address is not configured");
    }

    return {
      ownerAddress,
      walletClient,
      publicClient,
      mainConnectorAddress: MAIN_CONNECTOR_ADDRESS,
    };
  }, [chainId, ownerAddress, publicClient, walletClient]);

  const wait = useCallback(
    async (hash: Hash) => {
      const wallet = requireWallet();
      await wallet.publicClient.waitForTransactionReceipt({ hash });
    },
    [requireWallet]
  );

  const makeWriteContext = useCallback((): MessengerWriteContext => {
    const wallet = requireWallet();

    if (!selfProfile) {
      throw new Error("Register first");
    }

    return {
      ownerAddress: wallet.ownerAddress,
      publicClient: wallet.publicClient,
      walletClient: wallet.walletClient,
      selfProfile,
      mainConnectorAddress: wallet.mainConnectorAddress,
      addActivity,
    };
  }, [addActivity, requireWallet, selfProfile]);

  const handleEnsureKeys = useCallback(async () => {
    await run("ensure RSA keys", async () => {
      if (!ownerAddress) {
        throw new Error("Wallet address is missing");
      }

      await ensureRsaKeyPair(ownerAddress);
      setKeyVersion((value) => value + 1);
    });
  }, [ownerAddress, run]);

  const handleRegister = useCallback(async () => {
    await run("register", async () => {
      const wallet = requireWallet();
      const keys = await ensureRsaKeyPair(wallet.ownerAddress);

      if (!login.trim()) {
        throw new Error("Login is empty");
      }

      const hash = await wallet.walletClient.writeContract({
        account: wallet.ownerAddress,
        chain: appChain,
        address: wallet.mainConnectorAddress,
        abi: mainConnectorAbi,
        functionName: "register",
        args: [
          login.trim(),
          displayName.trim() || login.trim(),
          keys.publicKey,
          0,
          "",
        ],
      });

      await wait(hash);

      setKeyVersion((value) => value + 1);
      setSyncNonce((value) => value + 1);
    });
  }, [displayName, login, requireWallet, run, wait]);

  const handleCreateChat = useCallback(async () => {
    await run("create chat", async () => {
      const result = await createChat(makeWriteContext(), {
        name: chatName,
      });

      onChatNameChange("");
      onSelectedChatIdChange(result.chatId);
      setSyncNonce((value) => value + 1);
    });
  }, [
    chatName,
    makeWriteContext,
    onChatNameChange,
    onSelectedChatIdChange,
    run,
  ]);

  const handleSendMessage = useCallback(async (attachmentFiles: File[] = []) => {
    await run("send message", async () => {
      if (!selectedChat) {
        throw new Error("Select chat");
      }

      await sendChatMessage(makeWriteContext(), {
        chat: selectedChat,
        text: messageText,
        files: attachmentFiles,
      });

      onMessageTextChange("");
      setSyncNonce((value) => value + 1);
    });
  }, [
    makeWriteContext,
    messageText,
    onMessageTextChange,
    run,
    selectedChat,
  ]);

  const handleInvite = useCallback(async () => {
    await run("invite user", async () => {
      if (!selectedChat) {
        throw new Error("Select chat");
      }

      await inviteChatMember(makeWriteContext(), {
        chat: selectedChat,
        target: inviteTarget,
      });

      onInviteTargetChange("");
      setSyncNonce((value) => value + 1);
    });
  }, [
    inviteTarget,
    makeWriteContext,
    onInviteTargetChange,
    run,
    selectedChat,
  ]);

  const handleDeleteIndexedDb = useCallback(async () => {
    await run("delete IndexedDB", async () => {
      await db.delete();
      window.location.reload();
    });
  }, [run]);

  return {
    rsaKeys,
    syncNonce,
    busy,
    activity,
    addActivity,
    handleEnsureKeys,
    handleRegister,
    handleCreateChat,
    handleSendMessage,
    handleInvite,
    handleDeleteIndexedDb,
  };
}
