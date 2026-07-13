# SOLWALL Security Architecture & Audit Memory

This document serves as a persistent memory bank of all expert-level security hardening measures implemented in SOLWALL, including our rationale, architectural choices, and the threats we mitigated.

## 1. Advanced Threat Protections

### 1.1 Anti-Simulation Evasion (Chameleon Contracts)
*   **The Threat:** Sophisticated smart contracts can detect when they are running inside a Solana RPC simulation (e.g., checking sysvar:clock). They act benign during simulation to trick the user into signing, then alter their behavior on-chain to drain funds.
*   **The Defense (heuristic, not a guarantee):** In src/popup/screens/Approval.tsx, when a transaction **simulates successfully with ~zero SOL change** yet interacts with an **unverified program** and decodes to nothing recognisable, we show a measured caution. Crucially we distinguish this from the far more common case where the simulation simply **could not compute** the balance change (RPC returned no account data, non-mainnet) — that is *no signal*, so it is labelled "couldn't verify," never a drain alert. Over-warning is itself a risk: false alarms train users to ignore the real ones. Genuinely dangerous instructions (token approvals, authority changes) are surfaced explicitly regardless.

### 1.2 Zero-Trust API Architecture (Jupiter Swap)
*   **The Threat:** Supply-chain API attacks. If the Jupiter Swap API was compromised, it could return a malicious transaction payload that sends funds directly to an attacker instead of swapping.
*   **The Defense (partial):** Swap.tsx locally **simulates** the transaction returned by Jupiter *before* signing, and aborts if it will fail. For **SOL-spend swaps** it also blocks when the simulated SOL outflow exceeds the quoted input by more than a small fee buffer. Limitation: this currently covers SOL outflow only — a swap that drains an SPL **token** balance beyond the quote is not yet caught. Treat it as defence-in-depth, not a guarantee.

### 1.3 Price Feed Sanity Bounds
*   **The Threat:** Compromised fiat (CoinGecko) APIs could return mathematically impossible values (e.g., SOL = $1,000,000 or NaN) to cause UI spoofing or crashes.
*   **The Defense:** Implemented strict numerical boundaries (0 < price < 1,000,000; 0 < fx rate < 100,000) and runtime type checks in src/lib/prices.ts. The wallet ignores non-finite, zero, negative, or absurd values and falls back gracefully if upstream APIs return malformed data.

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
*   **The Setup:** A GitHub Actions pipeline (.github/workflows/release.yml) standardizes timestamps and file ordering to aim for a byte-for-byte reproducible solwall.zip.
*   **The Rationale:** Reduces the need to blindly trust the Chrome Web Store: users can rebuild the ZIP locally and compare its hash, or verify a detached PGP signature. This only provides real assurance if (a) the build is confirmed reproducible on independent machines and (b) a genuine, published developer PGP key signs releases — both must be maintained for the assurance to hold.

### 3.3 Rejected Idea: JS Closure RAM Isolation
*   **The Idea:** Moving the decrypted private key out of chrome.storage.session into a pure, invisible JavaScript memory closure to protect against extension-level memory extraction (XSS).
*   **Why We Rejected It:** Manifest V3 background service workers forcibly sleep after 30 seconds of inactivity. If the key is only in RAM, the closure is destroyed. This would mean the wallet automatically locks and requires a password every 30 seconds. We concluded this UX trade-off was catastrophic and unacceptable. chrome.storage.session remains the most robust balance of security and usability for MV3.

## 4. Recalibrations & Fixes (2026-07-13) — and why

### 4.1 The chameleon warning was inverted → recalibrated
*   **What was wrong:** The original heuristic fired the red "HIGH RISK chameleon drain" alert when `solDelta == null` — i.e. exactly when the simulation *could not compute* the balance change. That is no evidence at all, and it happens routinely on RPCs that don't return simulation account data or on non-mainnet. The real chameleon signature is the *opposite*: a **successful** simulation that shows zero change.
*   **The fix:** Split into two honest states in Approval.tsx — "couldn't verify" (neutral caution) vs. "simulated clean but touches unverified code" (measured caution). Removed the "drain detected" language for the no-signal case.
*   **Why:** A wallet that cries wolf is *less* safe than one that doesn't — users learn to click through warnings. Calibrated, honest warnings preserve their signal value.

### 4.2 Auto-lock made purely activity-driven
*   **What was wrong:** Auto-lock reset on *every* first-party message, so snapshot polls, an idle-but-open approval window, and other internal traffic could keep the vault unlocked while the user was not actually present.
*   **The fix (src/background/handlers.ts):** The timer is armed on unlock/create and re-armed **only** by the heartbeat message, which the UI sends solely on real mousemove/keydown activity. Internal/programmatic messages no longer extend the unlock window.
*   **Why:** Auto-lock should measure *user presence*, not extension chatter. An idle session now actually locks.

### 4.3 Honesty pass on this document + LICENSE
*   Softened claims that stated heuristics or aspirations as guarantees ("API compromise detected", "100% deterministic", "Tails-OS level verification"). Fixed a malformed bound in §1.3.
*   **Why:** For a wallet, overstating security manufactures false confidence, which is itself a risk. Added an MIT `LICENSE` (previously missing — nobody could legally reuse the code) with an explicit "not audited, no warranty" security notice, and removed a stray `test-tx.ts` scratch file whose own tx-detection used the flawed approach already fixed in the real code.
