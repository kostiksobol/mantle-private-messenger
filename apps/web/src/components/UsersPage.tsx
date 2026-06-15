import { useMemo, useState } from "react";
import type { Address } from "viem";

import { normalizeAddress } from "@mantle/messenger-core/db";
import type {
  WalletAccountInfo,
  WalletProviderInfo,
} from "../hooks/useAppWallet";
import type { IdentityRegistryProfile } from "../hooks/useIdentityRegistry";
import type { LocalSignerAccount } from "../identity/localSignerAccounts";
import { DeveloperConfigPanel } from "./DeveloperConfigPanel";

async function copyAddress(address: string) {
  await navigator.clipboard.writeText(address);
}

function profileTitle(profile: IdentityRegistryProfile) {
  return profile.name.trim() || profile.login.trim() || "Registered user";
}

type IdentitySource = {
  id: string;
  name: string;
  icon?: string;
};

type IdentityItem = {
  id: string;
  address: Address;
  sourceId: string;
  sourceName: string;
  sourceIcon?: string;
  kind: "wallet" | "local";
  profile?: IdentityRegistryProfile;
  balance?: string;
  walletAccount?: WalletAccountInfo;
  localAccount?: LocalSignerAccount;
};

type UsersPageProps = {
  appChainName: string;
  appChainId: number;

  walletProviders: WalletProviderInfo[];
  walletAccounts: WalletAccountInfo[];
  registeredProfiles: Map<string, IdentityRegistryProfile>;
  balances: Map<string, string>;
  connectingProviderId?: string;

  localAccounts: LocalSignerAccount[];

  onConnectWalletProvider: (providerId: string) => void;
  onRefreshWalletAccounts: () => void;
  onSelectWalletAccount: (account: WalletAccountInfo) => void;
  onCreateLocalAccount: () => void;
  onSelectLocalAccount: (account: LocalSignerAccount) => void;
};

export function UsersPage({
  appChainName,
  appChainId,
  walletProviders,
  walletAccounts,
  registeredProfiles,
  balances,
  connectingProviderId,
  localAccounts,
  onConnectWalletProvider,
  onRefreshWalletAccounts,
  onSelectWalletAccount,
  onCreateLocalAccount,
  onSelectLocalAccount,
}: UsersPageProps) {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [registrationFilter, setRegistrationFilter] = useState<
    "all" | "registered" | "unregistered"
  >("all");
  const [copiedAddress, setCopiedAddress] = useState("");

  const connectedProviderIds = useMemo(() => {
    return new Set(walletAccounts.map((account) => account.providerId));
  }, [walletAccounts]);

  const disconnectedProviders = useMemo(() => {
    return walletProviders.filter((provider) => !connectedProviderIds.has(provider.id));
  }, [connectedProviderIds, walletProviders]);

  const sources = useMemo<IdentitySource[]>(() => {
    const map = new Map<string, IdentitySource>();

    for (const account of walletAccounts) {
      map.set(account.providerId, {
        id: account.providerId,
        name: account.providerName,
        icon: account.providerIcon,
      });
    }

    if (localAccounts.length > 0) {
      map.set("local", {
        id: "local",
        name: "Local",
      });
    }

    return [
      {
        id: "all",
        name: "All",
      },
      ...Array.from(map.values()),
    ];
  }, [localAccounts.length, walletAccounts]);

  const items = useMemo<IdentityItem[]>(() => {
    const walletItems = walletAccounts.map((account): IdentityItem => {
      const addressKey = normalizeAddress(account.address);

      return {
        id: `${account.providerId}:${addressKey}`,
        address: account.address,
        sourceId: account.providerId,
        sourceName: account.providerName,
        sourceIcon: account.providerIcon,
        kind: "wallet",
        profile: registeredProfiles.get(addressKey),
        balance: balances.get(addressKey),
        walletAccount: account,
      };
    });

    const localItems = localAccounts.map((account): IdentityItem => {
      const addressKey = normalizeAddress(account.address);

      return {
        id: `local:${account.id}`,
        address: account.address,
        sourceId: "local",
        sourceName: "Local",
        kind: "local",
        profile: registeredProfiles.get(addressKey),
        balance: balances.get(addressKey),
        localAccount: account,
      };
    });

    return [...walletItems, ...localItems].filter((item) => {
      if (sourceFilter !== "all" && item.sourceId !== sourceFilter) {
        return false;
      }

      const registered = Boolean(item.profile);

      if (registrationFilter === "registered") {
        return registered;
      }

      if (registrationFilter === "unregistered") {
        return !registered;
      }

      return true;
    });
  }, [
    balances,
    localAccounts,
    registeredProfiles,
    registrationFilter,
    sourceFilter,
    walletAccounts,
  ]);

  async function copy(address: string) {
    await copyAddress(address);
    setCopiedAddress(address);

    window.setTimeout(() => {
      setCopiedAddress((current) => (current === address ? "" : current));
    }, 900);
  }

  function selectItem(item: IdentityItem) {
    if (item.walletAccount) {
      onSelectWalletAccount(item.walletAccount);
      return;
    }

    if (item.localAccount) {
      onSelectLocalAccount(item.localAccount);
    }
  }

  return (
    <main className="identityShell">
      <DeveloperConfigPanel />
      <section className="identityHero">
        <p className="eyebrow">Mantle Private Messenger</p>
        <p>
          Choose a browser wallet account or a local signer account.
        </p>
        <p className="identityNetwork">
          Network: {appChainName} / chain id {appChainId}
        </p>
      </section>

      <section className="identitySinglePanel">
        <div className="identityPanelHeader">
          <div>
            <h2>Users</h2>
            <p>
              Registered users show their messenger name. Unregistered users show
              only their blockchain address.
            </p>
          </div>

          <div className="identityHeaderActions">
            <button className="ghostButton" onClick={onRefreshWalletAccounts}>
              Refresh
            </button>

            <button className="primaryButton" onClick={onCreateLocalAccount}>
              Create local signer
            </button>
          </div>
        </div>

        {disconnectedProviders.length > 0 && (
          <div className="walletProviderStrip">
            {disconnectedProviders.map((provider) => (
              <button
                key={provider.id}
                className="walletProviderButton compact"
                onClick={() => onConnectWalletProvider(provider.id)}
                disabled={connectingProviderId === provider.id}
              >
                {provider.icon ? (
                  <img src={provider.icon} alt="" aria-hidden="true" />
                ) : (
                  <span className="walletProviderIconFallback">◇</span>
                )}

                <span>
                  <strong>{provider.name}</strong>
                  {provider.rdns && <small>{provider.rdns}</small>}
                </span>

                <em>
                  {connectingProviderId === provider.id ? "Connecting" : "Connect"}
                </em>
              </button>
            ))}
          </div>
        )}

        <div className="identityFilters">
          <div className="filterGroup">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`filterChip ${
                  sourceFilter === source.id ? "active" : ""
                }`}
                onClick={() => setSourceFilter(source.id)}
              >
                {source.icon && <img src={source.icon} alt="" aria-hidden="true" />}
                {source.name}
              </button>
            ))}
          </div>

          <div className="filterGroup">
            <button
              className={`filterChip ${
                registrationFilter === "all" ? "active" : ""
              }`}
              onClick={() => setRegistrationFilter("all")}
            >
              All
            </button>

            <button
              className={`filterChip ${
                registrationFilter === "registered" ? "active" : ""
              }`}
              onClick={() => setRegistrationFilter("registered")}
            >
              Registered
            </button>

            <button
              className={`filterChip ${
                registrationFilter === "unregistered" ? "active" : ""
              }`}
              onClick={() => setRegistrationFilter("unregistered")}
            >
              Not registered
            </button>
          </div>
        </div>

        <div className="identityTable">
          {items.length === 0 ? (
            <div className="emptyIdentityState">
              No users match the selected filters.
            </div>
          ) : (
            items.map((item) => {
              const registered = Boolean(item.profile);

              return (
                <div key={item.id} className="identityTableRow">
                  <button
                    className="identityMainButton"
                    onClick={() => selectItem(item)}
                  >
                    <span className="identityAvatar">
                      {item.profile
                        ? profileTitle(item.profile).slice(0, 1).toUpperCase()
                        : "0x"}
                    </span>

                    <span className="identityMainText">
                      {item.profile ? (
                        <>
                          <strong>{profileTitle(item.profile)}</strong>
                          <code>{item.address}</code>
                        </>
                      ) : (
                        <code className="identityOnlyAddress">
                          {item.address}
                        </code>
                      )}
                    </span>
                  </button>

                  <div className="identityMeta">
                    <span className="identityBalance">
                      {item.balance || "loading…"}
                    </span>

                    <span className="identitySourcePill">
                      {item.sourceIcon && (
                        <img src={item.sourceIcon} alt="" aria-hidden="true" />
                      )}
                      {item.sourceName}
                    </span>

                    <span
                      className={`registrationStatusBadge ${
                        registered ? "registered" : "unregistered"
                      }`}
                    >
                      {registered ? "registered" : "not registered"}
                    </span>
                  </div>

                  <button
                    className={`copyIconButton ${
                      copiedAddress === item.address ? "copied" : ""
                    }`}
                    onClick={() => void copy(item.address)}
                    title="Copy full address"
                    aria-label="Copy full address"
                  />
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
