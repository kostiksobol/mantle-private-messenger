import { useEffect } from "react";

import { MAIN_CONNECTOR_ADDRESS } from "@mantle/messenger-core/contracts";
import { startBlockchainSyncer } from "@mantle/messenger-core/syncer";

type StartSyncerArgs = Parameters<typeof startBlockchainSyncer>[0];

type UseBlockchainSyncerArgs = {
  ownerAddress?: StartSyncerArgs["ownerAddress"];
  publicClient?: StartSyncerArgs["publicClient"];
  syncNonce: number;
  addActivity: (message: string) => void;
};

export function useBlockchainSyncer({
  ownerAddress,
  publicClient,
  syncNonce,
  addActivity,
}: UseBlockchainSyncerArgs) {
  useEffect(() => {
    if (!ownerAddress || !publicClient || !MAIN_CONNECTOR_ADDRESS) {
      return;
    }

    addActivity("syncer start");

    const stop = startBlockchainSyncer({
      ownerAddress,
      publicClient,
      mainConnectorAddress: MAIN_CONNECTOR_ADDRESS,
    });

    return () => {
      addActivity("syncer stop");
      stop();
    };
  }, [addActivity, ownerAddress, publicClient, syncNonce]);
}
