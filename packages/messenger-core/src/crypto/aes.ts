import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decoder,
  encoder,
  randomBytes,
} from "./encoding";

async function importAesKey(chatKeyBase64: string) {
  return crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(chatKeyBase64),
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function aesEncrypt(chatKeyBase64: string, plaintext: string) {
  const key = await importAesKey(chatKeyBase64);
  const iv = randomBytes(12);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(plaintext)
  );

  return JSON.stringify({
    alg: "AES-GCM",
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(encryptedBuffer),
  });
}

export async function aesDecrypt(chatKeyBase64: string, encryptedJson: string) {
  const box = JSON.parse(encryptedJson) as {
    alg: string;
    iv: string;
    data: string;
  };

  if (box.alg !== "AES-GCM") {
    throw new Error("Unsupported AES box algorithm");
  }

  const key = await importAesKey(chatKeyBase64);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(box.iv),
    },
    key,
    base64ToArrayBuffer(box.data)
  );

  return decoder.decode(decryptedBuffer);
}
