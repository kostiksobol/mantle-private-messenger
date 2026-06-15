import { encodeFunctionData, type Address, type Hash } from "viem";

import { aesEncrypt } from "../crypto/aes";
import {
  deriveChatId,
  generateChatKey,
  generateMessageTag,
} from "../crypto/hmac";
import { rsaEncrypt } from "../crypto/rsa";
import { encryptFileBlob } from "../ipfs/fileCrypto";
import { checkLocalIpfs, uploadBlobToLocalIpfs } from "../ipfs/localIpfs";
import {
  MAX_CACHED_ATTACHMENT_SIZE_BYTES,
  putCachedAttachmentFile,
} from "../ipfs/attachmentCache";
import { normalizeAddress } from "../db";
import { ensureRsaKeyPair } from "../localKeys";
import {
  ZERO_ADDRESS,
  mainConnectorAbi,
  userContractAbi,
} from "../contracts";
import { appChain } from "../wagmi";
import { tryWalletSendCallsBatch } from "../walletBatch";
import {
  createChatCreationPayload,
  createInvitationPayload,
  createMainInvitationPayload,
  createMessagePayload,
  encodePayload,
  type MessageAttachmentPayload,
} from "../protocol/payloads";
import type { LocalChat, SelfProfile } from "../db";

export type ChainUser = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

export type MessengerWriteContext = {
  ownerAddress: Address;
  publicClient: any;
  walletClient: any;
  selfProfile: SelfProfile;
  mainConnectorAddress?: Address;
  addActivity?: (message: string) => void;
};

export type CreateChatInput = {
  name: string;
};

export type CreateChatResult = {
  chatId: string;
  chatKey: string;
};

export type SendChatMessageInput = {
  chat: LocalChat;
  text: string;
  files?: File[];
};

export type InviteChatMemberInput = {
  chat: LocalChat;
  target: string;
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

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

function isZeroAddress(address: string) {
  return normalizeAddress(address) === ZERO_ADDRESS;
}

function requireMainConnectorAddress(ctx: MessengerWriteContext) {
  if (!ctx.mainConnectorAddress) {
    throw new Error("MainConnector address is not configured");
  }

  return ctx.mainConnectorAddress;
}

async function wait(ctx: MessengerWriteContext, hash: Hash) {
  await ctx.publicClient.waitForTransactionReceipt({ hash });
}

async function readUserByAddress(
  ctx: MessengerWriteContext,
  userAddress: Address
) {
  const mainConnectorAddress = requireMainConnectorAddress(ctx);

  const user = chainUserFrom(
    await ctx.publicClient.readContract({
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

async function readUserByLogin(ctx: MessengerWriteContext, userLogin: string) {
  const mainConnectorAddress = requireMainConnectorAddress(ctx);

  const user = chainUserFrom(
    await ctx.publicClient.readContract({
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

async function uploadFileAttachment(
  chatKey: string,
  file: File
): Promise<MessageAttachmentPayload> {
  const encryptedFile = await encryptFileBlob(chatKey, file);
  const uploaded = await uploadBlobToLocalIpfs(encryptedFile.blob);

  return {
    url: uploaded.url,
    name: file.name || "attachment",
    mime: file.type || "application/octet-stream",
    size: file.size,
    iv: encryptedFile.iv,
    encryptedSize: uploaded.encryptedSize,
  };
}

export async function createChat(
  ctx: MessengerWriteContext,
  input: CreateChatInput
): Promise<CreateChatResult> {
  const mainConnectorAddress = requireMainConnectorAddress(ctx);
  const keys = await ensureRsaKeyPair(ctx.ownerAddress);

  const chatKey = generateChatKey();
  const chatId = await deriveChatId(chatKey);

  const creationBox = await aesEncrypt(
    chatKey,
    encodePayload(
      createChatCreationPayload({
        name: input.name.trim() || "Unnamed chat",
      })
    )
  );

  const creationTag = await generateMessageTag(chatKey);

  const mainInvitation = await rsaEncrypt(
    keys.publicKey,
    encodePayload(
      createMainInvitationPayload({
        chatKey,
        creator: ctx.ownerAddress,
      })
    )
  );

  const batched = await tryWalletSendCallsBatch({
    from: ctx.ownerAddress,
    chainId: appChain.id,
    calls: [
      {
        to: ctx.selfProfile.userContract as Address,
        data: encodeFunctionData({
          abi: userContractAbi,
          functionName: "addMessage",
          args: [creationBox, creationTag],
        }),
      },
      {
        to: mainConnectorAddress,
        data: encodeFunctionData({
          abi: mainConnectorAbi,
          functionName: "addRecord",
          args: [mainInvitation],
        }),
      },
    ],
  });

  if (!batched) {
    const creationHash = await ctx.walletClient.writeContract({
      account: ctx.ownerAddress,
      chain: appChain,
      address: ctx.selfProfile.userContract as Address,
      abi: userContractAbi,
      functionName: "addMessage",
      args: [creationBox, creationTag],
    });

    await wait(ctx, creationHash);

    const recordHash = await ctx.walletClient.writeContract({
      account: ctx.ownerAddress,
      chain: appChain,
      address: mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "addRecord",
      args: [mainInvitation],
    });

    await wait(ctx, recordHash);
  }

  return {
    chatId,
    chatKey,
  };
}

export async function sendChatMessage(
  ctx: MessengerWriteContext,
  input: SendChatMessageInput
) {
  const text = input.text.trim();
  const files = (input.files ?? []).filter((file) => file.size > 0);

  if (!text && files.length === 0) {
    throw new Error("Message is empty");
  }

  if (files.length > 0) {
    const ipfsStatus = await checkLocalIpfs();

    if (ipfsStatus.state !== "connected") {
      throw new Error("Connect IPFS before sending files");
    }
  }

  const attachments: MessageAttachmentPayload[] = [];

  for (const file of files) {
    ctx.addActivity?.(`upload file: ${file.name || "attachment"}`);

    const attachment = await uploadFileAttachment(input.chat.chatKey, file);

    attachments.push(attachment);

    if (file.size <= MAX_CACHED_ATTACHMENT_SIZE_BYTES) {
      await putCachedAttachmentFile({
        ownerAddress: ctx.ownerAddress,
        chatId: input.chat.chatId,
        attachment,
        blob: file,
      });
    }
  }

  const encrypted = await aesEncrypt(
    input.chat.chatKey,
    encodePayload(createMessagePayload(text, attachments))
  );

  const tag = await generateMessageTag(input.chat.chatKey);

  const hash = await ctx.walletClient.writeContract({
    account: ctx.ownerAddress,
    chain: appChain,
    address: ctx.selfProfile.userContract as Address,
    abi: userContractAbi,
    functionName: "addMessage",
    args: [encrypted, tag],
  });

  await wait(ctx, hash);
}

export async function inviteChatMember(
  ctx: MessengerWriteContext,
  input: InviteChatMemberInput
) {
  const mainConnectorAddress = requireMainConnectorAddress(ctx);
  const target = input.target.trim();

  if (!target) {
    throw new Error("Invite target is empty");
  }

  const invitedUser =
    target.startsWith("0x") && target.length === 42
      ? await readUserByAddress(ctx, toAddress(target))
      : await readUserByLogin(ctx, target);

  if (!invitedUser) {
    throw new Error("User not found");
  }

  const invitationEvent = await aesEncrypt(
    input.chat.chatKey,
    encodePayload(
      createInvitationPayload({
        invited: toAddress(invitedUser.userAddress),
      })
    )
  );

  const invitationTag = await generateMessageTag(input.chat.chatKey);

  const mainInvitation = await rsaEncrypt(
    invitedUser.pubkey,
    encodePayload(
      createMainInvitationPayload({
        chatKey: input.chat.chatKey,
        creator: toAddress(input.chat.creatorAddress),
      })
    )
  );

  const batched = await tryWalletSendCallsBatch({
    from: ctx.ownerAddress,
    chainId: appChain.id,
    calls: [
      {
        to: mainConnectorAddress,
        data: encodeFunctionData({
          abi: mainConnectorAbi,
          functionName: "addRecord",
          args: [mainInvitation],
        }),
      },
      {
        to: ctx.selfProfile.userContract as Address,
        data: encodeFunctionData({
          abi: userContractAbi,
          functionName: "addMessage",
          args: [invitationEvent, invitationTag],
        }),
      },
    ],
  });

  if (!batched) {
    const recordHash = await ctx.walletClient.writeContract({
      account: ctx.ownerAddress,
      chain: appChain,
      address: mainConnectorAddress,
      abi: mainConnectorAbi,
      functionName: "addRecord",
      args: [mainInvitation],
    });

    await wait(ctx, recordHash);

    const messageHash = await ctx.walletClient.writeContract({
      account: ctx.ownerAddress,
      chain: appChain,
      address: ctx.selfProfile.userContract as Address,
      abi: userContractAbi,
      functionName: "addMessage",
      args: [invitationEvent, invitationTag],
    });

    await wait(ctx, messageHash);
  }
}
