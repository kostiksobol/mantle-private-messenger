import { useCallback, useMemo, useState } from "react";
import type { Address, Hash } from "viem";

import { db } from "@mantle/messenger-core/db";
import { ensureRsaKeyPair, loadRsaKeyPair } from "@mantle/messenger-core/localKeys";
import {
  MAIN_CONNECTOR_ADDRESS,
  mainConnectorAbi,
} from "@mantle/messenger-core/contracts";
import {
  createChat,
  inviteChatMember,
  sendChatMessage,
  type MessengerWriteContext,
} from "@mantle/messenger-core/messenger/writeActions";
import type { MessengerTransactionLayer } from "@mantle/messenger-core/chain/transactionLayer";
import type { LocalChat, SelfProfile } from "../components/types";

type UseMessengerActionsArgs = {
  ownerAddress?: Address;
  publicClient?: any;
  transactions?: MessengerTransactionLayer;
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
  publicClient,
  transactions,
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

  const requireActionContext = useCallback(() => {
    if (!ownerAddress) {
      throw new Error("User address is missing");
    }

    if (!publicClient) {
      throw new Error("Public RPC client is not ready");
    }

    if (!transactions) {
      throw new Error("Transaction layer is not ready");
    }

    if (!MAIN_CONNECTOR_ADDRESS) {
      throw new Error("MainConnector address is not configured");
    }

    return {
      ownerAddress,
      publicClient,
      transactions,
      mainConnectorAddress: MAIN_CONNECTOR_ADDRESS,
    };
  }, [ownerAddress, publicClient, transactions]);

  const wait = useCallback(
    async (hash: Hash) => {
      const ctx = requireActionContext();
      await ctx.publicClient.waitForTransactionReceipt({ hash });
    },
    [requireActionContext]
  );

  const makeWriteContext = useCallback((): MessengerWriteContext => {
    const ctx = requireActionContext();

    if (!selfProfile) {
      throw new Error("Register first");
    }

    return {
      ownerAddress: ctx.ownerAddress,
      publicClient: ctx.publicClient,
      transactions: ctx.transactions,
      selfProfile,
      mainConnectorAddress: ctx.mainConnectorAddress,
      addActivity,
    };
  }, [addActivity, requireActionContext, selfProfile]);

  const handleEnsureKeys = useCallback(async () => {
    await run("ensure RSA keys", async () => {
      if (!ownerAddress) {
        throw new Error("User address is missing");
      }

      await ensureRsaKeyPair(ownerAddress);
      setKeyVersion((value) => value + 1);
    });
  }, [ownerAddress, run]);

  const handleRegister = useCallback(async () => {
    await run("register", async () => {
      const ctx = requireActionContext();
      const keys = await ensureRsaKeyPair(ctx.ownerAddress);

      if (!login.trim()) {
        throw new Error("Login is empty");
      }

      const hash = await ctx.transactions.writeContract({
        address: ctx.mainConnectorAddress,
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
  }, [displayName, login, requireActionContext, run, wait]);

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
