import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LOCAL_IPFS_API_URL,
  checkLocalIpfs,
  type LocalIpfsStatus,
} from "../lib/ipfs/localIpfs";

const initialStatus: LocalIpfsStatus = {
  state: "checking",
  apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
  message: "Checking local IPFS node...",
};

export function useIpfsMode() {
  const [status, setStatus] = useState<LocalIpfsStatus>(initialStatus);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setStatus({
      state: "checking",
      apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
      message: "Checking local IPFS node...",
    });

    try {
      const nextStatus = await checkLocalIpfs();
      setStatus(nextStatus);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return {
    ipfsStatus: status,
    ipfsConnected: status.state === "connected",
    ipfsChecking: checking || status.state === "checking",
    checkIpfs: check,
  };
}
