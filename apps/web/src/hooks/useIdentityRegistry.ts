import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

import {
  MAIN_CONNECTOR_ADDRESS,
  ZERO_ADDRESS,
  mainConnectorAbi,
} from "@mantle/messenger-core/contracts";
import { normalizeAddress } from "@mantle/messenger-core/db";

export type IdentityRegistryProfile = {
  userAddress: Address;
  login: string;
  name: string;
  pubkey: string;
  userContract: Address;
  kind: number;
  metadataURI: string;
};

function toAddress(address: string) {
  return normalizeAddress(address) as Address;
}

function isZeroAddress(address: string) {
  return normalizeAddress(address) === ZERO_ADDRESS;
}

function chainUserFrom(value: unknown): IdentityRegistryProfile {
  const item = value as Partial<IdentityRegistryProfile> & Record<number, unknown>;

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

export function useIdentityRegistry(args: {
  publicClient?: any;
  addresses: Array<Address | undefined>;
}) {
  const addressKey = useMemo(() => {
    return Array.from(
      new Set(
        args.addresses
          .filter((address): address is Address => Boolean(address))
          .map((address) => normalizeAddress(address))
      )
    )
      .sort()
      .join(",");
  }, [args.addresses]);

  const [profiles, setProfiles] = useState<Map<string, IdentityRegistryProfile>>(
    () => new Map()
  );

  useEffect(() => {
    if (!args.publicClient || !MAIN_CONNECTOR_ADDRESS || !addressKey) {
      setProfiles(new Map());
      return;
    }

    let cancelled = false;

    async function readProfiles() {
      const next = new Map<string, IdentityRegistryProfile>();
      const addresses = addressKey.split(",").filter(Boolean);

      await Promise.all(
        addresses.map(async (address) => {
          try {
            const user = chainUserFrom(
              await args.publicClient.readContract({
                address: MAIN_CONNECTOR_ADDRESS,
                abi: mainConnectorAbi,
                functionName: "getUserByAddress",
                args: [toAddress(address)],
              })
            );

            if (!isZeroAddress(user.userAddress)) {
              next.set(normalizeAddress(user.userAddress), user);
            }
          } catch {
            // Keep identity selector usable even if one read fails.
          }
        })
      );

      if (!cancelled) {
        setProfiles(next);
      }
    }

    void readProfiles();

    return () => {
      cancelled = true;
    };
  }, [addressKey, args.publicClient]);

  return profiles;
}
