import { useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
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

import { normalizeAddress } from "./lib/db";
import { MAIN_CONNECTOR_ADDRESS } from "./lib/contracts";
import { appChain } from "./lib/wagmi";
import { startBlockchainSyncer } from "./lib/syncer";
import { useMessengerData } from "./hooks/useMessengerData";
import { useMessengerActions } from "./hooks/useMessengerActions";

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

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
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

  const [showDebug, setShowDebug] = useState(false);

  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [chatName, setChatName] = useState("New chat");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [inviteTarget, setInviteTarget] = useState("");
  const [selectedMemberAddress, setSelectedMemberAddress] = useState("");

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

  const {
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
  } = useMessengerActions({
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
    onChatNameChange: setChatName,
    onSelectedChatIdChange: setSelectedChatId,
    onMessageTextChange: setMessageText,
    onInviteTargetChange: setInviteTarget,
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
  }, [addActivity, ownerAddress, publicClient, syncNonce]);

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
