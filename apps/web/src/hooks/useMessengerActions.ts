import { useCallback, useMemo, useState } from "react";
import { encodeFunctionData, type Address, type Hash } from "viem";

import { aesEncrypt } from "../lib/crypto/aes";
import {
  deriveChatId,
  generateChatKey,
  generateMessageTag,
} from "../lib/crypto/hmac";
import { rsaEncrypt } from "../lib/crypto/rsa";
import { db, normalizeAddress } from "../lib/db";
import { ensureRsaKeyPair, loadRsaKeyPair } from "../lib/localKeys";
import {
  MAIN_CONNECTOR_ADDRESS,
  ZERO_ADDRESS,
  mainConnectorAbi,
  userContractAbi,
} from "../lib/contracts";
import { appChain } from "../lib/wagmi";
import { tryWalletSendCallsBatch } from "../lib/walletBatch";
import {
  createChatCreationPayload,
  createInvitationPayload,
  createMainInvitationPayload,
  createMessagePayload,
  encodePayload,
} from "../lib/protocol/payloads";
import type { LocalChat, SelfProfile } from "../components/types";

type ChainUser = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

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

function chainUserFrom(value: unknown): ChainUser {
  const item = value as Partial<ChainUser> & Record<number, unknown>;

  return {
    userAddress: (item.userAddress ?? item[0]) as Address,
    login: String(item.login ?? item[1] ?? ""),
    name: String(item.name ?? item[2] ?? ""),
    pubkey: String(item.pubkey ?? item[3] ?? ""),
    userContract: (item.userContract ?? item[4]) as Address,
    kind: Number(item.kind ?? item[5] ?? 0),
    metadataURI: String(item.metadataURI ?? item[6] ?? ""),
  };
}

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

function isZeroAddress(address: string) {
  return normalizeAddress(address) === ZERO_ADDRESS;
}

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

  const readUserByAddress = useCallback(
    async (userAddress: Address) => {
      const wallet = requireWallet();

      const user = chainUserFrom(
        await wallet.publicClient.readContract({
          address: wallet.mainConnectorAddress,
          abi: mainConnectorAbi,
          functionName: "getUserByAddress",
          args: [userAddress],
        })
      );

      if (isZeroAddress(user.userAddress)) {
        return undefined;
      }

      return user;
    },
    [requireWallet]
  );

  const readUserByLogin = useCallback(
    async (userLogin: string) => {
      const wallet = requireWallet();

      const user = chainUserFrom(
        await wallet.publicClient.readContract({
          address: wallet.mainConnectorAddress,
          abi: mainConnectorAbi,
          functionName: "getUserByLogin",
          args: [userLogin],
        })
      );

      if (isZeroAddress(user.userAddress)) {
        return undefined;
      }

      return user;
    },
    [requireWallet]
  );

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
      const wallet = requireWallet();

      if (!selfProfile) {
        throw new Error("Register first");
      }

      const keys = await ensureRsaKeyPair(wallet.ownerAddress);

      const chatKey = generateChatKey();
      const chatId = await deriveChatId(chatKey);

      const creationBox = await aesEncrypt(
        chatKey,
        encodePayload(
          createChatCreationPayload({
            name: chatName.trim() || "Unnamed chat",
          })
        )
      );

      const creationTag = await generateMessageTag(chatKey);

      const mainInvitation = await rsaEncrypt(
        keys.publicKey,
        encodePayload(
          createMainInvitationPayload({
            chatKey,
            creator: wallet.ownerAddress,
          })
        )
      );

      const batched = await tryWalletSendCallsBatch({
        from: wallet.ownerAddress,
        chainId: appChain.id,
        calls: [
          {
            to: selfProfile.userContract as Address,
            data: encodeFunctionData({
              abi: userContractAbi,
              functionName: "addMessage",
              args: [creationBox, creationTag],
            }),
          },
          {
            to: wallet.mainConnectorAddress,
            data: encodeFunctionData({
              abi: mainConnectorAbi,
              functionName: "addRecord",
              args: [mainInvitation],
            }),
          },
        ],
      });

      if (!batched) {
        const creationHash = await wallet.walletClient.writeContract({
          account: wallet.ownerAddress,
          chain: appChain,
          address: selfProfile.userContract as Address,
          abi: userContractAbi,
          functionName: "addMessage",
          args: [creationBox, creationTag],
        });

        await wait(creationHash);

        const recordHash = await wallet.walletClient.writeContract({
          account: wallet.ownerAddress,
          chain: appChain,
          address: wallet.mainConnectorAddress,
          abi: mainConnectorAbi,
          functionName: "addRecord",
          args: [mainInvitation],
        });

        await wait(recordHash);
      }

      onChatNameChange("New chat");
      onSelectedChatIdChange(chatId);
      setSyncNonce((value) => value + 1);
    });
  }, [
    chatName,
    onChatNameChange,
    onSelectedChatIdChange,
    requireWallet,
    run,
    selfProfile,
    wait,
  ]);

  const handleSendMessage = useCallback(async () => {
    await run("send message", async () => {
      const wallet = requireWallet();

      if (!selfProfile) {
        throw new Error("Register first");
      }

      if (!selectedChat) {
        throw new Error("Select chat");
      }

      if (!messageText.trim()) {
        throw new Error("Message is empty");
      }

      const encrypted = await aesEncrypt(
        selectedChat.chatKey,
        encodePayload(
          createMessagePayload({
            text: messageText.trim(),
          })
        )
      );

      const tag = await generateMessageTag(selectedChat.chatKey);

      const hash = await wallet.walletClient.writeContract({
        account: wallet.ownerAddress,
        chain: appChain,
        address: selfProfile.userContract as Address,
        abi: userContractAbi,
        functionName: "addMessage",
        args: [encrypted, tag],
      });

      await wait(hash);

      onMessageTextChange("");
      setSyncNonce((value) => value + 1);
    });
  }, [
    messageText,
    onMessageTextChange,
    requireWallet,
    run,
    selectedChat,
    selfProfile,
    wait,
  ]);

  const handleInvite = useCallback(async () => {
    await run("invite user", async () => {
      const wallet = requireWallet();

      if (!selfProfile) {
        throw new Error("Register first");
      }

      if (!selectedChat) {
        throw new Error("Select chat");
      }

      const target = inviteTarget.trim();

      if (!target) {
        throw new Error("Invite target is empty");
      }

      const invitedUser =
        target.startsWith("0x") && target.length === 42
          ? await readUserByAddress(toAddress(target))
          : await readUserByLogin(target);

      if (!invitedUser) {
        throw new Error("User not found");
      }

      const invitationEvent = await aesEncrypt(
        selectedChat.chatKey,
        encodePayload(
          createInvitationPayload({
            invited: toAddress(invitedUser.userAddress),
          })
        )
      );

      const invitationTag = await generateMessageTag(selectedChat.chatKey);

      const mainInvitation = await rsaEncrypt(
        invitedUser.pubkey,
        encodePayload(
          createMainInvitationPayload({
            chatKey: selectedChat.chatKey,
            creator: toAddress(selectedChat.creatorAddress),
          })
        )
      );

      const batched = await tryWalletSendCallsBatch({
        from: wallet.ownerAddress,
        chainId: appChain.id,
        calls: [
          {
            to: wallet.mainConnectorAddress,
            data: encodeFunctionData({
              abi: mainConnectorAbi,
              functionName: "addRecord",
              args: [mainInvitation],
            }),
          },
          {
            to: selfProfile.userContract as Address,
            data: encodeFunctionData({
              abi: userContractAbi,
              functionName: "addMessage",
              args: [invitationEvent, invitationTag],
            }),
          },
        ],
      });

      if (!batched) {
        const recordHash = await wallet.walletClient.writeContract({
          account: wallet.ownerAddress,
          chain: appChain,
          address: wallet.mainConnectorAddress,
          abi: mainConnectorAbi,
          functionName: "addRecord",
          args: [mainInvitation],
        });

        await wait(recordHash);

        const messageHash = await wallet.walletClient.writeContract({
          account: wallet.ownerAddress,
          chain: appChain,
          address: selfProfile.userContract as Address,
          abi: userContractAbi,
          functionName: "addMessage",
          args: [invitationEvent, invitationTag],
        });

        await wait(messageHash);
      }

      onInviteTargetChange("");
      setSyncNonce((value) => value + 1);
    });
  }, [
    inviteTarget,
    onInviteTargetChange,
    readUserByAddress,
    readUserByLogin,
    requireWallet,
    run,
    selectedChat,
    selfProfile,
    wait,
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
