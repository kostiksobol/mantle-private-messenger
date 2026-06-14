import { useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type Hash } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
} from "wagmi";

import "./style.css";

import {
  ConnectScreen,
  OnboardingScreen,
  WrongNetworkScreen,
} from "./components/AuthScreens";
import { ChatSidebar } from "./components/ChatSidebar";
import { ConversationPanel } from "./components/ConversationPanel";
import { DebugPanel } from "./components/DebugPanel";
import { DetailsPanel } from "./components/DetailsPanel";

import { aesEncrypt } from "./lib/crypto/aes";
import {
  deriveChatId,
  generateChatKey,
  generateMessageTag,
} from "./lib/crypto/hmac";
import { rsaEncrypt } from "./lib/crypto/rsa";
import { db, normalizeAddress } from "./lib/db";
import { ensureRsaKeyPair, loadRsaKeyPair } from "./lib/localKeys";
import {
  MAIN_CONNECTOR_ADDRESS,
  ZERO_ADDRESS,
  mainConnectorAbi,
  userContractAbi,
} from "./lib/contracts";
import { appChain } from "./lib/wagmi";
import { startBlockchainSyncer } from "./lib/syncer";
import {
  createChatCreationPayload,
  createInvitationPayload,
  createMainInvitationPayload,
  createMessagePayload,
  encodePayload,
} from "./lib/protocol/payloads";
import { useMessengerData } from "./hooks/useMessengerData";

type ChainUser = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

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

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const publicClient = usePublicClient({ chainId: appChain.id });
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);

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

  const [keyVersion, setKeyVersion] = useState(0);
  const [syncNonce, setSyncNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [chatName, setChatName] = useState("New chat");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [inviteTarget, setInviteTarget] = useState("");
  const [selectedMemberAddress, setSelectedMemberAddress] = useState("");

  const rsaKeys = useMemo(() => {
    return ownerAddress ? loadRsaKeyPair(ownerAddress) : undefined;
  }, [ownerAddress, keyVersion]);

  const {
    selfProfile,
    chats,
    knownUsers,
    chatMembers,
    messages,
    knownUsersByAddress,
    selectedChat,
    selectedMembers,
    selectedMessages,
    selectedMember,
    chatsWithPreview,
  } = useMessengerData({
    ownerAddress,
    selectedChatId,
    selectedMemberAddress,
  });

  const wrongNetwork = isConnected && chainId !== appChain.id;

  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].chatId);
    }

    if (
      selectedChatId &&
      chats.length > 0 &&
      !chats.some((chat) => chat.chatId === selectedChatId)
    ) {
      setSelectedChatId(chats[0].chatId);
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    if (selectedMembers.length === 0) {
      setSelectedMemberAddress("");
      return;
    }

    const exists = selectedMembers.some(
      (member) =>
        normalizeAddress(member.userAddress) ===
        normalizeAddress(selectedMemberAddress || "")
    );

    if (!exists) {
      setSelectedMemberAddress(selectedMembers[0].userAddress);
    }
  }, [selectedMembers, selectedMemberAddress]);

  useEffect(() => {
    const scroller = messageScrollerRef.current;

    if (!scroller) {
      return;
    }

    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: "smooth",
    });
  }, [selectedChatId, selectedMessages.length]);

  useEffect(() => {
    if (!ownerAddress || !publicClient || !MAIN_CONNECTOR_ADDRESS) {
      return;
    }

    addActivity("syncer start");

    const stop = startBlockchainSyncer({
      ownerAddress,
      publicClient,
      mainConnectorAddress: MAIN_CONNECTOR_ADDRESS,
    });

    return () => {
      addActivity("syncer stop");
      stop();
    };
  }, [ownerAddress, publicClient, syncNonce]);

  function addActivity(message: string) {
    const time = new Date().toLocaleTimeString();
    setActivity((current) => [`${time} ${message}`, ...current].slice(0, 80));
  }

  async function run(label: string, action: () => Promise<void>) {
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
  }

  function requireWallet() {
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
  }

  async function wait(hash: Hash) {
    const { publicClient } = requireWallet();
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function readUserByAddress(userAddress: Address) {
    const { publicClient, mainConnectorAddress } = requireWallet();

    const user = chainUserFrom(
      await publicClient.readContract({
        address: mainConnectorAddress,
        abi: mainConnectorAbi,
        functionName: "getUserByAddress",
        args: [userAddress],
      })
    );

    if (isZeroAddress(user.userAddress)) {
      return undefined;
    }

    return user;
  }

  async function readUserByLogin(userLogin: string) {
    const { publicClient, mainConnectorAddress } = requireWallet();

    const user = chainUserFrom(
      await publicClient.readContract({
        address: mainConnectorAddress,
        abi: mainConnectorAbi,
        functionName: "getUserByLogin",
        args: [userLogin],
      })
    );

    if (isZeroAddress(user.userAddress)) {
      return undefined;
    }

    return user;
  }

  async function handleEnsureKeys() {
    await run("ensure RSA keys", async () => {
      if (!ownerAddress) {
        throw new Error("Wallet address is missing");
      }

      await ensureRsaKeyPair(ownerAddress);
      setKeyVersion((value) => value + 1);
    });
  }

  async function handleRegister() {
    await run("register", async () => {
      const wallet = requireWallet();
      const keys = await ensureRsaKeyPair(wallet.ownerAddress);

      if (!login.trim()) {
        throw new Error("Login is empty");
      }

      const hash = await wallet.walletClient.writeContract({
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
  }

  async function handleCreateChat() {
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

      const creationHash = await wallet.walletClient.writeContract({
        address: selfProfile.userContract as Address,
        abi: userContractAbi,
        functionName: "addMessage",
        args: [creationBox, creationTag],
      });

      await wait(creationHash);

      const selfInvitationBox = await aesEncrypt(
        chatKey,
        encodePayload(
          createInvitationPayload({
            invited: wallet.ownerAddress,
            invitedBy: wallet.ownerAddress,
          })
        )
      );

      const selfInvitationTag = await generateMessageTag(chatKey);

      const selfInvitationHash = await wallet.walletClient.writeContract({
        address: selfProfile.userContract as Address,
        abi: userContractAbi,
        functionName: "addMessage",
        args: [selfInvitationBox, selfInvitationTag],
      });

      await wait(selfInvitationHash);

      const mainInvitation = await rsaEncrypt(
        keys.publicKey,
        encodePayload(
          createMainInvitationPayload({
            chatKey,
            inviter: wallet.ownerAddress,
          })
        )
      );

      const recordHash = await wallet.walletClient.writeContract({
        address: wallet.mainConnectorAddress,
        abi: mainConnectorAbi,
        functionName: "addRecord",
        args: [mainInvitation],
      });

      await wait(recordHash);

      setChatName("New chat");
      setSelectedChatId(chatId);
      setSyncNonce((value) => value + 1);
    });
  }

  async function handleSendMessage() {
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
        address: selfProfile.userContract as Address,
        abi: userContractAbi,
        functionName: "addMessage",
        args: [encrypted, tag],
      });

      await wait(hash);

      setMessageText("");
      setSyncNonce((value) => value + 1);
    });
  }

  async function handleInvite() {
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
            invitedBy: wallet.ownerAddress,
          })
        )
      );

      const invitationTag = await generateMessageTag(selectedChat.chatKey);

      const messageHash = await wallet.walletClient.writeContract({
        address: selfProfile.userContract as Address,
        abi: userContractAbi,
        functionName: "addMessage",
        args: [invitationEvent, invitationTag],
      });

      await wait(messageHash);

      const mainInvitation = await rsaEncrypt(
        invitedUser.pubkey,
        encodePayload(
          createMainInvitationPayload({
            chatKey: selectedChat.chatKey,
            inviter: wallet.ownerAddress,
          })
        )
      );

      const recordHash = await wallet.walletClient.writeContract({
        address: wallet.mainConnectorAddress,
        abi: mainConnectorAbi,
        functionName: "addRecord",
        args: [mainInvitation],
      });

      await wait(recordHash);

      setInviteTarget("");
      setSyncNonce((value) => value + 1);
    });
  }

  async function handleDeleteIndexedDb() {
    await run("delete IndexedDB", async () => {
      await db.delete();
      window.location.reload();
    });
  }

  if (!isConnected) {
    return (
      <ConnectScreen
        appChainName={appChain.name}
        appChainId={appChain.id}
        disabled={!connectors[0] || isConnecting}
        onConnect={() => {
          if (connectors[0]) {
            connect({ connector: connectors[0] });
          }
        }}
      />
    );
  }

  if (wrongNetwork) {
    return (
      <WrongNetworkScreen
        currentChainId={chainId}
        appChainName={appChain.name}
        appChainId={appChain.id}
        onSwitchNetwork={async () => {
          await switchInjectedWalletToAppChain();
          window.location.reload();
        }}
        onDisconnect={() => disconnect()}
      />
    );
  }

  if (!selfProfile) {
    return (
      <OnboardingScreen
        ownerAddress={ownerAddress}
        appChainName={appChain.name}
        rsaReady={Boolean(rsaKeys)}
        login={login}
        displayName={displayName}
        busy={busy}
        activity={activity}
        onLoginChange={setLogin}
        onDisplayNameChange={setDisplayName}
        onEnsureKeys={handleEnsureKeys}
        onRegister={handleRegister}
        onDisconnect={() => disconnect()}
      />
    );
  }

  return (
    <main className="messengerShell">
      <ChatSidebar
        selfProfile={selfProfile}
        ownerAddress={ownerAddress}
        chatName={chatName}
        selectedChatId={selectedChatId}
        chatsWithPreview={chatsWithPreview}
        busy={busy}
        showDebug={showDebug}
        onChatNameChange={setChatName}
        onCreateChat={handleCreateChat}
        onSelectChat={setSelectedChatId}
        onToggleDebug={() => setShowDebug((value) => !value)}
        onDisconnect={() => disconnect()}
      />

      <ConversationPanel
        selectedChat={selectedChat}
        selectedMembers={selectedMembers}
        selectedMessages={selectedMessages}
        knownUsersByAddress={knownUsersByAddress}
        ownerAddress={ownerAddress}
        appChainName={appChain.name}
        messageText={messageText}
        busy={busy}
        messageScrollerRef={messageScrollerRef}
        onMessageTextChange={setMessageText}
        onSendMessage={handleSendMessage}
      />

      <DetailsPanel
        selectedChat={selectedChat}
        inviteTarget={inviteTarget}
        busy={busy}
        selectedMembers={selectedMembers}
        knownUsersByAddress={knownUsersByAddress}
        selectedMemberAddress={selectedMemberAddress}
        selectedMember={selectedMember}
        onInviteTargetChange={setInviteTarget}
        onInvite={handleInvite}
        onSelectMemberAddress={setSelectedMemberAddress}
      />

      {showDebug && (
        <DebugPanel
          selfProfile={selfProfile}
          activity={activity}
          chats={chats}
          chatMembers={chatMembers}
          knownUsers={knownUsers}
          messages={messages}
          onDeleteIndexedDb={handleDeleteIndexedDb}
        />
      )}
    </main>
  );
}
