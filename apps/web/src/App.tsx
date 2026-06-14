import { useEffect, useRef, useState } from "react";

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
import { useAppWallet } from "./hooks/useAppWallet";
import { useBlockchainSyncer } from "./hooks/useBlockchainSyncer";
import { useMessengerData } from "./hooks/useMessengerData";
import { useMessengerActions } from "./hooks/useMessengerActions";
import { useIpfsMode } from "./hooks/useIpfsMode";

export default function App() {
  const {
    appChain,
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
  } = useAppWallet();

  const messageScrollerRef = useRef<HTMLDivElement | null>(null);

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

  const { ipfsStatus, ipfsChecking, checkIpfs } = useIpfsMode();

  useBlockchainSyncer({
    ownerAddress,
    publicClient,
    syncNonce,
    addActivity,
  });

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
          await switchToAppChain();
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
        knownUsersByAddress={knownUsersByAddress}
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
        ipfsStatus={ipfsStatus}
        ipfsChecking={ipfsChecking}
        onCheckIpfs={checkIpfs}
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
