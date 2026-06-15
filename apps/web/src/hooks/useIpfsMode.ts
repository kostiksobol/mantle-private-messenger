import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LOCAL_IPFS_API_URL,
  checkLocalIpfs,
  type LocalIpfsStatus,
} from "@mantle/messenger-core/ipfs/localIpfs";

const IPFS_ENABLED_STORAGE_KEY = "mantle-private-messenger:ipfs-enabled";

const disconnectedStatus: LocalIpfsStatus = {
  state: "disconnected",
  apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
  message:
    "IPFS is not connected. Click Check IPFS connection when your local node is running.",
};

const checkingStatus: LocalIpfsStatus = {
  state: "checking",
  apiUrl: DEFAULT_LOCAL_IPFS_API_URL,
  message: "Checking local IPFS node...",
};

function wasIpfsEnabled() {
  return localStorage.getItem(IPFS_ENABLED_STORAGE_KEY) === "1";
}

function rememberIpfsEnabled() {
  localStorage.setItem(IPFS_ENABLED_STORAGE_KEY, "1");
}

export function useIpfsMode() {
  const [status, setStatus] = useState<LocalIpfsStatus>(disconnectedStatus);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (silent = false) => {
    if (!silent) {
      setChecking(true);
      setStatus(checkingStatus);
    }

    try {
      const nextStatus = await checkLocalIpfs();

      if (nextStatus.state === "connected") {
        rememberIpfsEnabled();
      }

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
    if (!wasIpfsEnabled()) {
      return;
    }

    void check(true);
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
