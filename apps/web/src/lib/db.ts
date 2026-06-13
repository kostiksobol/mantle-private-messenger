import Dexie, { type Table } from "dexie";

export type LocalProfile = {
  walletAddress: string;
  login: string;
  name: string;
  pubkey: string;
  userContract: string;
  kind: number;
  metadataURI: string;
};

export type LocalMessage = {
  id: string;
  userContract: string;
  messageIndex: number;
  encryptedContent: string;
  tag: string;
  timestamp: number;
};

export type LocalRecord = {
  id: string;
  mainConnector: string;
  recordIndex: number;
  encryptedRecord: string;
};

export type LocalKeyPair = {
  walletAddress: string;
  publicKey: string;
  privateKey: string;
  createdAt: number;
};

export type SyncState = {
  key: string;
  value: number;
};

class MessengerDatabase extends Dexie {
  profiles!: Table<LocalProfile, string>;
  messages!: Table<LocalMessage, string>;
  records!: Table<LocalRecord, string>;
  keyPairs!: Table<LocalKeyPair, string>;
  syncState!: Table<SyncState, string>;

  constructor() {
    super("mantle-private-messenger");

    this.version(1).stores({
      profiles: "&walletAddress, userContract, login",
      messages: "&id, userContract, [userContract+messageIndex], timestamp",
      syncState: "&key",
    });

    this.version(2).stores({
      profiles: "&walletAddress, userContract, login",
      messages: "&id, userContract, [userContract+messageIndex], timestamp",
      records: "&id, recordIndex",
      syncState: "&key",
    });

    this.version(3).stores({
      profiles: "&walletAddress, userContract, login",
      messages: "&id, userContract, [userContract+messageIndex], timestamp",
      records: "&id, mainConnector, [mainConnector+recordIndex], recordIndex",
      keyPairs: "&walletAddress",
      syncState: "&key",
    });
  }
}

export const db = new MessengerDatabase();

export function normalizeAddress(address: string) {
  return address.toLowerCase();
}

export function messageCursorKey(userContract: string) {
  return `messages:${normalizeAddress(userContract)}`;
}

export function mainConnectorRecordsCursorKey(mainConnector: string) {
  return `records:${normalizeAddress(mainConnector)}`;
}
