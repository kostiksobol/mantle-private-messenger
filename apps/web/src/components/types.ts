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
};

export type ChatMember = {
  id?: number;
  ownerAddress: string;
  chatId: string;
  userAddress: string;
  userContract: string;
  cursor: number;
};

export type LocalMessage = {
  id?: number;
  ownerAddress: string;
  chatId: string;
  authorAddress: string;
  authorUserContract: string;
  sourceMessageIndex: number;
  content: string;
  timestamp: number;
};

export type ChatWithPreview = {
  chat: LocalChat;
  lastMessage?: LocalMessage;
  membersCount: number;
};
