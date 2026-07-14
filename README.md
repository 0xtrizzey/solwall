# SOLWALL

Non-custodial Solana wallet as a Chrome (MV3) extension. Obsidian-dark UI with a solar-gold identity — deliberately not another purple wallet.

> **⚠️ LEGAL DISCLAIMER:** This is a strictly experimental, non-commercial open-source project. The author assumes **no liability** for any loss of funds or damages. By using this software, you agree to the terms outlined in the [DISCLAIMER.md](./DISCLAIMER.md).

## Installation

SOLWALL is a secure, Chrome-compatible extension (Manifest V3).

### Option 1: Easy Install (No coding required)
*This is the simplest method for everyday users on Windows and Mac.*

1. **Download the Wallet:** Go to the **Releases** section on the right side of this GitHub page and download the `solwall.zip` file from the latest release.
2. **Extract the Folder:** Once downloaded, extract (unzip) the file somewhere safe on your computer.
   - **Windows:** Right-click the `.zip` file and select "Extract All...".
   - **Mac:** Double-click the `.zip` file to extract it.
3. **Open Chrome Extensions:** Open Google Chrome (or Brave/Edge) and type `chrome://extensions` in the address bar, then press Enter.
4. **Enable Developer Mode:** Turn on the **"Developer mode"** switch in the top right corner of the Extensions page.
5. **Load the Wallet:** Click the **"Load unpacked"** button in the top left. Select the extracted folder.
6. **Pin it:** Click the puzzle piece icon 🧩 in Chrome's top right menu and pin SOLWALL for quick access.

### Option 2: Build from Source (For developers)

If you prefer to compile the wallet yourself directly from the source code:

1. `npm install && npm run build` → produces the `dist/` folder.
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `SOLWALL/dist`

### Option 3: Verify Download

For maximum security, you can mathematically verify that your downloaded `solwall.zip` has not been tampered with:

1. Download both the `solwall.zip` and the `.sig` (signature) file from the Releases page.
2. Verify the PGP signature against the developer's public key to ensure it was signed by the original author.
3. **Reproducible Builds:** You can compile the ZIP yourself directly from the source code. Because SOLWALL uses deterministic builds, your locally compiled SHA-256 hash will perfectly match the official release hash, proving the binary matches the open-source code.

## Features

- **Onboarding** — create a 12-word wallet (reveal + 3-word verification quiz) or import a recovery phrase / base58 private key
- **Multiple wallets, multiple accounts** — any number of seed-phrase wallets plus imported-key wallets. On import, SOLWALL **scans the common Solana derivation schemes** (`m/44'/501'/i'/0'` Phantom/Solflare, `m/44'/501'/i'` Ledger, and raw-seed) for the one that actually holds funds and auto-discovers the funded accounts — so a phrase from any Solana wallet lands on the right addresses, not an empty one. Standard path is byte-identical to `ed25519-hd-key` (Phantom-compatible).
- **Fiat display** — total and per-asset value in a selectable currency (USD/EUR/GBP/JPY/… via open.er-api.com FX)
- **Address book** — save recipients with names; pick them when sending, save after a send
- **Change password** — re-encrypts the vault under a new key from Settings
- **Portfolio** — SOL + SPL token balances (Token + Token-2022 programs), USD prices via Jupiter with CoinGecko fallback, count-up balance hero
- **Send** — SOL and SPL tokens, address validation, Max, fee estimate, review sheet, confirmation tracking, Solscan links; recipient ATA created idempotently when missing
- **Receive** — branded QR + copy
- **Swap** — Jupiter (lite-api) quotes and swaps on mainnet: rate, price impact, route, 0.5% slippage
- **Activity** — parsed history with sent/received/app classification, day grouping, explorer links
- **Collectibles** — NFT grid from on-chain Metaplex metadata
- **Networks** — mainnet / devnet / testnet / custom RPC
- **dApp provider** — dual discovery so current dApps actually find it:
  - **Wallet Standard** registration (`wallet-standard:register-wallet` + `app-ready`) exposing `standard:connect/disconnect/events` and `solana:signAndSendTransaction/signTransaction/signMessage` across `solana:mainnet/devnet/testnet` — this is how wallet-adapter apps (Jupiter, Tensor, Drift, …) list SOLWALL
  - Phantom-compatible injected `window.solana` / `window.phantom.solana` / `window.solwall` for apps that detect the legacy provider
  - Shared background bridge for both: `connect` (account picker + per-site trust), `disconnect`, `signMessage`, `signTransaction(s)`, `signAndSendTransaction`, `accountChanged`/`disconnect` events, approval popups, per-site revocation in Settings
- **Security** — sender-trust boundary, simulated transaction previews, password-gated secret reveals, auto-lock timer (chrome.alarms, first-party-only), lock now, type-to-confirm reset
- **Live balance** — auto-refreshes every 10s while open; every transaction links to Solscan (with copyable signature) from Send/Swap results and the Activity feed

## Security model

- Vault encrypted at rest with **AES-256-GCM**, key from **PBKDF2-SHA256 (1.2M iterations, OWASP 2026)**; stored in `chrome.storage.local`
- Decrypted secrets live **only in `chrome.storage.session`** (memory-only, `TRUSTED_CONTEXTS` — unreachable from content scripts/pages, cleared on browser exit / lock / auto-lock). Only the **derived AES key** is kept there (never the plaintext password), so mutations re-encrypt without re-prompting and no password-reuse material is exposed
- **Sender-trust boundary** (`background/index.ts`): privileged wallet ops are accepted only from first-party extension pages; dApp ops only from web content scripts; dApp origin is taken from the verified sender, never message content. A compromised content script cannot reach the vault
- **Auto-lock** only resets on first-party activity — a connected dApp cannot poll to keep the wallet unlocked
- **Transaction approvals are simulated** (RPC `simulateTransaction` + instruction decode): the user sees pass/fail, their SOL balance delta, and flagged operations (token approvals, authority changes) instead of signing blind
- All signing happens in the background service worker; the popup UI and page-injected provider never see key material
- Explicit MV3 CSP (`script-src 'self'`); content scripts restricted to `https` + localhost
- RPC errors are surfaced generically, never echoing the account address or raw RPC/JSON payload

**This is a personal/educational build — it has not been audited. Don't put serious funds in it.**

## Dev preview (no extension reload loop)

`npm run serve` → http://localhost:8331/ renders the real popup + real background handlers in one page (chrome.* shim backed by localStorage; session in memory, so a reload relocks). RPC, prices, and Jupiter quotes are live.

## Architecture

```
src/background/   handlers.ts (vault, keyring, signing, approvals) + index.ts (SW wiring)
src/content/      content.ts (bridge) + inpage.ts (Phantom-compatible provider, dependency-free)
src/popup/        React UI — screens/, components, styles.css design system
src/lib/          crypto (WebCrypto vault), keyring (SLIP-0010), rpc, spl (hand-rolled token ixs),
                  tokens (registry + Metaplex parse), prices, jupiter, types (message protocol)
src/dev/          chrome.* shim for the browser preview
build.mjs         esbuild → dist/ (popup, background, content, inpage, dev)
```

## RPC notes

- Default mainnet RPC is **PublicNode** (`solana-rpc.publicnode.com`) — free, no-key, browser-CORS. The public `api.mainnet-beta.solana.com` returns **403** to browser/extension traffic (that's the "RPC busy" you'd otherwise see; Phantom ships paid RPC).
- PublicNode reliably serves SOL balance, activity, and transaction simulation, but **blocks `getTokenAccountsByOwner`**, so the SPL token list is empty on the default endpoint. For full token/NFT display, set a custom RPC in Settings → Network (e.g. a free Helius/QuickNode/Alchemy key). Every RPC call is time-boxed, so a blocked/slow method degrades gracefully instead of hanging.
- Balance auto-refreshes every 10s while the popup is open (paused when hidden).

## Known limitations

- `signTransaction` (return-signed-without-sending) patches signatures back onto the dApp's transaction object; `signAndSendTransaction` is the most robust path. Both legacy and v0 versioned transactions are supported and signature-verified.
- Transaction simulation covers pass/fail + the signer's SOL delta + common danger flags; it does not yet diff every SPL-token balance change
- No staking UI, hardware-wallet, or Ledger support

## Donations ❤️

If you find this project useful and want to support its development, you can send tips to the following addresses:

- **SOLANA:** `gAJ9YBNnNrevtKDi2aFw2WiPWR93KhftCvJWV2Q8qEQ`
- **MONERO:** `88YUhLmDGqgJbFBHVaSsywVZ6B5HBHUKuhx2tvx8iQWyLJ3EgtRXkxCjVV8M5t64akf6HAGUzhuCGBgtBqDjQwMjM4FFPon`
