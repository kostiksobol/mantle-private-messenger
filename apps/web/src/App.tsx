import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createWalletClient, custom, type Address, type Hash } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
} from "wagmi";

import "./style.css";

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

function shortAddress(address?: string) {
  if (!address) {
    return "—";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function initials(value?: string) {
  if (!value) {
    return "?";
  }

  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function formatTime(timestamp: number) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(timestamp: number) {
  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp * 1000).toLocaleString();
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

  const selfProfile = useLiveQuery(async () => {
    if (!ownerAddress) {
      return undefined;
    }

    return db.selfProfiles
      .where("ownerAddress")
      .equals(ownerAddress)
      .first();
  }, [ownerAddress]);

  const chats = useLiveQuery(async () => {
    if (!ownerAddress) {
      return [];
    }

    return db.chats
      .where("ownerAddress")
      .equals(ownerAddress)
      .toArray();
  }, [ownerAddress]) ?? [];

  const knownUsers = useLiveQuery(async () => {
    if (!ownerAddress) {
      return [];
    }

    return db.knownUsers
      .where("ownerAddress")
      .equals(ownerAddress)
      .toArray();
  }, [ownerAddress]) ?? [];

  const chatMembers = useLiveQuery(async () => {
    if (!ownerAddress) {
      return [];
    }

    return db.chatMembers
      .where("ownerAddress")
      .equals(ownerAddress)
      .toArray();
  }, [ownerAddress]) ?? [];

  const messages = useLiveQuery(async () => {
    if (!ownerAddress) {
      return [];
    }

    const result = await db.messages
      .where("ownerAddress")
      .equals(ownerAddress)
      .toArray();

    return result.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }

      return a.sourceMessageIndex - b.sourceMessageIndex;
    });
  }, [ownerAddress]) ?? [];

  const knownUsersByAddress = useMemo(() => {
    const map = new Map<string, (typeof knownUsers)[number]>();

    for (const user of knownUsers) {
      map.set(normalizeAddress(user.userAddress), user);
    }

    return map;
  }, [knownUsers]);

  const selectedChat = chats.find((chat) => chat.chatId === selectedChatId);

  const selectedMembers = chatMembers.filter(
    (member) => member.chatId === selectedChatId
  );

  const selectedMessages = messages.filter(
    (message) => message.chatId === selectedChatId
  );

  const selectedMember = selectedMemberAddress
    ? knownUsersByAddress.get(normalizeAddress(selectedMemberAddress))
    : undefined;

  const chatsWithPreview = useMemo(() => {
    return chats
      .map((chat) => {
        const chatMessages = messages.filter(
          (message) => message.chatId === chat.chatId
        );

        const lastMessage = chatMessages[chatMessages.length - 1];

        return {
          chat,
          lastMessage,
          membersCount: chatMembers.filter(
            (member) => member.chatId === chat.chatId
          ).length,
        };
      })
      .sort((a, b) => {
        const left = a.lastMessage?.timestamp ?? 0;
        const right = b.lastMessage?.timestamp ?? 0;

        if (left !== right) {
          return right - left;
        }

        return a.chat.name.localeCompare(b.chat.name);
      });
  }, [chats, chatMembers, messages]);

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
      <main className="authPage">
        <section className="authCard">
          <div className="brandMark">M</div>

          <h1>Private Messenger</h1>

          <p>
            Wallet-native encrypted messaging over EVM contracts.
          </p>

          <button
            className="primaryButton full"
            onClick={() => connect({ connector: connectors[0] })}
            disabled={!connectors[0] || isConnecting}
          >
            Connect wallet
          </button>

          <div className="authHint">
            Configured network: {appChain.name} · {appChain.id}
          </div>
        </section>
      </main>
    );
  }

  if (wrongNetwork) {
    return (
      <main className="authPage">
        <section className="authCard">
          <div className="brandMark warning">!</div>

          <h1>Wrong network</h1>

          <p>
            Your wallet is on chain {chainId}. This app is configured for{" "}
            {appChain.name} / {appChain.id}.
          </p>

          <button
            className="primaryButton full"
            onClick={async () => {
              await switchInjectedWalletToAppChain();
              window.location.reload();
            }}
          >
            Switch network
          </button>

          <button className="ghostButton full" onClick={() => disconnect()}>
            Disconnect
          </button>
        </section>
      </main>
    );
  }

  if (!selfProfile) {
    return (
      <main className="authPage">
        <section className="authCard onboardingCard">
          <div className="brandMark">M</div>

          <h1>Create profile</h1>

          <p>
            Register an on-chain profile. Your RSA key stays in localStorage.
          </p>

          <div className="statusPills">
            <span>{shortAddress(ownerAddress)}</span>
            <span>{appChain.name}</span>
            <span className={rsaKeys ? "greenPill" : "yellowPill"}>
              RSA {rsaKeys ? "ready" : "missing"}
            </span>
          </div>

          <input
            placeholder="Login"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />

          <input
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <div className="splitButtons">
            <button disabled={busy} onClick={handleEnsureKeys}>
              Ensure RSA
            </button>

            <button
              className="primaryButton"
              disabled={busy || !login.trim()}
              onClick={handleRegister}
            >
              Register
            </button>
          </div>

          <button className="ghostButton full" onClick={() => disconnect()}>
            Disconnect
          </button>

          <div className="miniActivity">
            {activity.slice(0, 6).map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="messengerShell">
      <aside className="chatSidebar">
        <header className="sidebarHeader">
          <div>
            <div className="sidebarTitle">Chats</div>
            <div className="sidebarSubtitle">
              {selfProfile.login} · {shortAddress(ownerAddress)}
            </div>
          </div>

          <button
            className="roundButton"
            title="Disconnect"
            onClick={() => disconnect()}
          >
            ⎋
          </button>
        </header>

        <section className="newChatBox">
          <input
            placeholder="New chat name"
            value={chatName}
            onChange={(event) => setChatName(event.target.value)}
          />

          <button disabled={busy} onClick={handleCreateChat}>
            Create
          </button>
        </section>

        <nav className="chatList">
          {chatsWithPreview.length === 0 ? (
            <div className="emptyState small">
              <strong>No chats yet</strong>
              <span>Create your first encrypted chat.</span>
            </div>
          ) : (
            chatsWithPreview.map(({ chat, lastMessage, membersCount }) => (
              <button
                key={chat.chatId}
                className={
                  chat.chatId === selectedChatId
                    ? "chatItem active"
                    : "chatItem"
                }
                onClick={() => setSelectedChatId(chat.chatId)}
              >
                <div className="avatar">
                  {initials(chat.name)}
                </div>

                <div className="chatItemBody">
                  <div className="chatItemTop">
                    <span>{chat.name}</span>
                    <time>{lastMessage ? formatTime(lastMessage.timestamp) : ""}</time>
                  </div>

                  <div className="chatPreview">
                    {lastMessage
                      ? lastMessage.content
                      : `${membersCount} member${membersCount === 1 ? "" : "s"}`}
                  </div>
                </div>
              </button>
            ))
          )}
        </nav>

        <footer className="sidebarFooter">
          <button
            className="ghostButton full"
            onClick={() => setShowDebug((value) => !value)}
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </footer>
      </aside>

      <section className="conversationPanel">
        {selectedChat ? (
          <>
            <header className="conversationHeader">
              <div>
                <h1>{selectedChat.name}</h1>
                <p>
                  {selectedMembers.length} members · {selectedMessages.length} messages
                </p>
              </div>

              <div className="networkBadge">
                {appChain.name}
              </div>
            </header>

            <div ref={messageScrollerRef} className="messageScroller">
              {selectedMessages.length === 0 ? (
                <div className="emptyConversation">
                  <span>No visible messages yet.</span>
                </div>
              ) : (
                selectedMessages.map((message) => {
                  const isMine =
                    normalizeAddress(message.authorAddress) === ownerAddress;

                  const author = knownUsersByAddress.get(
                    normalizeAddress(message.authorAddress)
                  );

                  const authorName =
                    author?.name ||
                    author?.login ||
                    shortAddress(message.authorAddress);

                  return (
                    <article
                      key={message.id}
                      className={isMine ? "messageBubble mine" : "messageBubble"}
                    >
                      {!isMine && (
                        <div className="messageAuthor">
                          {authorName}
                        </div>
                      )}

                      <div className="messageText">
                        {message.content}
                      </div>

                      <div className="messageMeta">
                        <span>{formatTime(message.timestamp)}</span>
                        <span>#{message.sourceMessageIndex}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSendMessage();
              }}
            >
              <textarea
                placeholder="Write a message..."
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
              />

              <button disabled={busy || !messageText.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="noChatSelected">
            <div className="brandMark">M</div>
            <h1>Select a chat</h1>
            <p>Choose a chat from the left sidebar or create a new one.</p>
          </div>
        )}
      </section>

      <aside className="detailsPanel">
        <header className="detailsHeader">
          <h2>Chat info</h2>
          <p>{selectedChat?.name || "No chat selected"}</p>
        </header>

        {selectedChat ? (
          <>
            <section className="inviteBox">
              <label>Invite user</label>

              <div className="inviteRow">
                <input
                  placeholder="login or 0x address"
                  value={inviteTarget}
                  onChange={(event) => setInviteTarget(event.target.value)}
                />

                <button
                  disabled={busy || !inviteTarget.trim()}
                  onClick={handleInvite}
                >
                  Invite
                </button>
              </div>
            </section>

            <section className="membersBox">
              <h3>Members</h3>

              <div className="memberList">
                {selectedMembers.map((member) => {
                  const user = knownUsersByAddress.get(
                    normalizeAddress(member.userAddress)
                  );

                  const name =
                    user?.name ||
                    user?.login ||
                    shortAddress(member.userAddress);

                  const active =
                    normalizeAddress(member.userAddress) ===
                    normalizeAddress(selectedMemberAddress || "");

                  return (
                    <button
                      key={`${member.chatId}:${member.userAddress}`}
                      className={active ? "memberItem active" : "memberItem"}
                      onClick={() => setSelectedMemberAddress(member.userAddress)}
                    >
                      <div className="avatar memberAvatar">
                        {initials(name)}
                      </div>

                      <div>
                        <div className="memberName">{name}</div>
                        <div className="memberMeta">
                          {shortAddress(member.userAddress)} · cursor {member.cursor}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="memberDetails">
              <h3>Participant details</h3>

              {selectedMember ? (
                <dl>
                  <dt>Login</dt>
                  <dd>{selectedMember.login}</dd>

                  <dt>Name</dt>
                  <dd>{selectedMember.name}</dd>

                  <dt>Address</dt>
                  <dd>{selectedMember.userAddress}</dd>

                  <dt>Contract</dt>
                  <dd>{selectedMember.userContract}</dd>

                  <dt>Kind</dt>
                  <dd>{selectedMember.kind === 0 ? "Human" : "Agent"}</dd>

                  <dt>Metadata</dt>
                  <dd>{selectedMember.metadataURI || "—"}</dd>
                </dl>
              ) : selectedMemberAddress ? (
                <dl>
                  <dt>Address</dt>
                  <dd>{selectedMemberAddress}</dd>
                </dl>
              ) : (
                <p className="muted">
                  Select a participant to inspect profile data.
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="emptyState">
            Select a chat to see participants.
          </div>
        )}
      </aside>

      {showDebug && (
        <section className="debugPanel">
          <header>
            <div>
              <h2>Debug</h2>
              <p>IndexedDB, sync activity and cursors.</p>
            </div>

            <button className="dangerButton" onClick={handleDeleteIndexedDb}>
              Delete IndexedDB
            </button>
          </header>

          <div className="debugGrid">
            <div>
              <h3>Profile</h3>
              <pre>{JSON.stringify(selfProfile, null, 2)}</pre>
            </div>

            <div>
              <h3>Activity</h3>
              <pre>{activity.join("\n")}</pre>
            </div>

            <div>
              <h3>Chats</h3>
              <pre>{JSON.stringify(chats, null, 2)}</pre>
            </div>

            <div>
              <h3>Members</h3>
              <pre>{JSON.stringify(chatMembers, null, 2)}</pre>
            </div>

            <div>
              <h3>Messages</h3>
              <pre>
                {JSON.stringify(
                  messages.map((message) => ({
                    ...message,
                    time: formatDateTime(message.timestamp),
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
