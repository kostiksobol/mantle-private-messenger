import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { normalizeAddress } from "@mantle/messenger-core/db";

const STORAGE_KEY = "mantle-messenger:local-signer-accounts:v1";

export type LocalSignerAccount = {
  id: string;
  label: string;
  address: Address;
  privateKey: Hex;
  createdAt: number;
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readRawAccounts(): LocalSignerAccount[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.label === "string" &&
          typeof item.address === "string" &&
          typeof item.privateKey === "string"
        );
      })
      .map((item) => ({
        id: item.id,
        label: item.label,
        address: normalizeAddress(item.address) as Address,
        privateKey: item.privateKey as Hex,
        createdAt: Number(item.createdAt ?? Date.now()),
      }));
  } catch {
    return [];
  }
}

function writeRawAccounts(accounts: LocalSignerAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function listLocalSignerAccounts() {
  return readRawAccounts();
}

export function createLocalSignerAccount(label?: string) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const item: LocalSignerAccount = {
    id: makeId(),
    label: label?.trim() || "Local signer user",
    address: normalizeAddress(account.address) as Address,
    privateKey,
    createdAt: Date.now(),
  };

  const accounts = readRawAccounts();

  writeRawAccounts([item, ...accounts]);

  return item;
}

export function deleteLocalSignerAccount(id: string) {
  const accounts = readRawAccounts().filter((item) => item.id !== id);
  writeRawAccounts(accounts);
}
