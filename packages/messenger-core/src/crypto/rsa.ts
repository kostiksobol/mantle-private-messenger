import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decoder,
  encoder,
} from "./encoding";

export async function generateRsaKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

export async function importRsaPublicKey(publicKeyBase64: string) {
  return crypto.subtle.importKey(
    "spki",
    base64ToArrayBuffer(publicKeyBase64),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
}

export async function importRsaPrivateKey(privateKeyBase64: string) {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(privateKeyBase64),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );
}

export async function rsaEncrypt(publicKeyBase64: string, plaintext: string) {
  const publicKey = await importRsaPublicKey(publicKeyBase64);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encoder.encode(plaintext)
  );

  return arrayBufferToBase64(encryptedBuffer);
}

export async function rsaDecrypt(privateKeyBase64: string, encryptedBase64: string) {
  const privateKey = await importRsaPrivateKey(privateKeyBase64);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    base64ToArrayBuffer(encryptedBase64)
  );

  return decoder.decode(decryptedBuffer);
}
