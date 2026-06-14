import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LOCAL_IPFS_API_URL,
  checkLocalIpfs,
  type LocalIpfsStatus,
} from "../lib/ipfs/localIpfs";

const initialStatus: LocalIpfsStatus = {
  state: "disconnected",
  apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
  message: "IPFS is not connected. Click Check IPFS connection when your local node is running.",
};

export function useIpfsMode() {
  const [status, setStatus] = useState<LocalIpfsStatus>(initialStatus);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (silent = false) => {
    if (!silent) {
      setChecking(true);
      setStatus({
        state: "checking",
        apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
        message: "Checking local IPFS node...",
      });
    }

    try {
      const nextStatus = await checkLocalIpfs();
      setStatus(nextStatus);
    } finally {
      if (!silent) {
        setChecking(false);
      }
    }
  }, []);

  const checkIpfs = useCallback(async () => {
    await check(false);
  }, [check]);

  useEffect(() => {
    if (status.state !== "connected") {
      return;
    }

    const interval = window.setInterval(() => {
      void check(true);
    }, 8000);

    function checkOnFocus() {
      void check(true);
    }

    function checkOnVisibilityChange() {
      if (document.visibilityState === "visible") {
        void check(true);
      }
    }

    window.addEventListener("focus", checkOnFocus);
    document.addEventListener("visibilitychange", checkOnVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkOnFocus);
      document.removeEventListener("visibilitychange", checkOnVisibilityChange);
    };
  }, [check, status.state]);

  return {
    ipfsStatus: status,
    ipfsConnected: status.state === "connected",
    ipfsChecking: checking || status.state === "checking",
    checkIpfs,
  };
}
