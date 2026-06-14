import type { Address, PublicClient } from "viem";

import { aesDecrypt } from "./crypto/aes";
import { deriveChatId, isMessageTagForChat } from "./crypto/hmac";
import { rsaDecrypt } from "./crypto/rsa";
import {
  db,
  normalizeAddress,
  type ChatMember,
  type LocalChat,
} from "./db";
import { loadRsaKeyPair } from "./localKeys";
import {
  MAIN_CONNECTOR_ADDRESS,
  ZERO_ADDRESS,
  mainConnectorAbi,
  userContractAbi,
} from "./contracts";
import {
  parseChatEventPayload,
  parseMainInvitationPayload,
} from "./protocol/payloads";

type ChainUser = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

type ChainMessage = {
  encryptedContent: string;
  tag: string;
  timestamp: bigint;
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

function chainMessageFrom(value: unknown): ChainMessage {
  const item = value as Partial<ChainMessage> & Record<number, unknown>;

  return {
    encryptedContent: String(item.encryptedContent ?? item[0] ?? ""),
    tag: String(item.tag ?? item[1] ?? ""),
    timestamp: BigInt(String(item.timestamp ?? item[2] ?? 0)),
  };
}

export type SyncerOptions = {
  ownerAddress: Address;
  publicClient: PublicClient;
  mainConnectorAddress?: Address;
};

function asAddress(value: string) {
  return normalizeAddress(value) as Address;
}

function isZeroAddress(address: string) {
  return normalizeAddress(address) === ZERO_ADDRESS;
}

export function startBlockchainSyncer(options: SyncerOptions) {
  const syncer = new BlockchainSyncer(options);
  void syncer.start();
  return () => syncer.stop();
}

class BlockchainSyncer {
  private ownerAddress: Address;
  private publicClient: PublicClient;
  private mainConnectorAddress: Address;

  private stopped = false;

  private mainUnwatch?: () => void;
  private userContractsUnwatch?: () => void;
  private watchedUserContractsKey = "";

  private running = new Set<string>();
  private pending = new Set<string>();

  constructor(options: SyncerOptions) {
    this.ownerAddress = asAddress(options.ownerAddress);
    this.publicClient = options.publicClient;

    const mainConnectorAddress =
      options.mainConnectorAddress || MAIN_CONNECTOR_ADDRESS;

    if (!mainConnectorAddress) {
      throw new Error("MainConnector address is not configured");
    }

    this.mainConnectorAddress = mainConnectorAddress;
  }

  async start() {
    await this.bootstrap();

    if (this.stopped) {
      return;
    }

    this.watchMainConnector();
    await this.refreshUserContractWatcher();

    await this.syncMainRecords();
    await this.syncAllKnownUserContracts();
  }

  stop() {
    this.stopped = true;
    this.mainUnwatch?.();
    this.userContractsUnwatch?.();
  }

  private enqueue(key: string, task: () => Promise<void>) {
    if (this.stopped) {
      return;
    }

    if (this.running.has(key)) {
      this.pending.add(key);
      return;
    }

    void this.runQueued(key, task);
  }

  private async runQueued(key: string, task: () => Promise<void>) {
    this.running.add(key);

    try {
      await task();
    } catch (error) {
      console.error("[syncer]", key, error);
    } finally {
      this.running.delete(key);
    }

    if (this.pending.delete(key) && !this.stopped) {
      this.enqueue(key, task);
    }
  }

  private async bootstrap() {
    const self = await this.syncSelfProfile();

    if (!self) {
      return;
    }

    for (let i = 0; i < 20; i++) {
      const before = await this.countChatMembers();

      await this.syncMainRecords();
      await this.syncAllKnownUserContracts();

      const after = await this.countChatMembers();

      if (after === before) {
        break;
      }
    }
  }

  private watchMainConnector() {
    this.mainUnwatch?.();

    this.mainUnwatch = this.publicClient.watchContractEvent({
      address: this.mainConnectorAddress,
      abi: mainConnectorAbi,
      eventName: "RecordAdded",
      onLogs: () => {
        this.enqueue("main", async () => {
          await this.syncMainRecords();
          await this.syncAllKnownUserContracts();
          await this.refreshUserContractWatcher();
        });
      },
      onError: (error) => {
        console.error("[syncer] MainConnector logs", error);
      },
    });
  }

  private async refreshUserContractWatcher() {
    const members = await db.chatMembers
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .toArray();

    const addresses = Array.from(
      new Set(members.map((member) => asAddress(member.userContract)))
    ).sort();

    const key = addresses.join(",");

    if (key === this.watchedUserContractsKey) {
      return;
    }

    this.userContractsUnwatch?.();
    this.userContractsUnwatch = undefined;
    this.watchedUserContractsKey = key;

    if (addresses.length === 0) {
      return;
    }

    this.userContractsUnwatch = this.publicClient.watchContractEvent({
      address: addresses,
      abi: userContractAbi,
      eventName: "MessageAdded",
      onLogs: (logs) => {
        for (const log of logs) {
          this.enqueue(`user:${normalizeAddress(log.address)}`, async () => {
            await this.syncUserContract(log.address);
            await this.refreshUserContractWatcher();
          });
        }
      },
      onError: (error) => {
        console.error("[syncer] UserContract logs", error);
      },
    });
  }

  private async syncSelfProfile() {
    const chainUser = await this.readUser(this.ownerAddress);

    if (!chainUser) {
      return undefined;
    }

    const existing = await db.selfProfiles
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .first();

    await db.selfProfiles.put({
      id: existing?.id,
      ownerAddress: this.ownerAddress,
      login: chainUser.login,
      name: chainUser.name,
      pubkey: chainUser.pubkey,
      userContract: asAddress(chainUser.userContract),
      kind: Number(chainUser.kind),
      metadataURI: chainUser.metadataURI,
      mainRecordsCursor: existing?.mainRecordsCursor ?? 0,
    });

    await this.upsertKnownUser(chainUser);

    return chainUser;
  }

  private async syncMainRecords() {
    const self = await db.selfProfiles
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .first();

    if (!self) {
      return;
    }

    const keys = loadRsaKeyPair(this.ownerAddress);

    if (!keys) {
      return;
    }

    let cursor = self.mainRecordsCursor;

    const records = await this.publicClient.readContract({
      address: this.mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "getLastRecords",
      args: [BigInt(cursor)],
    });

    for (const record of records) {
      await this.processMainRecord(record);

      cursor += 1;

      await db.selfProfiles.put({
        ...self,
        mainRecordsCursor: cursor,
      });
    }

    await this.refreshUserContractWatcher();
  }

  private async processMainRecord(record: string) {
    const keys = loadRsaKeyPair(this.ownerAddress);

    if (!keys) {
      return;
    }

    let plaintext: string;

    try {
      plaintext = await rsaDecrypt(keys.privateKey, record);
    } catch {
      return;
    }

    const payload = parseMainInvitationPayload(plaintext);

    if (!payload) {
      return;
    }

    const chatId = await deriveChatId(payload.chatKey);

    await this.upsertChat({
      ownerAddress: this.ownerAddress,
      chatId,
      name: "Unnamed chat",
      chatKey: payload.chatKey,
      invitedByAddress: asAddress(payload.inviter),
    });

    const self = await db.selfProfiles
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .first();

    if (self) {
      await this.ensureChatMember({
        ownerAddress: this.ownerAddress,
        chatId,
        userAddress: this.ownerAddress,
        userContract: asAddress(self.userContract),
        cursor: 0,
      });
    }

    const inviter = await this.readUser(asAddress(payload.inviter));

    if (inviter) {
      await this.upsertKnownUser(inviter);

      await this.ensureChatMember({
        ownerAddress: this.ownerAddress,
        chatId,
        userAddress: asAddress(inviter.userAddress),
        userContract: asAddress(inviter.userContract),
        cursor: 0,
      });
    }
  }

  private async syncAllKnownUserContracts() {
    const members = await db.chatMembers
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .toArray();

    const userContracts = Array.from(
      new Set(members.map((member) => asAddress(member.userContract)))
    );

    for (const userContract of userContracts) {
      if (this.stopped) {
        return;
      }

      await this.syncUserContract(userContract);
    }

    await this.refreshUserContractWatcher();
  }

  private async syncUserContract(userContract: Address) {
    const members = await db.chatMembers
      .where("userContract")
      .equals(asAddress(userContract))
      .filter((member) => member.ownerAddress === this.ownerAddress)
      .toArray();

    if (members.length === 0) {
      return;
    }

    const minCursor = Math.min(...members.map((member) => member.cursor));

    const messages = await this.publicClient.readContract({
      address: asAddress(userContract),
      abi: userContractAbi,
      functionName: "getLastMessages",
      args: [BigInt(minCursor)],
    });

    for (let offset = 0; offset < messages.length; offset++) {
      const sourceMessageIndex = minCursor + offset;
      const message = chainMessageFrom(messages[offset]);

      const currentMembers = await db.chatMembers
        .where("userContract")
        .equals(asAddress(userContract))
        .filter((member) => member.ownerAddress === this.ownerAddress)
        .toArray();

      for (const member of currentMembers) {
        if (sourceMessageIndex < member.cursor) {
          continue;
        }

        await this.processUserContractMessage({
          member,
          message,
          sourceMessageIndex,
        });
      }
    }

    await this.refreshUserContractWatcher();
  }

  private async processUserContractMessage(input: {
    member: ChatMember;
    message: ChainMessage;
    sourceMessageIndex: number;
  }) {
    const chat = await db.chats
      .where("[ownerAddress+chatId]")
      .equals([this.ownerAddress, input.member.chatId])
      .first();

    if (!chat) {
      await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
      return;
    }

    const isForChat = await isMessageTagForChat(
      chat.chatKey,
      input.message.tag
    );

    if (!isForChat) {
      await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
      return;
    }

    let plaintext: string;

    try {
      plaintext = await aesDecrypt(
        chat.chatKey,
        input.message.encryptedContent
      );
    } catch {
      await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
      return;
    }

    const payload = parseChatEventPayload(plaintext);

    if (!payload) {
      await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
      return;
    }

    if (payload.event === "ChatCreation") {
      await this.upsertChat({
        ownerAddress: this.ownerAddress,
        chatId: chat.chatId,
        name: payload.name,
        chatKey: chat.chatKey,
      });

      await this.putMessageIfNew({
        ownerAddress: this.ownerAddress,
        chatId: chat.chatId,
        authorAddress: input.member.userAddress,
        authorUserContract: input.member.userContract,
        sourceMessageIndex: input.sourceMessageIndex,
        content: `Chat created: ${payload.name}`,
        timestamp: Number(input.message.timestamp),
        event: "ChatCreation",
      });
    }

    if (payload.event === "Invitation") {
      await this.addUserToChat(chat, payload.invited);
      await this.addUserToChat(chat, payload.invitedBy);

      if (asAddress(payload.invited) === this.ownerAddress) {
        await this.setChatInvitedBy(chat, input.member.userAddress);
      }

      await this.putMessageIfNew({
        ownerAddress: this.ownerAddress,
        chatId: chat.chatId,
        authorAddress: input.member.userAddress,
        authorUserContract: input.member.userContract,
        sourceMessageIndex: input.sourceMessageIndex,
        content: "Invitation",
        timestamp: Number(input.message.timestamp),
        event: "Invitation",
        invitedAddress: normalizeAddress(payload.invited),
        invitedByAddress: normalizeAddress(payload.invitedBy),
      });
    }

    if (payload.event === "Message") {
      await this.putMessageIfNew({
        ownerAddress: this.ownerAddress,
        chatId: chat.chatId,
        authorAddress: input.member.userAddress,
        authorUserContract: input.member.userContract,
        sourceMessageIndex: input.sourceMessageIndex,
        content: payload.text,
        timestamp: Number(input.message.timestamp),
        event: "Message",
      });
    }

    await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
  }

  private async addUserToChat(chat: LocalChat, userAddress: string) {
    const user = await this.readUser(asAddress(userAddress));

    if (!user) {
      return;
    }

    await this.upsertKnownUser(user);

    await this.ensureChatMember({
      ownerAddress: this.ownerAddress,
      chatId: chat.chatId,
      userAddress: asAddress(user.userAddress),
      userContract: asAddress(user.userContract),
      cursor: 0,
    });
  }

  private async readUser(userAddress: Address) {
    const user = await this.publicClient.readContract({
      address: this.mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "getUserByAddress",
      args: [userAddress],
    });

    const chainUser = chainUserFrom(user);

    if (isZeroAddress(chainUser.userAddress)) {
      return undefined;
    }

    return chainUser;
  }

  private async upsertKnownUser(user: ChainUser) {
    const ownerAddress = this.ownerAddress;
    const userAddress = asAddress(user.userAddress);

    const existing = await db.knownUsers
      .where("[ownerAddress+userAddress]")
      .equals([ownerAddress, userAddress])
      .first();

    await db.knownUsers.put({
      id: existing?.id,
      ownerAddress,
      userAddress,
      login: user.login,
      name: user.name,
      pubkey: user.pubkey,
      userContract: asAddress(user.userContract),
      kind: Number(user.kind),
      metadataURI: user.metadataURI,
    });
  }

  private async upsertChat(chat: Omit<LocalChat, "id">) {
    const existing = await db.chats
      .where("[ownerAddress+chatId]")
      .equals([chat.ownerAddress, chat.chatId])
      .first();

    await db.chats.put({
      id: existing?.id,
      ownerAddress: chat.ownerAddress,
      chatId: chat.chatId,
      name: existing?.name && chat.name === "Unnamed chat"
        ? existing.name
        : chat.name,
      chatKey: chat.chatKey,
      invitedByAddress: chat.invitedByAddress
        ? asAddress(chat.invitedByAddress)
        : existing?.invitedByAddress,
    });
  }

  private async setChatInvitedBy(chat: LocalChat, invitedByAddress: string) {
    const existing = await db.chats
      .where("[ownerAddress+chatId]")
      .equals([this.ownerAddress, chat.chatId])
      .first();

    if (!existing || existing.invitedByAddress) {
      return;
    }

    await db.chats.put({
      ...existing,
      invitedByAddress: asAddress(invitedByAddress),
    });
  }

  private async ensureChatMember(member: Omit<ChatMember, "id">) {
    const ownerAddress = asAddress(member.ownerAddress);
    const userAddress = asAddress(member.userAddress);

    const existing = await db.chatMembers
      .where("[ownerAddress+chatId+userAddress]")
      .equals([ownerAddress, member.chatId, userAddress])
      .first();

    await db.chatMembers.put({
      id: existing?.id,
      ownerAddress,
      chatId: member.chatId,
      userAddress,
      userContract: asAddress(member.userContract),
      cursor: existing?.cursor ?? member.cursor,
    });
  }

  private async setMemberCursor(member: ChatMember, cursor: number) {
    await db.chatMembers.put({
      ...member,
      cursor,
    });
  }

  private async putMessageIfNew(input: {
    ownerAddress: string;
    chatId: string;
    authorAddress: string;
    authorUserContract: string;
    sourceMessageIndex: number;
    content: string;
    timestamp: number;
    event?: "Message" | "ChatCreation" | "Invitation";
    invitedAddress?: string;
    invitedByAddress?: string;
  }) {
    const existing = await db.messages
      .where("[ownerAddress+chatId+authorUserContract+sourceMessageIndex]")
      .equals([
        asAddress(input.ownerAddress),
        input.chatId,
        asAddress(input.authorUserContract),
        input.sourceMessageIndex,
      ])
      .first();

    if (existing) {
      return;
    }

    await db.messages.add({
      ownerAddress: asAddress(input.ownerAddress),
      chatId: input.chatId,
      authorAddress: asAddress(input.authorAddress),
      authorUserContract: asAddress(input.authorUserContract),
      sourceMessageIndex: input.sourceMessageIndex,
      content: input.content,
      timestamp: input.timestamp,
      event: input.event,
      invitedAddress: input.invitedAddress
        ? asAddress(input.invitedAddress)
        : undefined,
      invitedByAddress: input.invitedByAddress
        ? asAddress(input.invitedByAddress)
        : undefined,
    });
  }

  private async countChatMembers() {
    return db.chatMembers
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .count();
  }
}
