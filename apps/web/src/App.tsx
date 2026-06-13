import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useLiveQuery } from "dexie-react-hooks";
import type { Address } from "viem";
import {
  MAIN_CONNECTOR_ADDRESS,
  ZERO_ADDRESS,
  mainConnectorAbi,
  userContractAbi,
} from "./lib/contracts";
import {
  db,
  mainConnectorRecordsCursorKey,
  messageCursorKey,
  normalizeAddress,
  type LocalMessage,
  type LocalRecord,
} from "./lib/db";
import { generateRsaKeyPair, rsaDecrypt, rsaEncrypt } from "./lib/crypto";

type UserStruct = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

type MessageStruct = {
  encryptedContent: string;
  tag: string;
  timestamp: bigint;
};

type DecryptedInvitation = {
  recordIndex: number;
  content: string;
};

function isEmptyAddress(address?: string) {
  return !address || address.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

function App() {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();

  const {
    connectors,
    connect,
    isPending: isConnectPending,
    error: connectError,
  } = useConnect();

  const { disconnect } = useDisconnect();

  const [login, setLogin] = useState("alice");
  const [name, setName] = useState("Alice");
  const [pubkey, setPubkey] = useState("");
  const [kind, setKind] = useState<0 | 1>(0);
  const [metadataURI, setMetadataURI] = useState("");

  const [encryptedContent, setEncryptedContent] = useState("hello encrypted message");
  const [tag, setTag] = useState("demo-tag");

  const [recipientLogin, setRecipientLogin] = useState("alice");
  const [invitationPlaintext, setInvitationPlaintext] = useState(
    '{"type":"invitation","chatId":"demo-chat-1","note":"hello"}'
  );
  const [encryptedRecord, setEncryptedRecord] = useState("");

  const [messageSyncStatus, setMessageSyncStatus] = useState("");
  const [recordSyncStatus, setRecordSyncStatus] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("");
  const [decryptedInvitations, setDecryptedInvitations] = useState<DecryptedInvitation[]>([]);

  const {
    data: user,
    refetch: refetchUser,
    isLoading: isUserLoading,
    error: userError,
  } = useReadContract({
    address: MAIN_CONNECTOR_ADDRESS,
    abi: mainConnectorAbi,
    functionName: "getUserByAddress",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(MAIN_CONNECTOR_ADDRESS && address),
    },
  });

  const typedUser = user as UserStruct | undefined;
  const isRegistered = typedUser && !isEmptyAddress(typedUser.userAddress);
  const userContractAddress =
    isRegistered && typedUser ? typedUser.userContract : undefined;

  const localProfile = useLiveQuery(
    () => {
      if (!address) {
        return undefined;
      }

      return db.profiles.get(normalizeAddress(address));
    },
    [address]
  );

  const localKeyPair = useLiveQuery(
    () => {
      if (!address) {
        return undefined;
      }

      return db.keyPairs.get(normalizeAddress(address));
    },
    [address]
  );

  const localMessages = useLiveQuery(
    () => {
      if (!userContractAddress) {
        return Promise.resolve([] as LocalMessage[]);
      }

      return db.messages
        .where("userContract")
        .equals(normalizeAddress(userContractAddress))
        .sortBy("messageIndex");
    },
    [userContractAddress],
    []
  );

  const localRecords = useLiveQuery(
    () => {
      if (!MAIN_CONNECTOR_ADDRESS) {
        return Promise.resolve([] as LocalRecord[]);
      }

      return db.records
        .where("mainConnector")
        .equals(normalizeAddress(MAIN_CONNECTOR_ADDRESS))
        .sortBy("recordIndex");
    },
    [MAIN_CONNECTOR_ADDRESS],
    [] as LocalRecord[]
  );

  const currentMessageCursor = useLiveQuery(
    async () => {
      if (!userContractAddress) {
        return 0;
      }

      const state = await db.syncState.get(messageCursorKey(userContractAddress));
      return state?.value ?? 0;
    },
    [userContractAddress],
    0
  );

  const currentRecordsCursor = useLiveQuery(
    async () => {
      if (!MAIN_CONNECTOR_ADDRESS) {
        return 0;
      }

      const state = await db.syncState.get(
        mainConnectorRecordsCursorKey(MAIN_CONNECTOR_ADDRESS)
      );

      return state?.value ?? 0;
    },
    [MAIN_CONNECTOR_ADDRESS],
    0
  );

  useEffect(() => {
    async function saveProfile() {
      if (!address || !typedUser || !isRegistered) {
        return;
      }

      await db.profiles.put({
        walletAddress: normalizeAddress(address),
        login: typedUser.login,
        name: typedUser.name,
        pubkey: typedUser.pubkey,
        userContract: normalizeAddress(typedUser.userContract),
        kind: typedUser.kind,
        metadataURI: typedUser.metadataURI,
      });
    }

    saveProfile().catch((error) => {
      console.error("Failed to save profile to IndexedDB", error);
    });
  }, [address, typedUser, isRegistered]);

  const {
    writeContract,
    data: registerHash,
    isPending: isRegisterPending,
    error: registerError,
  } = useWriteContract();

  const {
    isLoading: isRegisterConfirming,
    isSuccess: isRegisterConfirmed,
  } = useWaitForTransactionReceipt({
    hash: registerHash,
    query: {
      enabled: Boolean(registerHash),
    },
  });

  const {
    writeContract: writeUserContract,
    data: addMessageHash,
    isPending: isAddMessagePending,
    error: addMessageError,
  } = useWriteContract();

  const {
    isLoading: isAddMessageConfirming,
    isSuccess: isAddMessageConfirmed,
  } = useWaitForTransactionReceipt({
    hash: addMessageHash,
    query: {
      enabled: Boolean(addMessageHash),
    },
  });

  const {
    writeContract: writeMainConnector,
    data: addRecordHash,
    isPending: isAddRecordPending,
    error: addRecordError,
  } = useWriteContract();

  const {
    isLoading: isAddRecordConfirming,
    isSuccess: isAddRecordConfirmed,
  } = useWaitForTransactionReceipt({
    hash: addRecordHash,
    query: {
      enabled: Boolean(addRecordHash),
    },
  });

  useEffect(() => {
    if (isRegisterConfirmed) {
      refetchUser();
    }
  }, [isRegisterConfirmed, refetchUser]);

  const visibleConnectors = useMemo(() => {
    const seen = new Set<string>();

    return connectors.filter((connector) => {
      const key = `${connector.id}:${connector.name}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [connectors]);

  async function generateKeys() {
    if (!address) {
      setCryptoStatus("Wallet is not connected");
      return;
    }

    setCryptoStatus("Generating RSA keys...");

    const keyPair = await generateRsaKeyPair();
    const walletAddress = normalizeAddress(address);

    await db.keyPairs.put({
      walletAddress,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      createdAt: Date.now(),
    });

    setPubkey(keyPair.publicKey);
    setCryptoStatus("RSA keys generated. Public key is ready for registration.");
  }

  function register() {
    if (!MAIN_CONNECTOR_ADDRESS) {
      alert("VITE_MAIN_CONNECTOR_ADDRESS is not set");
      return;
    }

    if (!pubkey.trim()) {
      alert("Generate RSA keys first");
      return;
    }

    writeContract({
      address: MAIN_CONNECTOR_ADDRESS,
      abi: mainConnectorAbi,
      functionName: "register",
      args: [login, name, pubkey, kind, metadataURI],
      chainId: 31337,
    });
  }

  function addMessage() {
    if (!userContractAddress) {
      alert("UserContract address is missing");
      return;
    }

    writeUserContract({
      address: userContractAddress,
      abi: userContractAbi,
      functionName: "addMessage",
      args: [encryptedContent, tag],
      chainId: 31337,
    });
  }

  function addRecord() {
    if (!MAIN_CONNECTOR_ADDRESS) {
      alert("MainConnector address is missing");
      return;
    }

    if (!encryptedRecord.trim()) {
      alert("Encrypted record is empty");
      return;
    }

    writeMainConnector({
      address: MAIN_CONNECTOR_ADDRESS,
      abi: mainConnectorAbi,
      functionName: "addRecord",
      args: [encryptedRecord],
      chainId: 31337,
    });
  }

  async function encryptInvitationForRecipient() {
    if (!publicClient) {
      setCryptoStatus("Public client is not ready");
      return;
    }

    if (!MAIN_CONNECTOR_ADDRESS) {
      setCryptoStatus("MainConnector address is missing");
      return;
    }

    if (!recipientLogin.trim()) {
      setCryptoStatus("Recipient login is empty");
      return;
    }

    setCryptoStatus(`Loading recipient ${recipientLogin}...`);

    const recipient = (await publicClient.readContract({
      address: MAIN_CONNECTOR_ADDRESS,
      abi: mainConnectorAbi,
      functionName: "getUserByLogin",
      args: [recipientLogin],
    })) as UserStruct;

    if (isEmptyAddress(recipient.userAddress)) {
      setCryptoStatus("Recipient not found");
      return;
    }

    try {
      setCryptoStatus("Encrypting invitation...");
      const encrypted = await rsaEncrypt(recipient.pubkey, invitationPlaintext);
      setEncryptedRecord(encrypted);
      setCryptoStatus("Invitation encrypted. Now click Add record.");
    } catch (error) {
      console.error(error);
      setCryptoStatus(
        "Encryption failed. Recipient public key is probably not a valid generated RSA key."
      );
    }
  }

  async function tryDecryptLocalRecords() {
    if (!address) {
      setCryptoStatus("Wallet is not connected");
      return;
    }

    const keyPair = await db.keyPairs.get(normalizeAddress(address));

    if (!keyPair) {
      setCryptoStatus("No local private key. Generate RSA keys first.");
      return;
    }

    const records = localRecords ?? [];
    const decrypted: DecryptedInvitation[] = [];

    setCryptoStatus("Trying to decrypt local records...");

    for (const record of records) {
      try {
        const content = await rsaDecrypt(keyPair.privateKey, record.encryptedRecord);

        decrypted.push({
          recordIndex: record.recordIndex,
          content,
        });
      } catch {
        // This record was not encrypted for this private key.
      }
    }

    setDecryptedInvitations(decrypted);
    setCryptoStatus(`Decryption finished. Found ${decrypted.length} invitation(s).`);
  }

  async function syncMessages() {
    if (!publicClient) {
      setMessageSyncStatus("Public client is not ready");
      return;
    }

    if (!userContractAddress) {
      setMessageSyncStatus("UserContract address is missing");
      return;
    }

    setMessageSyncStatus("Syncing messages...");

    const normalizedUserContract = normalizeAddress(userContractAddress);
    const cursorKey = messageCursorKey(userContractAddress);
    const currentCursor = (await db.syncState.get(cursorKey))?.value ?? 0;

    const chainMessages = (await publicClient.readContract({
      address: userContractAddress,
      abi: userContractAbi,
      functionName: "getLastMessages",
      args: [BigInt(currentCursor)],
    })) as readonly MessageStruct[];

    if (chainMessages.length === 0) {
      setMessageSyncStatus(`No new messages. Cursor: ${currentCursor}`);
      return;
    }

    const rows: LocalMessage[] = chainMessages.map((message, offset) => {
      const messageIndex = currentCursor + offset;

      return {
        id: `${normalizedUserContract}:${messageIndex}`,
        userContract: normalizedUserContract,
        messageIndex,
        encryptedContent: message.encryptedContent,
        tag: message.tag,
        timestamp: Number(message.timestamp),
      };
    });

    await db.transaction("rw", db.messages, db.syncState, async () => {
      await db.messages.bulkPut(rows);
      await db.syncState.put({
        key: cursorKey,
        value: currentCursor + chainMessages.length,
      });
    });

    setMessageSyncStatus(
      `Synced ${chainMessages.length} message(s). Cursor: ${
        currentCursor + chainMessages.length
      }`
    );
  }

  async function syncRecords() {
    if (!publicClient) {
      setRecordSyncStatus("Public client is not ready");
      return;
    }

    if (!MAIN_CONNECTOR_ADDRESS) {
      setRecordSyncStatus("MainConnector address is missing");
      return;
    }

    setRecordSyncStatus("Syncing records...");

    const normalizedMainConnector = normalizeAddress(MAIN_CONNECTOR_ADDRESS);
    const cursorKey = mainConnectorRecordsCursorKey(MAIN_CONNECTOR_ADDRESS);

    const currentCursor = (await db.syncState.get(cursorKey))?.value ?? 0;

    const chainRecords = (await publicClient.readContract({
      address: MAIN_CONNECTOR_ADDRESS,
      abi: mainConnectorAbi,
      functionName: "getLastRecords",
      args: [BigInt(currentCursor)],
    })) as readonly string[];

    if (chainRecords.length === 0) {
      setRecordSyncStatus(`No new records. Cursor: ${currentCursor}`);
      return;
    }

    const rows: LocalRecord[] = chainRecords.map((record, offset) => {
      const recordIndex = currentCursor + offset;

      return {
        id: `${normalizedMainConnector}:${recordIndex}`,
        mainConnector: normalizedMainConnector,
        recordIndex,
        encryptedRecord: record,
      };
    });

    await db.transaction("rw", db.records, db.syncState, async () => {
      await db.records.bulkPut(rows);
      await db.syncState.put({
        key: cursorKey,
        value: currentCursor + chainRecords.length,
      });
    });

    setRecordSyncStatus(
      `Synced ${chainRecords.length} record(s). Cursor: ${
        currentCursor + chainRecords.length
      }`
    );
  }

  async function refreshUser() {
    await refetchUser();
  }

  if (!MAIN_CONNECTOR_ADDRESS) {
    return (
      <main className="page">
        <section className="card">
          <h1>Messenger</h1>
          <p className="error">VITE_MAIN_CONNECTOR_ADDRESS is not set.</p>
          <p>
            Deploy MainConnector locally and put its address into{" "}
            <code>apps/web/.env.local</code>.
          </p>
        </section>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="page">
        <section className="card">
          <h1>Connect wallet</h1>
          <p>Choose an injected EVM wallet detected by the browser.</p>

          <div className="wallet-list">
            {visibleConnectors.map((connector) => (
              <button
                key={`${connector.id}:${connector.name}`}
                onClick={() => connect({ connector })}
                disabled={isConnectPending}
              >
                {connector.name}
              </button>
            ))}
          </div>

          {visibleConnectors.length === 0 && (
            <p className="error">
              No injected wallet found. Install MetaMask, Rabby, SubWallet EVM,
              or another EVM extension.
            </p>
          )}

          {connectError && <p className="error">{connectError.message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="topbar">
          <div>
            <h1>Private Messenger</h1>
            <p className="muted">Chain: {chain?.name ?? "unknown"}</p>
          </div>

          <button onClick={() => disconnect()}>Disconnect</button>
        </div>

        <div className="address-box">
          <strong>Wallet</strong>
          <code>{address}</code>
        </div>

        <div className="address-box">
          <strong>MainConnector</strong>
          <code>{MAIN_CONNECTOR_ADDRESS}</code>
        </div>

        <section className="profile">
          <h2>Local RSA keys</h2>

          <button onClick={generateKeys}>Generate RSA keys</button>

          {localKeyPair ? (
            <p className="success">Local RSA key pair exists for this wallet.</p>
          ) : (
            <p className="muted">No local RSA keys yet.</p>
          )}

          {cryptoStatus && <p className="muted">{cryptoStatus}</p>}
        </section>

        <button onClick={refreshUser} disabled={isUserLoading}>
          Refresh user
        </button>

        {userError && <p className="error">{userError.message}</p>}
        {isUserLoading && <p>Loading user...</p>}

        {!isUserLoading && !isRegistered && (
          <section className="form">
            <h2>Register account</h2>

            <label>
              Login
              <input
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="alice"
              />
            </label>

            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alice"
              />
            </label>

            <label>
              RSA public key
              <textarea
                value={pubkey}
                onChange={(event) => setPubkey(event.target.value)}
                rows={4}
                placeholder="Click Generate RSA keys first"
              />
            </label>

            <label>
              Account kind
              <select
                value={kind}
                onChange={(event) => setKind(Number(event.target.value) as 0 | 1)}
              >
                <option value={0}>Human</option>
                <option value={1}>Agent</option>
              </select>
            </label>

            <label>
              Metadata URI
              <input
                value={metadataURI}
                onChange={(event) => setMetadataURI(event.target.value)}
                placeholder="optional"
              />
            </label>

            <button
              onClick={register}
              disabled={isRegisterPending || isRegisterConfirming}
            >
              {isRegisterPending || isRegisterConfirming
                ? "Registering..."
                : "Register"}
            </button>

            {registerHash && (
              <p>
                Tx: <code>{registerHash}</code>
              </p>
            )}

            {isRegisterConfirmed && (
              <p className="success">
                Registration confirmed. User profile will refresh automatically.
              </p>
            )}

            {registerError && <p className="error">{registerError.message}</p>}
          </section>
        )}

        {!isUserLoading && isRegistered && typedUser && (
          <>
            <section className="profile">
              <h2>Registered profile</h2>

              <div className="grid">
                <span>Login</span>
                <code>{typedUser.login}</code>

                <span>Name</span>
                <code>{typedUser.name}</code>

                <span>Kind</span>
                <code>{typedUser.kind === 0 ? "Human" : "Agent"}</code>

                <span>UserContract</span>
                <code>{typedUser.userContract}</code>

                <span>Public key</span>
                <code>{typedUser.pubkey}</code>

                <span>Metadata URI</span>
                <code>{typedUser.metadataURI || "-"}</code>
              </div>
            </section>

            <section className="profile">
              <h2>IndexedDB profile cache</h2>

              {!localProfile && <p className="muted">No local profile cached yet.</p>}

              {localProfile && (
                <div className="grid">
                  <span>Wallet</span>
                  <code>{localProfile.walletAddress}</code>

                  <span>Login</span>
                  <code>{localProfile.login}</code>

                  <span>UserContract</span>
                  <code>{localProfile.userContract}</code>
                </div>
              )}
            </section>

            <section className="form">
              <h2>Add demo message to UserContract</h2>

              <label>
                Encrypted content
                <textarea
                  value={encryptedContent}
                  onChange={(event) => setEncryptedContent(event.target.value)}
                  rows={3}
                />
              </label>

              <label>
                Tag
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                />
              </label>

              <button
                onClick={addMessage}
                disabled={isAddMessagePending || isAddMessageConfirming}
              >
                {isAddMessagePending || isAddMessageConfirming
                  ? "Adding message..."
                  : "Add message"}
              </button>

              {addMessageHash && (
                <p>
                  Tx: <code>{addMessageHash}</code>
                </p>
              )}

              {isAddMessageConfirmed && (
                <p className="success">
                  Message confirmed. Click Sync messages.
                </p>
              )}

              {addMessageError && (
                <p className="error">{addMessageError.message}</p>
              )}
            </section>

            <section className="profile">
              <div className="topbar">
                <div>
                  <h2>Local messages from IndexedDB</h2>
                  <p className="muted">Cursor: {currentMessageCursor ?? 0}</p>
                </div>

                <button onClick={syncMessages}>Sync messages</button>
              </div>

              {messageSyncStatus && <p className="muted">{messageSyncStatus}</p>}

              {(!localMessages || localMessages.length === 0) && (
                <p className="muted">No local messages yet.</p>
              )}

              <div className="messages">
                {(localMessages ?? []).map((message) => (
                  <article className="message" key={message.id}>
                    <div>
                      <strong>#{message.messageIndex}</strong>
                    </div>

                    <div>
                      <span>Encrypted content</span>
                      <code>{message.encryptedContent}</code>
                    </div>

                    <div>
                      <span>Tag</span>
                      <code>{message.tag}</code>
                    </div>

                    <div>
                      <span>Timestamp</span>
                      <code>{message.timestamp}</code>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="form">
              <h2>Encrypt invitation record</h2>

              <label>
                Recipient login
                <input
                  value={recipientLogin}
                  onChange={(event) => setRecipientLogin(event.target.value)}
                  placeholder="alice"
                />
              </label>

              <label>
                Invitation plaintext
                <textarea
                  value={invitationPlaintext}
                  onChange={(event) => setInvitationPlaintext(event.target.value)}
                  rows={4}
                />
              </label>

              <button onClick={encryptInvitationForRecipient}>
                Encrypt invitation for recipient
              </button>

              <label>
                Encrypted invitation record
                <textarea
                  value={encryptedRecord}
                  onChange={(event) => setEncryptedRecord(event.target.value)}
                  rows={5}
                  placeholder="Encrypted record will appear here"
                />
              </label>

              <button
                onClick={addRecord}
                disabled={isAddRecordPending || isAddRecordConfirming}
              >
                {isAddRecordPending || isAddRecordConfirming
                  ? "Adding record..."
                  : "Add record to MainConnector"}
              </button>

              {addRecordHash && (
                <p>
                  Tx: <code>{addRecordHash}</code>
                </p>
              )}

              {isAddRecordConfirmed && (
                <p className="success">
                  Record confirmed. Click Sync MainConnector records.
                </p>
              )}

              {addRecordError && (
                <p className="error">{addRecordError.message}</p>
              )}
            </section>

            <section className="profile">
              <div className="topbar">
                <div>
                  <h2>Local MainConnector records from IndexedDB</h2>
                  <p className="muted">Cursor: {currentRecordsCursor ?? 0}</p>
                </div>

                <button onClick={syncRecords}>Sync MainConnector records</button>
              </div>

              {recordSyncStatus && <p className="muted">{recordSyncStatus}</p>}

              {(!localRecords || localRecords.length === 0) && (
                <p className="muted">No local records yet.</p>
              )}

              <div className="messages">
                {(localRecords ?? []).map((record) => (
                  <article className="message" key={record.id}>
                    <div>
                      <strong>#{record.recordIndex}</strong>
                    </div>

                    <div>
                      <span>Encrypted record</span>
                      <code>{record.encryptedRecord}</code>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="profile">
              <div className="topbar">
                <div>
                  <h2>Try decrypt local records</h2>
                  <p className="muted">
                    This tries every local MainConnector record with your local private key.
                  </p>
                </div>

                <button onClick={tryDecryptLocalRecords}>
                  Try decrypt records
                </button>
              </div>

              {decryptedInvitations.length === 0 && (
                <p className="muted">No decrypted invitations yet.</p>
              )}

              <div className="messages">
                {decryptedInvitations.map((invitation) => (
                  <article className="message" key={invitation.recordIndex}>
                    <div>
                      <strong>Record #{invitation.recordIndex}</strong>
                    </div>

                    <div>
                      <span>Decrypted content</span>
                      <code>{invitation.content}</code>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
