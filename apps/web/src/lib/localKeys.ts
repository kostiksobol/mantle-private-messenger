import { normalizeAddress } from "./db";
import { generateRsaKeyPair } from "./crypto/rsa";

export type StoredRsaKeyPair = {
  publicKey: string;
  privateKey: string;
};

export function rsaStorageKey(ownerAddress: string) {
  return `mantle-private-messenger:rsa:${normalizeAddress(ownerAddress)}`;
}

export function saveRsaKeyPair(
  ownerAddress: string,
  keyPair: StoredRsaKeyPair
) {
  localStorage.setItem(
    rsaStorageKey(ownerAddress),
    JSON.stringify(keyPair)
  );
}

export function loadRsaKeyPair(ownerAddress?: string) {
  if (!ownerAddress) {
    return undefined;
  }

  const raw = localStorage.getItem(rsaStorageKey(ownerAddress));

  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as StoredRsaKeyPair;

    if (
      typeof parsed.publicKey === "string" &&
      typeof parsed.privateKey === "string"
    ) {
      return parsed;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function ensureRsaKeyPair(ownerAddress: string) {
  const existing = loadRsaKeyPair(ownerAddress);

  if (existing) {
    return existing;
  }

  const created = await generateRsaKeyPair();
  saveRsaKeyPair(ownerAddress, created);

  return created;
}
