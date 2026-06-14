import type { Address, PublicClient } from "viem";

import { aesDecrypt } from "./crypto/aes";
import { deriveChatId, isMessageTagForChat } from "./crypto/hmac";
import { rsaDecrypt } from "./crypto/rsa";
import {
  db,
  normalizeAddress,
  type ChatMember,
  type LocalChat,
  type LocalMessageEvent,
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
  type MessageAttachmentPayload,
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
    try {
      await this.bootstrap();

      if (this.stopped) {
        return;
      }

      this.watchMainConnector();
      await this.refreshUserContractWatcher();

      await this.syncMainRecords();
      await this.syncAllKnownUserContracts();
    } catch (error) {
      if (!this.stopped) {
        console.error("[syncer] start", error);
      }
    }
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

    await this.syncMainRecords();
    await this.syncAllKnownUserContracts();
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
            await this.syncAllKnownUserContracts();
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

    if (!chainUser || this.stopped) {
      return undefined;
    }

    await this.putSelfProfile(chainUser);

    if (this.stopped) {
      return undefined;
    }

    await this.upsertKnownUser(chainUser);

    return chainUser;
  }

  private async putSelfProfile(chainUser: ChainUser) {
    const existing = await db.selfProfiles
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .first();

    const profile = {
      id: existing?.id,
      ownerAddress: this.ownerAddress,
      login: chainUser.login,
      name: chainUser.name,
      pubkey: chainUser.pubkey,
      userContract: asAddress(chainUser.userContract),
      kind: Number(chainUser.kind),
      metadataURI: chainUser.metadataURI,
      mainRecordsCursor: existing?.mainRecordsCursor ?? 0,
    };

    try {
      await db.selfProfiles.put(profile);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "ConstraintError") {
        throw error;
      }

      const latest = await db.selfProfiles
        .where("ownerAddress")
        .equals(this.ownerAddress)
        .first();

      await db.selfProfiles.put({
        ...profile,
        id: latest?.id,
        mainRecordsCursor:
          latest?.mainRecordsCursor ?? existing?.mainRecordsCursor ?? 0,
      });
    }
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
    const creatorAddress = asAddress(payload.creator);

    await this.upsertChat({
      ownerAddress: this.ownerAddress,
      chatId,
      name: "Unnamed chat",
      chatKey: payload.chatKey,
      creatorAddress,
      creatorVerified: false,
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

    await this.addUserToChatByAddress({
      chatId,
      userAddress: creatorAddress,
    });
  }

  private async syncAllKnownUserContracts() {
    while (!this.stopped) {
      const before = await this.countChatMembers();

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

      const after = await this.countChatMembers();

      if (after === before) {
        break;
      }
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
      const message = messages[offset] as ChainMessage;

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

    const timestamp = Number(input.message.timestamp);

    if (payload.event === "ChatCreation") {
      if (
        normalizeAddress(input.member.userAddress) ===
        normalizeAddress(chat.creatorAddress)
      ) {
        await this.upsertChat({
          ownerAddress: this.ownerAddress,
          chatId: chat.chatId,
          name: payload.name,
          chatKey: chat.chatKey,
          creatorAddress: asAddress(chat.creatorAddress),
          creatorVerified: true,
        });

        await this.putMessageIfNew({
          ownerAddress: this.ownerAddress,
          chatId: chat.chatId,
          authorAddress: input.member.userAddress,
          authorUserContract: input.member.userContract,
          sourceMessageIndex: input.sourceMessageIndex,
          content: `Chat created: ${payload.name}`,
          timestamp,
          event: "ChatCreation",
        });
      }
    }

    if (payload.event === "Invitation") {
      await this.addUserToChatByAddress({
        chatId: chat.chatId,
        userAddress: input.member.userAddress,
      });

      await this.addUserToChatByAddress({
        chatId: chat.chatId,
        userAddress: payload.invited,
      });

      await this.putMessageIfNew({
        ownerAddress: this.ownerAddress,
        chatId: chat.chatId,
        authorAddress: input.member.userAddress,
        authorUserContract: input.member.userContract,
        sourceMessageIndex: input.sourceMessageIndex,
        content: "Invitation",
        timestamp,
        event: "Invitation",
        invitedAddress: payload.invited,
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
        timestamp,
        event: "Message",
        attachments: payload.attachments,
      });
    }

    await this.setMemberCursor(input.member, input.sourceMessageIndex + 1);
  }

  private async addUserToChatByAddress(input: {
    chatId: string;
    userAddress: string;
  }) {
    const user = await this.readUser(asAddress(input.userAddress));

    if (!user) {
      return;
    }

    await this.upsertKnownUser(user);

    await this.ensureChatMember({
      ownerAddress: this.ownerAddress,
      chatId: input.chatId,
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

    const chainUser = user as ChainUser;

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
      name:
        existing?.name && chat.name === "Unnamed chat"
          ? existing.name
          : chat.name,
      chatKey: chat.chatKey,
      creatorAddress: asAddress(chat.creatorAddress),
      creatorVerified: chat.creatorVerified ?? existing?.creatorVerified,
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
    event?: LocalMessageEvent;
    invitedAddress?: string;
    attachments?: MessageAttachmentPayload[];
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
      ...(input.event ? { event: input.event } : {}),
      ...(input.invitedAddress
        ? { invitedAddress: asAddress(input.invitedAddress) }
        : {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    });
  }

  private async countChatMembers() {
    return db.chatMembers
      .where("ownerAddress")
      .equals(this.ownerAddress)
      .count();
  }
}
