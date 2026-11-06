# crypto-solwall-wallet — project memory

<!-- Maintained by Claude, reviewed by Tristan. Facts, decisions and state only — no code, no behavior rules
     (those belong in CLAUDE.md). Loaded automatically via @project-memory.md. Keep under ~200 lines. -->

## Overview
Non-custodial Solana wallet as a Chrome MV3 extension: esbuild → `dist/`, React popup,
Phantom-compatible `window.solana` provider, Argon2id vault.

## How to run
```
<!-- fill in: npm install; node build.mjs; dev preview: node serve.mjs (port 8331); tests -->
```

## Project rules
- GitHub repo `0xtrizzey/solwall` is intentionally PUBLIC (Tristan's decision, 2026-11-06): keep it public, never change its visibility. Because anyone can read it, check every commit for secrets twice.
- Secrets live only in background/session storage — never popup or inpage.
- Design: solar-gold, explicitly anti-Phantom-purple.
- `dist/` is generated — edit `src/`.

## Current state
<!-- one line, maintained by /handoff -->

## Lessons
- [2026-09-19] signMessage: hardening wrapped the payload in an envelope but dApps verified the RAW message → 100% of sign-ins broke with green build → RULE: verify any signing/encoding change against the consumer's verify() in the same session.
- [2026-09-19] Replay guard only tried Transaction.from(); a bare compiled message is replayable and doesn't parse as a Transaction → RULE: enumerate every serialization (tx + bare message, legacy + versioned) and test on real attack payloads + false-positive corpus.
