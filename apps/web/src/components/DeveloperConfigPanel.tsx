import { useMemo, useState } from "react";
import { createPublicClient, http, type Address } from "viem";

import {
  applySavedMessengerRuntimeContext,
  deleteSavedMessengerRuntimeContext,
  getDefaultMessengerRuntimeConfig,
  getKnownChainMetadata,
  getMessengerRuntimeConfig,
  getSavedMessengerRuntimeContexts,
  resetMessengerRuntimeConfig,
  saveMessengerRuntimeConfigOverride,
  saveMessengerRuntimeContext,
  type SavedMessengerRuntimeContext,
} from "@mantle/messenger-core/runtimeConfig";
import {
  ZERO_ADDRESS,
  mainConnectorAbi,
} from "@mantle/messenger-core/contracts";

function shortAddress(address: string) {
  if (!address) return "not configured";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function rpcLabel(rpcUrl: string) {
  try {
    const url = new URL(rpcUrl);
    return url.host || rpcUrl;
  } catch {
    return rpcUrl;
  }
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

type OkDetection = {
  status: "ok";
  chainId: number;
  chainName: string;
  nativeCurrencyName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  appNetwork: string;
  clientVersion?: string;
  contractMessage: string;
};

type DetectionState =
  | {
      status: "idle";
    }
  | {
      status: "checking";
    }
  | OkDetection
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
  const [savedContexts, setSavedContexts] = useState(() =>
    getSavedMessengerRuntimeContexts()
  );

  async function validateConfig(args: {
    rpcUrl: string;
    mainConnectorAddress: string;
  }): Promise<DetectionState> {
    const cleanRpcUrl = args.rpcUrl.trim();
    const cleanMain = args.mainConnectorAddress.trim();

    if (!cleanRpcUrl) {
      return {
        status: "error",
        message: "RPC URL is empty.",
      };
    }

    if (cleanMain && !isAddress(cleanMain)) {
      return {
        status: "error",
        message: "MainConnector address is invalid.",
      };
    }

    try {
      const client = createPublicClient({
        transport: http(cleanRpcUrl),
      });

      const [chainId, clientVersionResult] = await Promise.all([
        client.getChainId(),
        (client as any)
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
        return {
          status: "error",
          message: "MainConnector address is empty.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        };
      }

      const bytecode = await client.getBytecode({
        address: cleanMain as Address,
      });

      if (!bytecode || bytecode === "0x") {
        return {
          status: "error",
          message: "No contract bytecode at MainConnector address on this RPC.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        };
      }

      try {
        await client.readContract({
          address: cleanMain as Address,
          abi: mainConnectorAbi,
          functionName: "getUserByAddress",
          args: [ZERO_ADDRESS],
        } as any);
      } catch {
        return {
          status: "error",
          message:
            "Contract exists, but does not respond like MainConnector on this network.",
          chainId,
          chainName,
          clientVersion:
            typeof clientVersionResult === "string"
              ? clientVersionResult
              : undefined,
        };
      }

      return {
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
        contractMessage: "MainConnector verified.",
      };
    } catch {
      return {
        status: "error",
        message: "Cannot connect to RPC URL.",
      };
    }
  }

  async function detect() {
    setDetection({ status: "checking" });

    const result = await validateConfig({
      rpcUrl,
      mainConnectorAddress,
    });

    setDetection(result);

    return result;
  }

  function contextFromDetection(result: OkDetection) {
    return {
      label: `${result.chainName} · ${shortAddress(mainConnectorAddress)}`,
      rpcUrl: rpcUrl.trim(),
      mainConnectorAddress: mainConnectorAddress.trim() as Address,
      chainId: result.chainId,
      chainName: result.chainName,
      nativeCurrencyName: result.nativeCurrencyName,
      nativeCurrencySymbol: result.nativeCurrencySymbol,
      nativeCurrencyDecimals: result.nativeCurrencyDecimals,
      appNetwork: result.appNetwork,
    };
  }

  async function save() {
    const result = await detect();

    if (result.status !== "ok") {
      alert(result.status === "error" ? result.message : "Config validation failed.");
      return;
    }

    const context = contextFromDetection(result);

    saveMessengerRuntimeConfigOverride(context);
    saveMessengerRuntimeContext(context);

    window.location.reload();
  }

  function reset() {
    resetMessengerRuntimeConfig();
    window.location.reload();
  }

  function switchToContext(context: SavedMessengerRuntimeContext) {
    applySavedMessengerRuntimeContext(context);
    window.location.reload();
  }

  function removeContext(id: string) {
    deleteSavedMessengerRuntimeContext(id);
    setSavedContexts(getSavedMessengerRuntimeContexts());
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
            setSavedContexts(getSavedMessengerRuntimeContexts());
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
              <span>Switch between saved RPC/MainConnector contexts.</span>
            </div>

            <button onClick={() => setOpen(false)}>×</button>
          </header>

          {savedContexts.length > 0 && (
            <section className="devSavedContexts">
              <strong>Known contexts</strong>

              <div className="devSavedContextList">
                {savedContexts.map((context) => {
                  const active =
                    context.rpcUrl === current.rpcUrl &&
                    context.mainConnectorAddress.toLowerCase() ===
                      current.mainConnectorAddress.toLowerCase() &&
                    context.chainId === current.chainId;

                  return (
                    <div
                      key={context.id}
                      className={`devSavedContext ${active ? "active" : ""}`}
                    >
                      <button onClick={() => switchToContext(context)}>
                        <span>
                          <strong>{context.chainName}</strong>
                          <small>
                            chain {context.chainId} ·{" "}
                            {context.nativeCurrencySymbol}
                          </small>
                        </span>

                        <code>{shortAddress(context.mainConnectorAddress)}</code>
                        <em>{rpcLabel(context.rpcUrl)}</em>
                      </button>

                      <button
                        className="devSavedContextDelete"
                        onClick={() => removeContext(context.id)}
                        title="Remove saved context"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

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

            <button className="ghostButton" onClick={() => void detect()}>
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
