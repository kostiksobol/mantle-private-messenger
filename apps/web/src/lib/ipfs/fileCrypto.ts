import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  randomBytes,
} from "../crypto/encoding";

const CHAT_KEY_BYTES = 32;
const FILE_IV_BYTES = 12;

export type EncryptedFileBlob = {
  blob: Blob;
  iv: string;
  encryptedSize: number;
};

function bytesToBase64(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );

  return arrayBufferToBase64(buffer);
}

async function importFileAesKey(chatKeyBase64: string) {
  const keyBuffer = base64ToArrayBuffer(chatKeyBase64);

  if (keyBuffer.byteLength !== CHAT_KEY_BYTES) {
    throw new Error("Invalid chat key: expected 32 bytes");
  }

  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFileBlob(
  chatKeyBase64: string,
  file: Blob
): Promise<EncryptedFileBlob> {
  const key = await importFileAesKey(chatKeyBase64);
  const ivBytes = randomBytes(FILE_IV_BYTES);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBytes,
    },
    key,
    await file.arrayBuffer()
  );

  const blob = new Blob([encryptedBuffer], {
    type: "application/octet-stream",
  });

  return {
    blob,
    iv: bytesToBase64(ivBytes),
    encryptedSize: blob.size,
  };
}

export async function decryptFileBlob(
  chatKeyBase64: string,
  encryptedBlob: Blob,
  ivBase64: string,
  mime = "application/octet-stream"
) {
  const key = await importFileAesKey(chatKeyBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  if (ivBuffer.byteLength !== FILE_IV_BYTES) {
    throw new Error("Invalid file IV: expected 12 bytes");
  }

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    key,
    await encryptedBlob.arrayBuffer()
  );

  return new Blob([decryptedBuffer], {
    type: mime || "application/octet-stream",
  });
}
