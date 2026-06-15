import {
  db,
  normalizeAddress,
  type LocalAttachmentFile,
  type LocalMessageAttachment,
} from "../db";
import { decryptFileBlob } from "./fileCrypto";
import { downloadIpfsUrl } from "./localIpfs";

export const MAX_CACHED_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

export type AttachmentFileKey = {
  ownerAddress: string;
  chatId: string;
  url: string;
};

export type PutCachedAttachmentFileInput = {
  ownerAddress: string;
  chatId: string;
  attachment: LocalMessageAttachment;
  blob: Blob;
};

export type CacheAttachmentFromIpfsInput = {
  ownerAddress: string;
  chatId: string;
  chatKey: string;
  attachment: LocalMessageAttachment;
};

function keyTuple(input: AttachmentFileKey) {
  return [
    normalizeAddress(input.ownerAddress),
    input.chatId,
    input.url,
  ] as const;
}

export async function getCachedAttachmentFile(
  input: AttachmentFileKey
): Promise<LocalAttachmentFile | undefined> {
  return db.attachmentFiles
    .where("[ownerAddress+chatId+url]")
    .equals(keyTuple(input))
    .first();
}

export async function getCachedAttachmentFilesForChat(input: {
  ownerAddress: string;
  chatId: string;
}): Promise<LocalAttachmentFile[]> {
  return db.attachmentFiles
    .where("ownerAddress")
    .equals(normalizeAddress(input.ownerAddress))
    .filter((file) => file.chatId === input.chatId)
    .toArray();
}

export async function putCachedAttachmentFile(
  input: PutCachedAttachmentFileInput
): Promise<LocalAttachmentFile> {
  const ownerAddress = normalizeAddress(input.ownerAddress);

  const existing = await getCachedAttachmentFile({
    ownerAddress,
    chatId: input.chatId,
    url: input.attachment.url,
  });

  const record: LocalAttachmentFile = {
    id: existing?.id,
    ownerAddress,
    chatId: input.chatId,
    url: input.attachment.url,
    name: input.attachment.name,
    mime: input.attachment.mime || "application/octet-stream",
    size: input.attachment.size,
    blob: input.blob,
  };

  const id = await db.attachmentFiles.put(record);

  return {
    ...record,
    id,
  };
}

export async function cacheAttachmentFromIpfs(
  input: CacheAttachmentFromIpfsInput
): Promise<LocalAttachmentFile> {
  const cached = await getCachedAttachmentFile({
    ownerAddress: input.ownerAddress,
    chatId: input.chatId,
    url: input.attachment.url,
  });

  if (cached) {
    return cached;
  }

  const declaredSize = Math.max(
    input.attachment.size,
    input.attachment.encryptedSize ?? 0
  );

  if (declaredSize > MAX_CACHED_ATTACHMENT_SIZE_BYTES) {
    throw new Error("File is larger than 100 MB and will not be cached locally");
  }

  const encryptedBlob = await downloadIpfsUrl(input.attachment.url);
  const decryptedBlob = await decryptFileBlob(
    input.chatKey,
    encryptedBlob,
    input.attachment.iv,
    input.attachment.mime
  );

  if (decryptedBlob.size > MAX_CACHED_ATTACHMENT_SIZE_BYTES) {
    throw new Error("Decrypted file is larger than 100 MB and will not be cached locally");
  }

  return putCachedAttachmentFile({
    ownerAddress: input.ownerAddress,
    chatId: input.chatId,
    attachment: input.attachment,
    blob: decryptedBlob,
  });
}
