# Mantle Private Messenger

A browser-based private messenger built on Mantle-compatible smart contracts.

Mantle Private Messenger is an encrypted on-chain messaging demo where users own their accounts, exchange encrypted invitations, send encrypted messages, and share encrypted IPFS attachments. The blockchain is used as an availability and ordering layer, while readable content is reconstructed locally in the browser.

The project is split into several repositories:

* Web app: https://github.com/kostiksobol/mantle-private-messenger
* Messenger core: https://github.com/kostiksobol/mantle-messenger-core
* Solidity contracts: https://github.com/kostiksobol/mantle-messenger-contracts
* AI agent core: https://github.com/kostiksobol/mantle-messenger-ai-agent-core
* Protocol landing page: https://github.com/kostiksobol/mantle-messenger-site

## What this repository contains

This repository contains the web application.

It provides:

* wallet and local signer user selection
* user registration flow
* encrypted invitation discovery
* encrypted chat UI
* encrypted file attachment UI
* IPFS attachment upload/download flow
* local IndexedDB messenger state
* developer network configuration panel
* support for Mantle Sepolia and local Anvil development

The protocol logic itself lives mostly in `@mantle/messenger-core`, and the Solidity contracts live in the separate contracts repository.

## High-level architecture

The system is intentionally split into four layers.

### 1. Web application

Repository:

https://github.com/kostiksobol/mantle-private-messenger

The web app is the user-facing interface. It handles wallet selection, local signer accounts, registration, chat screens, message composition, attachment rendering, and developer tooling.

The web app does not directly contain most of the protocol logic. Instead, it imports the shared messenger package:

```text
@mantle/messenger-core
```

This keeps the UI separated from the reusable protocol client logic.

### 2. Messenger core

Repository:

https://github.com/kostiksobol/mantle-messenger-core

The messenger core contains the reusable client-side logic:

* local database schema
* blockchain syncer
* contract read/write helpers
* encrypted invitation handling
* chat/message write actions
* local RSA messenger keys
* encrypted file helpers
* IPFS attachment caching
* runtime configuration helpers

The web app uses the core package as a dependency.

### 3. Solidity contracts

Repository:

https://github.com/kostiksobol/mantle-messenger-contracts

The contracts implement the on-chain coordination layer:

* user registry
* main connector contract
* encrypted invitation storage
* user account/message flow contracts

The chain stores encrypted payloads and protocol events. It does not store plaintext messages or plaintext files.

### 4. AI agent core

Repository:

https://github.com/kostiksobol/mantle-messenger-ai-agent-core

The AI agent core is a restricted wrapper around `@mantle/messenger-core`.

It is designed for AI-agent integrations that should be able to interact with the messenger protocol through a controlled API instead of raw wallet access or unrestricted contract calls.

Example allowed read operations:

* `health()`
* `selfProfile()`
* `localChats()`
* `localMessages(chatId)`
* `localInvitations()`

Example allowed write operations:

* `registerSelf(input)`
* `createChat(input)`
* `sendMessage(input)`
* `inviteUser(input)`
* `acceptInvitation(input)`

The goal is to let an agent help with messaging tasks without turning it into a fully unrestricted wallet or raw contract caller.

## Privacy model

Mantle Private Messenger does not try to make the blockchain private. Transactions, timestamps, sender addresses, gas usage, and some interaction metadata are still public.

Instead, the project focuses on keeping readable messenger content private.

The protocol tries to minimize what can be learned directly from public data:

* message text is encrypted before it is written
* file contents are encrypted before upload to IPFS
* invitations are stored as encrypted envelopes
* clients scan mixed invitation data and locally decrypt only what belongs to them
* each user writes encrypted chat state through their own account flow
* readable chat state is reconstructed locally inside the browser

This means the blockchain provides availability and ordering, while the browser provides readability.

## Key model

There are two different key layers.

### EVM transaction key

The EVM key is the wallet or local signer private key.

It is used for:

* signing transactions
* paying gas
* proving account ownership
* registering users
* writing encrypted protocol events

For browser wallets, this key is kept by the wallet extension.

For local signer users, the key is stored in browser `localStorage` by the app. This is intended for local development and demos, not production-grade custody.

### Messenger encryption keys

Messenger encryption keys are separate from the EVM transaction key.

They are used for:

* encrypted invitations
* local invitation decryption
* accessing chat keys
* decrypting readable messenger state

The messenger key layer is not used to sign blockchain transactions.

Keeping these two key systems separate is important:

```text
EVM key        -> signs transactions
Messenger key -> decrypts messenger data
```

## How encrypted invitations work

When a user creates or joins a chat, the app prepares an encrypted invitation for the recipient.

The invitation contains the data the recipient needs to join the chat, but it is encrypted before it reaches the shared contract.

The main contract receives only an encrypted invitation envelope.

All invitations are mixed in the shared connector contract. A client scans the mixed stream and attempts to decrypt envelopes locally. If the envelope is not intended for that user, it remains unreadable noise.

Simplified flow:

```text
Alice creates chat
        ↓
Browser creates/uses chat secret
        ↓
Invitation is encrypted for Bob
        ↓
Encrypted invitation is written to MainConnector
        ↓
Bob scans mixed invitations
        ↓
Bob decrypts only the envelope meant for him
        ↓
Bob reconstructs the chat locally
```

The contract does not need to understand the plaintext invitation.

## How encrypted messages work

Messages are encrypted in the browser before they are written through the protocol.

The on-chain layer receives encrypted event data. The browser syncer later reads those events, decrypts the ones the user can access, and stores the readable result locally.

Simplified flow:

```text
User writes message
        ↓
Browser encrypts message text
        ↓
Encrypted payload is written through the user's account flow
        ↓
Other participant syncs chain events
        ↓
Browser decrypts locally using chat key
        ↓
Readable message appears in local UI
```

Plaintext message text is not intentionally written to the blockchain.

## How encrypted file attachments work

Attachments are encrypted before IPFS upload.

The file flow is:

```text
User selects file
        ↓
Browser encrypts file bytes
        ↓
Encrypted bytes are uploaded to IPFS
        ↓
Message stores encrypted file metadata:
  - IPFS URL / CID
  - file name
  - MIME type
  - plaintext size
  - encrypted size
  - IV
        ↓
Recipient fetches encrypted bytes from IPFS
        ↓
Recipient decrypts locally
        ↓
File preview/download appears in the UI
```

IPFS stores encrypted bytes only. Anyone may be able to fetch the CID, but they should not be able to read the original file without the chat key.

For local demos, every browser profile that needs to load files must be able to access the IPFS gateway or companion setup used by the app.

## Local state

The web app stores local messenger state in the browser.

This includes:

* local signer accounts
* decrypted local chat state
* cached attachments
* local database records
* messenger encryption material

Different browser profiles have different `localStorage` and IndexedDB state. This is useful for demoing multiple users on one machine.

## Runtime configuration

The app is configured through Vite environment variables.

The main variables are:

```env
VITE_RPC_URL=https://rpc.sepolia.mantle.xyz
VITE_MAIN_CONNECTOR_ADDRESS=0x...
```

The current network metadata is inferred by the app-level Vite config from the RPC URL.

Typical environments:

### Mantle Sepolia

```env
VITE_RPC_URL=https://rpc.sepolia.mantle.xyz
VITE_MAIN_CONNECTOR_ADDRESS=0x...
```

### Local Anvil

```env
VITE_RPC_URL=http://127.0.0.1:8545
VITE_MAIN_CONNECTOR_ADDRESS=0x...
```

After changing `.env.local`, rebuild or restart the app.

## Install

Clone the app repository:

```bash
git clone https://github.com/kostiksobol/mantle-private-messenger.git
cd mantle-private-messenger
```

Install dependencies:

```bash
npm install
```

## Run development server

```bash
cd apps/web
npm run dev
```

Open the URL printed by Vite.

For two separate local demo sessions, run preview or dev servers on different ports and open them in different browser profiles.

Example:

```bash
cd apps/web
npm run preview -- --host 127.0.0.1 --port 4173
```

Second terminal:

```bash
cd apps/web
npm run preview -- --host 127.0.0.1 --port 4174
```

## Build

```bash
cd apps/web
npm run build
```

Vite outputs the production build to:

```text
apps/web/dist
```

Preview the production build:

```bash
cd apps/web
npm run preview
```

Or use an explicit port:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

## Local Anvil workflow

Start Anvil:

```bash
anvil
```

Switch the app to Anvil configuration by editing `.env.local` or using the provided helper script if present.

Then build or run the app:

```bash
cd apps/web
npm run dev
```

Local users need gas to register and send transactions. Fund demo addresses from an Anvil account.

Example:

```bash
cast send 0xRecipientAddress \
  --value 10ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545
```

## IPFS requirements

Encrypted attachments use IPFS.

For local development, run a local IPFS node and make sure the gateway is available:

```text
API:     http://127.0.0.1:5001
Gateway: http://127.0.0.1:8080/ipfs
```

Check IPFS:

```bash
ipfs id
```

If using browser profiles, make sure each profile has the required IPFS companion/setup or can access the configured gateway.

If a receiver sees attachment loading errors, check the gateway URL directly:

```bash
curl -I http://127.0.0.1:8080/ipfs/<CID>
```

## AI agent integration

The AI agent integration is handled by a separate package:

https://github.com/kostiksobol/mantle-messenger-ai-agent-core

The agent package is not the UI. It is a controlled client wrapper for automation.

It is designed around this principle:

```text
Agents should receive specific messenger capabilities,
not unrestricted wallet or contract access.
```

The agent core can reuse the same protocol logic as the web app:

* sync messenger state
* read local chats
* read local messages
* inspect invitations
* send allowed messages
* create allowed chats
* invite allowed users
* accept allowed invitations

But it should avoid exposing:

* arbitrary contract writes
* unrestricted wallet clients
* raw database mutation
* silent plaintext access without user-provided context

Possible AI agent use cases:

* summarize unread encrypted conversations
* draft replies for user approval
* monitor incoming invitations
* help operate service-style messenger accounts
* bridge messenger events into higher-level workflows
* provide controlled automated responses

The web app, messenger core, and agent core are intentionally separate so the same protocol can support both human UI and controlled automation.

## Repository structure

Current app repository structure:

```text
.
├── apps
│   └── web
│       ├── public
│       ├── src
│       ├── package.json
│       ├── vite.config.ts
│       └── ...
├── scripts
│   ├── fund-anvil-addresses.sh
│   ├── fund-mantle-sepolia-addresses.sh
│   ├── use-anvil.sh
│   └── use-mantle-sepolia.sh
├── package.json
├── package-lock.json
└── README.md
```

The app repository does not contain the Solidity contracts or messenger core source anymore. Those live in their own repositories.

## Related repositories

### Web app

https://github.com/kostiksobol/mantle-private-messenger

The React/Vite user interface.

### Messenger core

https://github.com/kostiksobol/mantle-messenger-core

Reusable TypeScript messenger logic used by the web app and AI agent package.

### Contracts

https://github.com/kostiksobol/mantle-messenger-contracts

Solidity contracts for the protocol.

### AI agent core

https://github.com/kostiksobol/mantle-messenger-ai-agent-core

Restricted AI-agent-facing messenger client built on top of messenger core.

### Protocol landing page

https://github.com/kostiksobol/mantle-messenger-site

Static GitHub Pages website explaining the protocol architecture.

## Security notes

This is an experimental private messenger protocol demo.

Important notes:

* local signer private keys are stored in browser storage
* browser storage is not hardware-wallet-grade custody
* transactions and timing are still public on-chain
* IPFS CIDs and encrypted file sizes can still be visible metadata
* privacy depends on correct local key handling
* do not put production secrets into demo local signer storage
* use browser wallets or better custody for real funds

## License

MIT
