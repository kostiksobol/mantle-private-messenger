import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createWalletClient, custom, type Address } from "viem";
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

function shortAddress(address?: string) {
  if (!address) {
    return "—";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isZeroAddress(address: string) {
  return normalizeAddress(address) === ZERO_ADDRESS;
}

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

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

export default function App() {
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

  const [keyVersion, setKeyVersion] = useState(0);
  const [syncNonce, setSyncNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [chatName, setChatName] = useState("Demo chat");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [inviteTarget, setInviteTarget] = useState("");

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

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }, [ownerAddress]) ?? [];

  const selectedChat = chats.find((chat) => chat.chatId === selectedChatId);
  const selectedMessages = messages.filter(
    (message) => message.chatId === selectedChatId
  );
  const selectedMembers = chatMembers.filter(
    (member) => member.chatId === selectedChatId
  );

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
    if (!ownerAddress || !publicClient || !MAIN_CONNECTOR_ADDRESS) {
      return;
    }

    addLog("syncer start");

    const stop = startBlockchainSyncer({
      ownerAddress,
      publicClient,
      mainConnectorAddress: MAIN_CONNECTOR_ADDRESS,
    });

    return () => {
      addLog("syncer stop");
      stop();
    };
  }, [ownerAddress, publicClient, syncNonce]);

  function addLog(message: string) {
    const time = new Date().toLocaleTimeString();

    setLog((current) => [`${time} ${message}`, ...current].slice(0, 80));
  }

  async function run(label: string, action: () => Promise<void>) {
    if (busy) {
      return;
    }

    setBusy(true);
    addLog(`${label}: start`);

    try {
      await action();
      addLog(`${label}: ok`);
    } catch (error) {
      console.error(error);
      addLog(`${label}: failed`);
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

  async function wait(hash: Address | `0x${string}`) {
    const { publicClient } = requireWallet();
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function readUserByAddress(userAddress: Address) {
    const { publicClient, mainConnectorAddress } = requireWallet();

    const user = chainUserFrom(await publicClient.readContract({
      address: mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "getUserByAddress",
      args: [userAddress],
    }));

    if (isZeroAddress(user.userAddress)) {
      return undefined;
    }

    return user;
  }

  async function readUserByLogin(userLogin: string) {
    const { publicClient, mainConnectorAddress } = requireWallet();

    const user = chainUserFrom(await publicClient.readContract({
      address: mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "getUserByLogin",
      args: [userLogin],
    }));

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

  const wrongNetwork = isConnected && chainId !== appChain.id;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">Mantle Private Messenger</div>
          <h1>Dev console</h1>
          <p>
            Debug UI для проверки регистрации, чатов, сообщений, инвайтов,
            IndexedDB и blockchain syncer.
          </p>
        </div>

        <div className="heroActions">
          {!isConnected ? (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              disabled={!connectors[0] || isConnecting}
            >
              Connect wallet
            </button>
          ) : (
            <button className="secondary" onClick={() => disconnect()}>
              Disconnect
            </button>
          )}

          {wrongNetwork && (
            <button
              onClick={async () => {
                await switchInjectedWalletToAppChain();
                window.location.reload();
              }}
            >
              Switch to configured network
            </button>
          )}
        </div>
      </section>

      <section className="grid topGrid">
        <div className="card">
          <h2>Wallet</h2>
          <dl>
            <dt>Address</dt>
            <dd>{ownerAddress || "—"}</dd>

            <dt>Network</dt>
            <dd className={wrongNetwork ? "bad" : "good"}>
              {chainId || "—"}
            </dd>

            <dt>MainConnector</dt>
            <dd>{MAIN_CONNECTOR_ADDRESS || "—"}</dd>

            <dt>RSA key</dt>
            <dd className={rsaKeys ? "good" : "bad"}>
              {rsaKeys ? "exists" : "missing"}
            </dd>
          </dl>

          <div className="row">
            <button disabled={!isConnected || busy} onClick={handleEnsureKeys}>
              Ensure RSA keys
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={handleDeleteIndexedDb}
            >
              Delete IndexedDB
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Self profile</h2>
          {selfProfile ? (
            <dl>
              <dt>Login</dt>
              <dd>{selfProfile.login}</dd>

              <dt>Name</dt>
              <dd>{selfProfile.name}</dd>

              <dt>UserContract</dt>
              <dd>{selfProfile.userContract}</dd>

              <dt>Main cursor</dt>
              <dd>{selfProfile.mainRecordsCursor}</dd>
            </dl>
          ) : (
            <p className="muted">Not registered / not synced yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Register</h2>
          <input
            placeholder="login"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
          <input
            placeholder="display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button
            disabled={!isConnected || wrongNetwork || busy}
            onClick={handleRegister}
          >
            Register
          </button>
        </div>
      </section>

      <section className="grid actionGrid">
        <div className="card">
          <h2>Create chat</h2>
          <input
            placeholder="chat name"
            value={chatName}
            onChange={(event) => setChatName(event.target.value)}
          />
          <button
            disabled={!selfProfile || wrongNetwork || busy}
            onClick={handleCreateChat}
          >
            Create chat
          </button>
        </div>

        <div className="card">
          <h2>Send message</h2>
          <select
            value={selectedChatId}
            onChange={(event) => setSelectedChatId(event.target.value)}
          >
            <option value="">Select chat</option>
            {chats.map((chat) => (
              <option key={chat.chatId} value={chat.chatId}>
                {chat.name} / {shortAddress(chat.chatId)}
              </option>
            ))}
          </select>
          <textarea
            placeholder="message"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
          />
          <button
            disabled={!selectedChat || !selfProfile || wrongNetwork || busy}
            onClick={handleSendMessage}
          >
            Send
          </button>
        </div>

        <div className="card">
          <h2>Invite</h2>
          <input
            placeholder="login or 0x address"
            value={inviteTarget}
            onChange={(event) => setInviteTarget(event.target.value)}
          />
          <button
            disabled={!selectedChat || !selfProfile || wrongNetwork || busy}
            onClick={handleInvite}
          >
            Invite
          </button>
        </div>
      </section>

      <section className="grid dataGrid">
        <div className="card wide">
          <h2>Chats</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Chat ID</th>
                <th>Key</th>
              </tr>
            </thead>
            <tbody>
              {chats.map((chat) => (
                <tr
                  key={chat.chatId}
                  className={chat.chatId === selectedChatId ? "selected" : ""}
                  onClick={() => setSelectedChatId(chat.chatId)}
                >
                  <td>{chat.name}</td>
                  <td>{chat.chatId}</td>
                  <td>{shortAddress(chat.chatKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Selected chat</h2>
          {selectedChat ? (
            <dl>
              <dt>Name</dt>
              <dd>{selectedChat.name}</dd>
              <dt>Chat ID</dt>
              <dd>{selectedChat.chatId}</dd>
              <dt>Members</dt>
              <dd>{selectedMembers.length}</dd>
              <dt>Messages</dt>
              <dd>{selectedMessages.length}</dd>
            </dl>
          ) : (
            <p className="muted">No chat selected.</p>
          )}
        </div>
      </section>

      <section className="grid dataGrid">
        <div className="card wide">
          <h2>Messages</h2>
          <div className="messages">
            {selectedMessages.map((message) => (
              <article key={message.id} className="message">
                <div className="messageMeta">
                  <span>{shortAddress(message.authorAddress)}</span>
                  <span>
                    {new Date(message.timestamp * 1000).toLocaleString()}
                  </span>
                  <span>#{message.sourceMessageIndex}</span>
                </div>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Chat members</h2>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Cursor</th>
              </tr>
            </thead>
            <tbody>
              {selectedMembers.map((member) => (
                <tr key={member.id}>
                  <td>{shortAddress(member.userAddress)}</td>
                  <td>{member.cursor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid dataGrid">
        <div className="card wide">
          <h2>Known users</h2>
          <table>
            <thead>
              <tr>
                <th>Login</th>
                <th>Name</th>
                <th>Address</th>
                <th>UserContract</th>
              </tr>
            </thead>
            <tbody>
              {knownUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.login}</td>
                  <td>{user.name}</td>
                  <td>{user.userAddress}</td>
                  <td>{user.userContract}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card logCard">
          <h2>Activity</h2>
          <div className="log">
            {log.map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
