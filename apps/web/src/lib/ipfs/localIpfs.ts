import { create } from "kubo-rpc-client";

export const DEFAULT_LOCAL_IPFS_API_URL = "http://127.0.0.1:5001/api/v0";

export type LocalIpfsStatus =
  | {
      state: "checking";
      apiUrl: string;
      message: string;
    }
  | {
      state: "connected";
      apiUrl: string;
      version?: string;
      message: string;
    }
  | {
      state: "disconnected";
      apiUrl: string;
      message: string;
    };

export function createLocalIpfsClient(apiUrl = DEFAULT_LOCAL_IPFS_API_URL) {
  return create({
    url: apiUrl,
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export async function checkLocalIpfs(
  apiUrl = DEFAULT_LOCAL_IPFS_API_URL
): Promise<LocalIpfsStatus> {
  try {
    const client = createLocalIpfsClient(apiUrl);
    const versionInfo = await client.version();

    return {
      state: "connected",
      apiUrl,
      version: versionInfo.version,
      message: versionInfo.version
        ? `Connected to local IPFS node ${versionInfo.version}`
        : "Connected to local IPFS node",
    };
  } catch (error) {
    return {
      state: "disconnected",
      apiUrl,
      message: errorMessage(error),
    };
  }
}
