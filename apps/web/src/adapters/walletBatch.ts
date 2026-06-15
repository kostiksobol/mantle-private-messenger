import type { Address, Hex } from "viem";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type WalletBatchCall = {
  to: Address;
  data: Hex;
  value?: Hex;
};

type WalletSendCallsArgs = {
  from: Address;
  chainId: number;
  calls: WalletBatchCall[];
  maxPolls?: number;
  pollIntervalMs?: number;
};

function getProvider() {
  return (globalThis as { ethereum?: Eip1193Provider }).ethereum;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUserRejected(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code: unknown }).code) === 4001
  );
}

function getBatchId(result: unknown) {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  const item = result as {
    id?: unknown;
    batchId?: unknown;
  };

  if (typeof item.id === "string") {
    return item.id;
  }

  if (typeof item.batchId === "string") {
    return item.batchId;
  }

  return undefined;
}

async function waitForCallsStatus(
  provider: Eip1193Provider,
  batchId: string,
  maxPolls: number,
  pollIntervalMs: number
) {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    let statusResult: unknown;

    try {
      statusResult = await provider.request({
        method: "wallet_getCallsStatus",
        params: [batchId],
      });
    } catch {
      return;
    }

    const status =
      typeof statusResult === "object" &&
      statusResult !== null &&
      "status" in statusResult
        ? Number((statusResult as { status: unknown }).status)
        : undefined;

    if (status !== undefined && status >= 200 && status < 300) {
      return;
    }

    if (status !== undefined && status >= 400) {
      throw new Error(`Batch transaction failed with status ${status}`);
    }

    await sleep(pollIntervalMs);
  }
}

export async function tryWalletSendCallsBatch({
  from,
  chainId,
  calls,
  maxPolls = 40,
  pollIntervalMs = 1500,
}: WalletSendCallsArgs) {
  const provider = getProvider();

  if (!provider) {
    return false;
  }

  let result: unknown;

  try {
    result = await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from,
          chainId: `0x${chainId.toString(16)}`,
          atomicRequired: false,
          calls: calls.map((call) => ({
            to: call.to,
            data: call.data,
            value: call.value ?? "0x0",
          })),
        },
      ],
    });
  } catch (error) {
    if (isUserRejected(error)) {
      throw error;
    }

    return false;
  }

  const batchId = getBatchId(result);

  if (batchId) {
    await waitForCallsStatus(provider, batchId, maxPolls, pollIntervalMs);
  }

  return true;
}
