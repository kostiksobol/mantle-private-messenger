import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";

import "./style.css";

import {
  OnboardingScreen,
  WrongNetworkScreen,
} from "./components/AuthScreens";
import { ChatSidebar } from "./components/ChatSidebar";
import { ConversationPanel } from "./components/ConversationPanel";
import { DebugPanel } from "./components/DebugPanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { UsersPage } from "./components/UsersPage";

import { normalizeAddress } from "@mantle/messenger-core/db";
import type { MessengerTransactionLayer } from "@mantle/messenger-core/chain/transactionLayer";

import { useAppWallet } from "./hooks/useAppWallet";
import { useBlockchainSyncer } from "./hooks/useBlockchainSyncer";
import { useMessengerData } from "./hooks/useMessengerData";
import { useMessengerActions } from "./hooks/useMessengerActions";
import { useIpfsMode } from "./hooks/useIpfsMode";
import { useIdentityRegistry } from "./hooks/useIdentityRegistry";
import { useIdentityBalances } from "./hooks/useIdentityBalances";

import {
  createLocalSignerAccount,
  listLocalSignerAccounts,
  type LocalSignerAccount,
} from "./identity/localSignerAccounts";
import {
  createBrowserWalletTransactions,
  createLocalSignerTransactions,
} from "./identity/transactions";
import type { WalletAccountInfo } from "./hooks/useAppWallet";

type ActiveIdentity =
  | {
      id: string;
      kind: "wallet";
      address: Address;
      providerId: string;
      providerName: string;
    }
  | {
      id: string;
      kind: "local";
      account: LocalSignerAccount;
      address: Address;
    };

function walletIdentityId(account: Pick<WalletAccountInfo, "providerId" | "address">) {
  return `wallet:${account.providerId}:${normalizeAddress(account.address)}`;
}

function localIdentityId(id: string) {
  return `local:${id}`;
}

export default function App() {
  const {
    appChain,
    walletProviders,
    walletAccounts,
    connectingProviderId,
    publicClient,
    connectWalletProvider,
    createWalletClientForAddress,
    getProviderChainId,
    refreshWalletAccounts,
    switchProviderToAppChain,
  } = useAppWallet();

  const [localAccountsVersion, setLocalAccountsVersion] = useState(0);
  const [activeIdentityId, setActiveIdentityId] = useState("");
  const [selectedWalletChainId, setSelectedWalletChainId] = useState<number>();

  const localAccounts = useMemo(() => {
    return listLocalSignerAccounts();
  }, [localAccountsVersion]);

  const activeIdentity = useMemo<ActiveIdentity | undefined>(() => {
    if (!activeIdentityId) {
      return undefined;
    }

    if (activeIdentityId.startsWith("wallet:")) {
      const account = walletAccounts.find(
        (item) => walletIdentityId(item) === activeIdentityId
      );

      if (!account) {
        return undefined;
      }

      return {
        id: activeIdentityId,
        kind: "wallet",
        address: account.address,
        providerId: account.providerId,
        providerName: account.providerName,
      };
    }

    if (activeIdentityId.startsWith("local:")) {
      const id = activeIdentityId.slice("local:".length);
      const account = localAccounts.find((item) => item.id === id);

      if (!account) {
        return undefined;
      }

      return {
        id: activeIdentityId,
        kind: "local",
        account,
        address: account.address,
      };
    }

    return undefined;
  }, [activeIdentityId, localAccounts, walletAccounts]);

  const ownerAddress = activeIdentity?.address;

  const identityAddresses = useMemo(() => {
    return [
      ...walletAccounts.map((account) => account.address),
      ...localAccounts.map((account) => account.address),
    ];
  }, [localAccounts, walletAccounts]);

  const identityProfilesByAddress = useIdentityRegistry({
    publicClient,
    addresses: identityAddresses,
  });

  const identityBalancesByAddress = useIdentityBalances({
    publicClient,
    addresses: identityAddresses,
    decimals: appChain.nativeCurrency.decimals,
    symbol: appChain.nativeCurrency.symbol,
  });

  useEffect(() => {
    if (!activeIdentity || activeIdentity.kind !== "wallet") {
      setSelectedWalletChainId(undefined);
      return;
    }

    let cancelled = false;

    async function readChainId() {
      const chainId = await getProviderChainId(activeIdentity.providerId);

      if (!cancelled) {
        setSelectedWalletChainId(chainId);
      }
    }

    void readChainId();

    return () => {
      cancelled = true;
    };
  }, [activeIdentity, getProviderChainId]);

  const selectedWalletClient = useMemo(() => {
    if (!activeIdentity || activeIdentity.kind !== "wallet") {
      return undefined;
    }

    try {
      return createWalletClientForAddress(
        activeIdentity.address,
        activeIdentity.providerId
      );
    } catch {
      return undefined;
    }
  }, [activeIdentity, createWalletClientForAddress]);

  const transactions = useMemo<MessengerTransactionLayer | undefined>(() => {
    if (!activeIdentity) {
      return undefined;
    }

    if (activeIdentity.kind === "wallet") {
      if (!selectedWalletClient) {
        return undefined;
      }

      return createBrowserWalletTransactions({
        ownerAddress: activeIdentity.address,
        walletClient: selectedWalletClient,
      });
    }

    return createLocalSignerTransactions({
      privateKey: activeIdentity.account.privateKey,
    });
  }, [activeIdentity, selectedWalletClient]);

  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const previousOwnerAddressRef = useRef<string | undefined>(undefined);

  const [showDebug, setShowDebug] = useState(false);

  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [chatName, setChatName] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [inviteTarget, setInviteTarget] = useState("");
  const [selectedMemberAddress, setSelectedMemberAddress] = useState("");

  useEffect(() => {
    const previousOwnerAddress = previousOwnerAddressRef.current;

    if (previousOwnerAddress === ownerAddress) {
      return;
    }

    previousOwnerAddressRef.current = ownerAddress;

    setLogin("");
    setDisplayName("");
    setChatName("");
    setMessageText("");
    setInviteTarget("");
    setSelectedChatId("");
    setSelectedMemberAddress("");
  }, [ownerAddress]);

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
    handleRegister,
    handleCreateChat,
    handleSendMessage,
    handleInvite,
    handleDeleteIndexedDb,
  } = useMessengerActions({
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

  if (!activeIdentity) {
    return (
      <UsersPage
        appChainName={appChain.name}
        appChainId={appChain.id}
        walletProviders={walletProviders}
        walletAccounts={walletAccounts}
        registeredProfiles={identityProfilesByAddress}
        balances={identityBalancesByAddress}
        connectingProviderId={connectingProviderId}
        localAccounts={localAccounts}
        onConnectWalletProvider={(providerId) => {
          void connectWalletProvider(providerId);
        }}
        onRefreshWalletAccounts={() => {
          void refreshWalletAccounts();
        }}
        onSelectWalletAccount={(account) => {
          setActiveIdentityId(walletIdentityId(account));
        }}
        onCreateLocalAccount={() => {
          createLocalSignerAccount();
          setLocalAccountsVersion((value) => value + 1);
        }}
        onSelectLocalAccount={(account) => {
          setActiveIdentityId(localIdentityId(account.id));
        }}
      />
    );
  }

  const walletWrongNetwork =
    activeIdentity.kind === "wallet" &&
    selectedWalletChainId !== undefined &&
    selectedWalletChainId !== appChain.id;

  if (activeIdentity.kind === "wallet" && walletWrongNetwork) {
    return (
      <WrongNetworkScreen
        currentChainId={selectedWalletChainId}
        appChainName={appChain.name}
        appChainId={appChain.id}
        onSwitchNetwork={async () => {
          await switchProviderToAppChain(activeIdentity.providerId);
          setSelectedWalletChainId(
            await getProviderChainId(activeIdentity.providerId)
          );
        }}
        onDisconnect={() => {
          setActiveIdentityId("");
        }}
      />
    );
  }

  if (!selfProfile || !rsaKeys) {
    return (
      <>
        <button
          className="registrationBackButton"
          onClick={() => {
            setActiveIdentityId("");
          }}
        >
          ← Back to users
        </button>

        <OnboardingScreen
          ownerAddress={ownerAddress}
          appChainName={appChain.name}
          rsaReady={Boolean(rsaKeys)}
          login={login}
          displayName={displayName}
          busy={busy}
          onLoginChange={setLogin}
          onDisplayNameChange={setDisplayName}
          onRegister={handleRegister}
        />
      </>
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
        onDisconnect={() => setActiveIdentityId("")}
      />

      <ConversationPanel
        selectedChat={selectedChat}
        selectedMembers={selectedMembers}
        selectedMessages={selectedMessages}
        knownUsersByAddress={knownUsersByAddress}
        ownerAddress={ownerAddress}
        appChainName={appChain.name}
        ipfsStatus={ipfsStatus}
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
