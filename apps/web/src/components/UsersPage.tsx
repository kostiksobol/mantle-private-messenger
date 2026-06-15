import type { Address } from "viem";

import type { LocalSignerAccount } from "../identity/localSignerAccounts";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type UsersPageProps = {
  appChainName: string;
  appChainId: number;

  isWalletConnected: boolean;
  walletAccounts: Address[];
  walletConnectDisabled: boolean;
  walletConnecting: boolean;

  localAccounts: LocalSignerAccount[];

  onConnectWallet: () => void;
  onRefreshWalletAccounts: () => void;
  onSelectWalletAccount: (address: Address) => void;
  onCreateLocalAccount: () => void;
  onSelectLocalAccount: (account: LocalSignerAccount) => void;
  onDeleteLocalAccount: (id: string) => void;
};

export function UsersPage({
  appChainName,
  appChainId,
  isWalletConnected,
  walletAccounts,
  walletConnectDisabled,
  walletConnecting,
  localAccounts,
  onConnectWallet,
  onRefreshWalletAccounts,
  onSelectWalletAccount,
  onCreateLocalAccount,
  onSelectLocalAccount,
  onDeleteLocalAccount,
}: UsersPageProps) {
  return (
    <main className="identityShell">
      <section className="identityHero">
        <p className="eyebrow">Mantle Private Messenger</p>
        <h1>Select user</h1>
        <p>
          Choose a browser-wallet user or create a local signer user that signs
          blockchain transactions without wallet popups.
        </p>
        <p className="identityNetwork">
          Network: {appChainName} / chain id {appChainId}
        </p>
      </section>

      <section className="identityGrid">
        <div className="identityCard">
          <div className="identityCardHeader">
            <div>
              <h2>Browser wallet users</h2>
              <p>Uses wallet private key inside MetaMask/Rabby/etc.</p>
            </div>

            <button
              className="ghostButton"
              onClick={onRefreshWalletAccounts}
              disabled={!isWalletConnected}
            >
              Refresh
            </button>
          </div>

          {!isWalletConnected ? (
            <button
              className="primaryButton full"
              onClick={onConnectWallet}
              disabled={walletConnectDisabled}
            >
              {walletConnecting ? "Connecting..." : "Connect wallet"}
            </button>
          ) : walletAccounts.length === 0 ? (
            <div className="emptyIdentityState">
              Wallet is connected, but no accounts are exposed to this app.
            </div>
          ) : (
            <div className="identityList">
              {walletAccounts.map((address) => (
                <button
                  key={address}
                  className="identityRow"
                  onClick={() => onSelectWalletAccount(address)}
                >
                  <span>
                    <strong>Wallet user</strong>
                    <small>{shortAddress(address)}</small>
                  </span>
                  <span className="identityBadge">wallet</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="identityCard">
          <div className="identityCardHeader">
            <div>
              <h2>Local signer users</h2>
              <p>
                Stores an EVM private key locally and signs transactions
                automatically.
              </p>
            </div>

            <button className="primaryButton" onClick={onCreateLocalAccount}>
              Register another user
            </button>
          </div>

          {localAccounts.length === 0 ? (
            <div className="emptyIdentityState">
              No local signer users yet. Create one to test autonomous agent
              mode.
            </div>
          ) : (
            <div className="identityList">
              {localAccounts.map((account) => (
                <div key={account.id} className="identityRowWrap">
                  <button
                    className="identityRow"
                    onClick={() => onSelectLocalAccount(account)}
                  >
                    <span>
                      <strong>{account.label}</strong>
                      <small>{shortAddress(account.address)}</small>
                    </span>
                    <span className="identityBadge">local signer</span>
                  </button>

                  <button
                    className="dangerMiniButton"
                    onClick={() => onDeleteLocalAccount(account.id)}
                    title="Delete local signer key"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
