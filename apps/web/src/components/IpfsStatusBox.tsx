import { useState } from "react";

import type { LocalIpfsStatus } from "../lib/ipfs/localIpfs";

type IpfsStatusBoxProps = {
  status: LocalIpfsStatus;
  checking: boolean;
  onCheck: () => Promise<void>;
};

export function IpfsStatusBox({
  status,
  checking,
  onCheck,
}: IpfsStatusBoxProps) {
  const [open, setOpen] = useState(false);
  const connected = status.state === "connected";

  return (
    <>
      <section className={connected ? "ipfsStatusBox connected" : "ipfsStatusBox"}>
        <div>
          <label>Encrypted files</label>
          <strong>{connected ? "IPFS ready" : "Text-only mode"}</strong>
          <p>
            {connected
              ? "You can send files and receive encrypted attachments."
              : "Messages work normally. Connect IPFS to send and receive files."}
          </p>
        </div>

        <div className="ipfsStatusActions">
          <button type="button" onClick={() => setOpen(true)}>
            Setup
          </button>

          <button
            type="button"
            disabled={checking}
            onClick={() => {
              void onCheck();
            }}
          >
            {checking ? "Checking..." : connected ? "Recheck" : "Enable IPFS"}
          </button>
        </div>
      </section>

      {open && (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="ipfsModal"
            role="dialog"
            aria-modal="true"
            aria-label="Enable IPFS"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>IPFS mode</span>
                <h2>Enable encrypted attachments</h2>
              </div>

              <button
                className="modalCloseButton"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <ol>
              <li>Install IPFS Desktop or run Kubo locally.</li>
              <li>Start the local IPFS node.</li>
              <li>Install and enable IPFS Companion.</li>
              <li>Click “Enable IPFS”.</li>
            </ol>

            <section className="ipfsHelpBlock">
              <h3>Status</h3>
              <p>{status.message}</p>
            </section>

            <section className="ipfsHelpBlock">
              <h3>If browser access is blocked</h3>
              <p>
                Allow this app origin in Kubo CORS settings and restart IPFS
                Desktop/Kubo.
              </p>

              <pre>
{`ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173", "http://127.0.0.1:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization", "Content-Type"]'`}
              </pre>
            </section>

            <footer>
              <button
                type="button"
                onClick={() => {
                  void onCheck();
                }}
                disabled={checking}
              >
                {checking ? "Checking..." : "Enable IPFS"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
