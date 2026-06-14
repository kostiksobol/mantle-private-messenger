import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encoder,
  randomBytes,
} from "./encoding";

const CHAT_ID_DOMAIN = "mantle-private-messenger:chat-id";
const MESSAGE_TAG_DOMAIN = "mantle-private-messenger:message-tag";

const CHAT_KEY_BYTES = 32;
const MESSAGE_TAG_NONCE_BYTES = 16;

async function importHmacKey(chatKeyBase64: string) {
  const keyBuffer = base64ToArrayBuffer(chatKeyBase64);

  if (keyBuffer.byteLength !== CHAT_KEY_BYTES) {
    throw new Error("Invalid chat key: expected 32 bytes");
  }

  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

async function hmacSha256Base64(chatKeyBase64: string, message: string) {
  const key = await importHmacKey(chatKeyBase64);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return arrayBufferToBase64(signature);
}

export function generateChatKey() {
  return arrayBufferToBase64(randomBytes(CHAT_KEY_BYTES).buffer);
}

export async function deriveChatId(chatKeyBase64: string) {
  return hmacSha256Base64(chatKeyBase64, CHAT_ID_DOMAIN);
}

export async function assertChatId(chatKeyBase64: string, chatId: string) {
  const derivedChatId = await deriveChatId(chatKeyBase64);

  if (derivedChatId !== chatId) {
    throw new Error("Invalid chatId: chatId must be derived from chatKey");
  }
}

export type ParsedMessageTag = {
  nonce: string;
  mac: string;
};

export function parseMessageTag(tag: string): ParsedMessageTag | undefined {
  const parts = tag.split(".");

  if (parts.length !== 2) {
    return undefined;
  }

  const [nonce, mac] = parts;

  if (!nonce || !mac) {
    return undefined;
  }

  return {
    nonce,
    mac,
  };
}

async function signMessageTagNonce(chatKeyBase64: string, nonceBase64: string) {
  return hmacSha256Base64(
    chatKeyBase64,
    `${MESSAGE_TAG_DOMAIN}:${nonceBase64}`
  );
}

export async function generateMessageTag(chatKeyBase64: string) {
  const nonce = arrayBufferToBase64(
    randomBytes(MESSAGE_TAG_NONCE_BYTES).buffer
  );

  const mac = await signMessageTagNonce(chatKeyBase64, nonce);

  return `${nonce}.${mac}`;
}

export async function isMessageTagForChat(
  chatKeyBase64: string,
  tag: string
) {
  const parsed = parseMessageTag(tag);

  if (!parsed) {
    return false;
  }

  const expectedMac = await signMessageTagNonce(
    chatKeyBase64,
    parsed.nonce
  );

  return expectedMac === parsed.mac;
}
