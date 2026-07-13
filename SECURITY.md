# SOLWALL Security Architecture & Audit Memory

This document serves as a persistent memory bank of all expert-level security hardening measures implemented in SOLWALL, including our rationale, architectural choices, and the threats we mitigated.

## 1. Advanced Threat Protections

### 1.1 Anti-Simulation Evasion (Chameleon Contracts)
*   **The Threat:** Sophisticated smart contracts can detect when they are running inside a Solana RPC simulation (e.g., checking sysvar:clock). They act benign during simulation to trick the user into signing, then alter their behavior on-chain to drain funds.
*   **The Defense:** We implemented strict heuristics in src/popup/screens/Approval.tsx. If a simulated transaction shows **zero balance changes** but interacts with an **unverified program** (not System, Token, or Compute Budget), the wallet immediately throws a stark red HIGH RISK warning.

### 1.2 Zero-Trust API Architecture (Jupiter Swap)
*   **The Threat:** Supply-chain API attacks. If the Jupiter Swap API was compromised, it could return a malicious transaction payload that sends funds directly to an attacker instead of swapping.
*   **The Defense:** The wallet no longer blindly signs Jupiter transactions. Swap.tsx now locally **simulates** the transaction returned by Jupiter *before* prompting the user. If the simulation attempts to drain more SOL/tokens than quoted, the wallet intercepts and blocks the transaction entirely.

### 1.3 Price Feed Sanity Bounds
*   **The Threat:** Compromised fiat (CoinGecko) APIs could return mathematically impossible values (e.g., SOL = $1,000,000 or NaN) to cause UI spoofing or crashes.
*   **The Defense:** Implemented strict numerical boundaries (  < price < 1,000,000) and Zod-style runtime checks in src/lib/prices.ts. The wallet gracefully falls back if upstream APIs return malformed or XSS-laden data.

## 2. UI & User Psychology Defenses

### 2.1 Visual Hash Identicons
*   **The Threat:** Vanity Address Poisoning. Attackers generate addresses matching the first 4 and last 4 characters of a known contact and send dust transactions to trick users into copy-pasting the spoofed address.
*   **The Defense:** Implemented a deterministic 9-color geometric Identicon. While attackers can easily brute-force characters, they cannot mathematically brute-force the visual color matrix, instantly exposing spoofed addresses to the human eye.

### 2.2 Massive Array DoS Mitigation
*   **The Threat:** Malicious dApps sending signAllTransactions arrays with 5,000+ items to freeze the browser's UI thread or crash the extension via memory exhaustion.
*   **The Defense:** Enforced a hard cap of 50 transactions per batch request.

### 2.3 Popup Spam Prevention
*   **The Threat:** DApps infinitely spamming connect() or signTransaction() requests to DoS the user.
*   **The Defense:** Background service worker enforces a limit of exactly 1 pending approval window per origin.

## 3. Core Cryptography & Architecture Thoughts

### 3.1 BigInt Precision Fix
*   **The Fix:** Migrated all internal math to native BigInt.
*   **The Rationale:** JavaScript's Number.MAX_SAFE_INTEGER causes silent precision loss for amounts over ~9 million. This is a severe bug in Solana where meme coins frequently have supplies in the trillions.

### 3.2 Reproducible Builds & "Tails-Style" Verification
*   **The Setup:** We created a GitHub Actions pipeline (.github/workflows/release.yml) that standardizes timestamps and file ordering to produce a 100% deterministic solwall.zip.
*   **The Rationale:** Users no longer have to blindly trust the Chrome Web Store. They can compile the exact ZIP hash locally or verify a detached PGP signature provided by the developer, achieving Tails-OS level verification.

### 3.3 Rejected Idea: JS Closure RAM Isolation
*   **The Idea:** Moving the decrypted private key out of chrome.storage.session into a pure, invisible JavaScript memory closure to protect against extension-level memory extraction (XSS).
*   **Why We Rejected It:** Manifest V3 background service workers forcibly sleep after 30 seconds of inactivity. If the key is only in RAM, the closure is destroyed. This would mean the wallet automatically locks and requires a password every 30 seconds. We concluded this UX trade-off was catastrophic and unacceptable. chrome.storage.session remains the most robust balance of security and usability for MV3.
