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
          <label>Attachments</label>
          <strong>{connected ? "IPFS connected" : "IPFS not connected"}</strong>
          <p>
            {connected
              ? "File attachments will be available."
              : "You can read text messages. File previews are disabled."}
          </p>
        </div>

        <div className="ipfsStatusActions">
          <button onClick={() => setOpen(true)}>Connect IPFS</button>
          <button
            disabled={checking}
            onClick={() => {
              void onCheck();
            }}
          >
            {checking ? "Checking..." : "Check"}
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
            aria-label="Connect IPFS"
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
              <li>Click “Check IPFS connection”.</li>
            </ol>

            <section className="ipfsHelpBlock">
              <h3>Current check</h3>
              <p>{status.message}</p>
              <code>{status.apiUrl}</code>
            </section>

            <section className="ipfsHelpBlock">
              <h3>If browser access is blocked</h3>
              <p>
                Your local node may be running, but the browser may not be
                allowed to access the Kubo RPC API. In that case, allow this
                app origin in Kubo CORS settings and restart IPFS Desktop/Kubo.
              </p>

              <pre>
{`ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173", "http://127.0.0.1:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization", "Content-Type"]'`}
              </pre>
            </section>

            <footer>
              <button
                onClick={() => {
                  void onCheck();
                }}
                disabled={checking}
              >
                {checking ? "Checking..." : "Check IPFS connection"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
