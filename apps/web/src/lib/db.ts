import Dexie, { type Table } from "dexie";

const appNetwork = import.meta.env.VITE_APP_NETWORK || "anvil";
const databaseName = `mantle-private-messenger:${appNetwork}`;

export type SelfProfile = {
  id?: number;

  ownerAddress: string;

  login: string;
  name: string;
  pubkey: string;
  userContract: string;
  kind: number;
  metadataURI: string;

  mainRecordsCursor: number;
};

export type KnownUser = {
  id?: number;

  ownerAddress: string;

  userAddress: string;
  login: string;
  name: string;
  pubkey: string;
  userContract: string;
  kind: number;
  metadataURI: string;
};

export type LocalChat = {
  id?: number;
  ownerAddress: string;
  chatId: string;
  name: string;
  chatKey: string;
  creatorAddress: string;
};

export type ChatMember = {
  id?: number;

  ownerAddress: string;

  chatId: string;

  userAddress: string;
  userContract: string;

  // how far this owner has scanned this user's UserContract
  // for this exact chatId/chatKey
  cursor: number;
};

export type LocalMessageEvent = "Message" | "ChatCreation" | "Invitation";

export type LocalMessage = {
  id?: number;
  ownerAddress: string;
  chatId: string;
  authorAddress: string;
  authorUserContract: string;
  sourceMessageIndex: number;
  content: string;
  timestamp: number;
  event?: LocalMessageEvent;
  invitedAddress?: string;
};

class MessengerDatabase extends Dexie {
  selfProfiles!: Table<SelfProfile, number>;
  knownUsers!: Table<KnownUser, number>;
  chats!: Table<LocalChat, number>;
  chatMembers!: Table<ChatMember, number>;
  messages!: Table<LocalMessage, number>;

  constructor() {
    super(databaseName);

    this.version(2).stores({
      selfProfiles:
        "++id, &ownerAddress, userContract",

      knownUsers:
        "++id, ownerAddress, userAddress, login, userContract, &[ownerAddress+userAddress]",

      chats:
        "++id, ownerAddress, chatId, &[ownerAddress+chatId]",

      chatMembers:
        "++id, ownerAddress, chatId, userAddress, userContract, [ownerAddress+chatId], &[ownerAddress+chatId+userAddress]",

      messages:
        "++id, ownerAddress, chatId, authorAddress, authorUserContract, timestamp, [ownerAddress+chatId], &[ownerAddress+chatId+authorUserContract+sourceMessageIndex]",
    });
  }
}

export const db = new MessengerDatabase();

export function normalizeAddress(address: string) {
  return address.toLowerCase();
}

export function makeOwnerAddress(walletAddress: string) {
  return normalizeAddress(walletAddress);
}
