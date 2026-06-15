import { useMemo, useState } from "react";
import { createPublicClient, http, type Address } from "viem";

import {
  getDefaultMessengerRuntimeConfig,
  getKnownChainMetadata,
  getMessengerRuntimeConfig,
  resetMessengerRuntimeConfig,
  saveMessengerRuntimeConfigOverride,
} from "@mantle/messenger-core/runtimeConfig";
import {
  ZERO_ADDRESS,
  mainConnectorAbi,
} from "@mantle/messenger-core/contracts";

function shortAddress(address: string) {
  if (!address) return "not configured";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

type DetectionState =
  | {
      status: "idle";
    }
  | {
      status: "checking";
    }
  | {
      status: "ok";
      chainId: number;
      chainName: string;
      nativeCurrencyName: string;
      nativeCurrencySymbol: string;
      nativeCurrencyDecimals: number;
      appNetwork: string;
      clientVersion?: string;
      contractOk: boolean;
      contractMessage: string;
    }
  | {
      status: "error";
      message: string;
      chainId?: number;
      chainName?: string;
      clientVersion?: string;
    };

export function DeveloperConfigPanel() {
  const defaults = useMemo(() => getDefaultMessengerRuntimeConfig(), []);
  const current = useMemo(() => getMessengerRuntimeConfig(), []);

  const [open, setOpen] = useState(false);
  const [rpcUrl, setRpcUrl] = useState(current.rpcUrl);
  const [mainConnectorAddress, setMainConnectorAddress] = useState(
    current.mainConnectorAddress
  );
  const [detection, setDetection] = useState<DetectionState>({
    status: "idle",
  });

  async function detect(nextRpcUrl = rpcUrl, nextMain = mainConnectorAddress) {
    const cleanRpcUrl = nextRpcUrl.trim();
    const cleanMain = nextMain.trim();

    if (!cleanRpcUrl) {
      setDetection({
        status: "error",
        message: "RPC URL is empty.",
      });
      return;
    }

    if (cleanMain && !isAddress(cleanMain)) {
      setDetection({
        status: "error",
        message: "MainConnector address is invalid.",
      });
      return;
    }

    setDetection({ status: "checking" });

    try {
      const client = createPublicClient({
        transport: http(cleanRpcUrl),
      });

      const [chainId, clientVersionResult] = await Promise.all([
        client.getChainId(),
        client
          .request({
            method: "web3_clientVersion",
          })
          .catch(() => undefined),
      ]);

      const known = getKnownChainMetadata(chainId);
      const chainName = known?.chainName || `Unknown chain ${chainId}`;
      const nativeCurrencyName = known?.nativeCurrencyName || "Ether";
      const nativeCurrencySymbol = known?.nativeCurrencySymbol || "ETH";
      const nativeCurrencyDecimals = known?.nativeCurrencyDecimals || 18;
      const appNetwork = known?.appNetwork || `chain-${chainId}`;

      if (!cleanMain) {
        setDetection({
          status: "error",
          message: "MainConnector address is empty.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        });
        return;
      }

      const bytecode = await client.getBytecode({
        address: cleanMain as Address,
      });

      if (!bytecode || bytecode === "0x") {
        setDetection({
          status: "error",
          message: "No contract bytecode at MainConnector address on this RPC.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        });
        return;
      }

      try {
        await client.readContract({
          address: cleanMain as Address,
          abi: mainConnectorAbi,
          functionName: "getUserByAddress",
          args: [ZERO_ADDRESS],
        });
      } catch {
        setDetection({
          status: "error",
          message:
            "Contract exists, but does not respond like MainConnector on this network.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        });
        return;
      }

      setDetection({
        status: "ok",
        chainId,
        chainName,
        nativeCurrencyName,
        nativeCurrencySymbol,
        nativeCurrencyDecimals,
        appNetwork,
        clientVersion:
          typeof clientVersionResult === "string"
            ? clientVersionResult
            : undefined,
        contractOk: true,
        contractMessage: "MainConnector verified.",
      });
    } catch {
      setDetection({
        status: "error",
        message: "Cannot connect to RPC URL.",
      });
    }
  }

  async function save() {
    await detect();

    const cleanRpcUrl = rpcUrl.trim();
    const cleanMain = mainConnectorAddress.trim();

    if (detection.status !== "ok") {
      // React state may not be updated yet after detect(), so run direct validation.
      const client = createPublicClient({
        transport: http(cleanRpcUrl),
      });

      try {
        const chainId = await client.getChainId();
        const known = getKnownChainMetadata(chainId);

        if (!cleanMain || !isAddress(cleanMain)) {
          alert("MainConnector address is invalid.");
          return;
        }

        const bytecode = await client.getBytecode({
          address: cleanMain as Address,
        });

        if (!bytecode || bytecode === "0x") {
          alert("No contract bytecode at MainConnector address on this RPC.");
          return;
        }

        await client.readContract({
          address: cleanMain as Address,
          abi: mainConnectorAbi,
          functionName: "getUserByAddress",
          args: [ZERO_ADDRESS],
        });

        saveMessengerRuntimeConfigOverride({
          rpcUrl: cleanRpcUrl,
          mainConnectorAddress: cleanMain as Address,
          chainId,
          chainName: known?.chainName || `Unknown chain ${chainId}`,
          nativeCurrencyName: known?.nativeCurrencyName || "Ether",
          nativeCurrencySymbol: known?.nativeCurrencySymbol || "ETH",
          nativeCurrencyDecimals: known?.nativeCurrencyDecimals || 18,
          appNetwork: known?.appNetwork || `chain-${chainId}`,
        });

        window.location.reload();
        return;
      } catch {
        alert("Network or MainConnector validation failed.");
        return;
      }
    }

    saveMessengerRuntimeConfigOverride({
      rpcUrl: cleanRpcUrl,
      mainConnectorAddress: cleanMain as Address,
      chainId: detection.chainId,
      chainName: detection.chainName,
      nativeCurrencyName: detection.nativeCurrencyName,
      nativeCurrencySymbol: detection.nativeCurrencySymbol,
      nativeCurrencyDecimals: detection.nativeCurrencyDecimals,
      appNetwork: detection.appNetwork,
    });

    window.location.reload();
  }

  function reset() {
    resetMessengerRuntimeConfig();
    window.location.reload();
  }

  const shownChainId =
    detection.status === "ok" || detection.status === "error"
      ? detection.chainId ?? current.chainId
      : current.chainId;

  const shownChainName =
    detection.status === "ok" || detection.status === "error"
      ? detection.chainName ?? current.chainName
      : current.chainName;

  return (
    <div className="devConfig">
      <button
        className="devConfigToggle"
        onClick={() => {
          setOpen((value) => !value);

          if (!open) {
            void detect();
          }
        }}
      >
        Dev · {shownChainName} · chain {shownChainId} ·{" "}
        {shortAddress(current.mainConnectorAddress)}
      </button>

      {open && (
        <div className="devConfigPopover">
          <header>
            <div>
              <strong>Developer config</strong>
              <span>Enter RPC URL and MainConnector. Network is detected.</span>
            </div>

            <button onClick={() => setOpen(false)}>×</button>
          </header>

          <label>
            RPC URL
            <input
              value={rpcUrl}
              onChange={(event) => {
                setRpcUrl(event.target.value);
                setDetection({ status: "idle" });
              }}
              onBlur={() => {
                void detect();
              }}
              placeholder={defaults.rpcUrl}
            />
          </label>

          <label>
            MainConnector address
            <input
              value={mainConnectorAddress}
              onChange={(event) => {
                setMainConnectorAddress(
                  event.target.value as typeof mainConnectorAddress
                );
                setDetection({ status: "idle" });
              }}
              onBlur={() => {
                void detect();
              }}
              placeholder={defaults.mainConnectorAddress || "0x..."}
            />
          </label>

          <section
            className={`devDetectedBox ${
              detection.status === "ok"
                ? "ok"
                : detection.status === "error"
                  ? "error"
                  : ""
            }`}
          >
            {detection.status === "checking" && <strong>Checking…</strong>}

            {detection.status === "idle" && (
              <strong>Change RPC or contract to check config.</strong>
            )}

            {detection.status === "error" && (
              <>
                <strong>Config error</strong>
                <span>{detection.message}</span>
                {detection.chainId && <code>chain id: {detection.chainId}</code>}
                {detection.chainName && <code>network: {detection.chainName}</code>}
                {detection.clientVersion && (
                  <code>client: {detection.clientVersion}</code>
                )}
              </>
            )}

            {detection.status === "ok" && (
              <>
                <strong>Config looks good</strong>
                <code>network: {detection.chainName}</code>
                <code>chain id: {detection.chainId}</code>
                <code>
                  native token: {detection.nativeCurrencySymbol} (
                  {detection.nativeCurrencyDecimals} decimals)
                </code>
                {detection.clientVersion && (
                  <code>client: {detection.clientVersion}</code>
                )}
                <code>{detection.contractMessage}</code>
              </>
            )}
          </section>

          <section className="devConfigDefaults">
            <strong>Defaults from env</strong>
            <code>rpc: {defaults.rpcUrl}</code>
            <code>main: {defaults.mainConnectorAddress || "not configured"}</code>
            <code>network: {defaults.chainName}</code>
            <code>chain id: {defaults.chainId}</code>
            <code>
              native token: {defaults.nativeCurrencySymbol} (
              {defaults.nativeCurrencyDecimals} decimals)
            </code>
          </section>

          <footer>
            <button className="ghostButton" onClick={reset}>
              Reset to defaults
            </button>

            <button
              className="ghostButton"
              onClick={() => {
                void detect();
              }}
            >
              Check
            </button>

            <button className="primaryButton" onClick={() => void save()}>
              Save & reload
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
