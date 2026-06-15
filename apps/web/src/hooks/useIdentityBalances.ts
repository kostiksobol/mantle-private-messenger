import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";

import { normalizeAddress } from "@mantle/messenger-core/db";

export function useIdentityBalances(args: {
  publicClient?: any;
  addresses: Array<Address | undefined>;
  decimals: number;
  symbol: string;
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

  const [balances, setBalances] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!args.publicClient || !addressKey) {
      setBalances(new Map());
      return;
    }

    let cancelled = false;

    async function readBalances() {
      const next = new Map<string, string>();
      const addresses = addressKey.split(",").filter(Boolean) as Address[];

      await Promise.all(
        addresses.map(async (address) => {
          try {
            const value = await args.publicClient.getBalance({ address });
            const formatted = Number(formatUnits(value, args.decimals));

            next.set(
              normalizeAddress(address),
              `${formatted.toFixed(formatted >= 1 ? 3 : 5)} ${args.symbol}`
            );
          } catch {
            next.set(normalizeAddress(address), `— ${args.symbol}`);
          }
        })
      );

      if (!cancelled) {
        setBalances(next);
      }
    }

    void readBalances();

    return () => {
      cancelled = true;
    };
  }, [addressKey, args.decimals, args.publicClient, args.symbol]);

  return balances;
}
