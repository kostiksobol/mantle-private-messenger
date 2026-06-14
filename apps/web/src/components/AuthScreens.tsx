import { shortAddress } from "./format";

type ConnectScreenProps = {
  appChainName: string;
  appChainId: number;
  disabled: boolean;
  onConnect: () => void;
};

export function ConnectScreen({
  appChainName,
  appChainId,
  disabled,
  onConnect,
}: ConnectScreenProps) {
  return (
    <main className="authPage">
      <section className="authCard">
        <div className="brandMark">M</div>

        <h1>Private Messenger</h1>

        <p>Wallet-native encrypted messaging over EVM contracts.</p>

        <button
          className="primaryButton full"
          onClick={onConnect}
          disabled={disabled}
        >
          Connect wallet
        </button>

        <div className="authHint">
          Configured network: {appChainName} · {appChainId}
        </div>
      </section>
    </main>
  );
}

type WrongNetworkScreenProps = {
  currentChainId?: number;
  appChainName: string;
  appChainId: number;
  onSwitchNetwork: () => Promise<void>;
  onDisconnect: () => void;
};

export function WrongNetworkScreen({
  currentChainId,
  appChainName,
  appChainId,
  onSwitchNetwork,
  onDisconnect,
}: WrongNetworkScreenProps) {
  return (
    <main className="authPage">
      <section className="authCard">
        <div className="brandMark warning">!</div>

        <h1>Wrong network</h1>

        <p>
          Your wallet is on chain {currentChainId}. This app is configured for{" "}
          {appChainName} / {appChainId}.
        </p>

        <button
          className="primaryButton full"
          onClick={() => {
            void onSwitchNetwork();
          }}
        >
          Switch network
        </button>

        <button className="ghostButton full" onClick={onDisconnect}>
          Disconnect
        </button>
      </section>
    </main>
  );
}

type OnboardingScreenProps = {
  ownerAddress?: string;
  appChainName: string;
  rsaReady: boolean;
  login: string;
  displayName: string;
  busy: boolean;
  activity: string[];
  onLoginChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onEnsureKeys: () => Promise<void>;
  onRegister: () => Promise<void>;
  onDisconnect: () => void;
};

export function OnboardingScreen({
  ownerAddress,
  appChainName,
  rsaReady,
  login,
  displayName,
  busy,
  activity,
  onLoginChange,
  onDisplayNameChange,
  onEnsureKeys,
  onRegister,
  onDisconnect,
}: OnboardingScreenProps) {
  return (
    <main className="authPage">
      <section className="authCard onboardingCard">
        <div className="brandMark">M</div>

        <h1>Create profile</h1>

        <p>Register an on-chain profile. Your RSA key stays in localStorage.</p>

        <div className="statusPills">
          <span>{shortAddress(ownerAddress)}</span>
          <span>{appChainName}</span>
          <span className={rsaReady ? "greenPill" : "yellowPill"}>
            RSA {rsaReady ? "ready" : "missing"}
          </span>
        </div>

        <input
          placeholder="Login"
          value={login}
          onChange={(event) => onLoginChange(event.target.value)}
        />

        <input
          placeholder="Display name"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
        />

        <div className="splitButtons">
          <button
            disabled={busy}
            onClick={() => {
              void onEnsureKeys();
            }}
          >
            Ensure RSA
          </button>

          <button
            className="primaryButton"
            disabled={busy || !login.trim()}
            onClick={() => {
              void onRegister();
            }}
          >
            Register
          </button>
        </div>

        <button className="ghostButton full" onClick={onDisconnect}>
          Disconnect
        </button>

        <div className="miniActivity">
          {activity.slice(0, 6).map((item, index) => (
            <div key={`${item}-${index}`}>{item}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
