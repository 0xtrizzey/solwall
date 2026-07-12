// Key derivation. Phantom-compatible: BIP39 seed -> SLIP-0010 ed25519 at
// m/44'/501'/index'/0' -> Keypair.fromSeed. Imported accounts hold a raw
// base58 64-byte secret key instead.

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { wordlist as czech } from "@scure/bip39/wordlists/czech";
import { wordlist as french } from "@scure/bip39/wordlists/french";
import { wordlist as italian } from "@scure/bip39/wordlists/italian";
import { wordlist as japanese } from "@scure/bip39/wordlists/japanese";
import { wordlist as korean } from "@scure/bip39/wordlists/korean";
import { wordlist as portuguese } from "@scure/bip39/wordlists/portuguese";
import { wordlist as spanish } from "@scure/bip39/wordlists/spanish";
import { wordlist as simplifiedChinese } from "@scure/bip39/wordlists/simplified-chinese";
import { wordlist as traditionalChinese } from "@scure/bip39/wordlists/traditional-chinese";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Every official BIP39 language. A phrase created in any of these must import —
// the seed derivation (mnemonicToSeedSync) is wordlist-independent; the wordlist
// only matters for checksum validation.
const WORDLISTS = [wordlist, czech, french, italian, japanese, korean, portuguese, spanish, simplifiedChinese, traditionalChinese];

export function newMnemonic(words: 12 | 24 = 12): string {
  return generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

export function isValidMnemonic(m: string): boolean {
  const norm = normalizeMnemonic(m);
  return WORDLISTS.some((wl) => {
    try {
      return validateMnemonic(norm, wl);
    } catch {
      return false;
    }
  });
}

export function normalizeMnemonic(m: string): string {
  return m
    .replace(/[​-‍﻿­]/g, "") // strip zero-width / soft-hyphen paste artifacts
    .trim()
    .toLowerCase()
    .split(/\s+/) // collapses runs of any Unicode whitespace (incl. NBSP, ideographic space)
    .join(" ");
}

interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

function slip10Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

// ed25519 SLIP-0010 supports hardened derivation only.
function slip10Child(node: Slip10Node, index: number): Slip10Node {
  const hardened = index + 0x80000000;
  const data = new Uint8Array(1 + 32 + 4);
  data.set(node.key, 1);
  new DataView(data.buffer).setUint32(33, hardened, false);
  const I = hmac(sha512, node.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

// Solana wallets disagree on the derivation path. To make ANY Solana recovery
// phrase usable, we support the common schemes and (on import) scan them for the
// one that actually holds funds. All are fully-hardened (SLIP-0010 ed25519).
export type SchemeId = "bip44-change" | "bip44" | "bip44-root";

export const SOLANA_SCHEMES: { id: SchemeId; label: string }[] = [
  { id: "bip44-change", label: "Phantom · Solflare · Backpack (m/44'/501'/i'/0')" },
  { id: "bip44", label: "Ledger · some CLI wallets (m/44'/501'/i')" },
  { id: "bip44-root", label: "Legacy / raw seed (no path)" },
];

export function schemePath(scheme: SchemeId, accountIndex: number): string {
  switch (scheme) {
    case "bip44":
      return `m/44'/501'/${accountIndex}'`;
    case "bip44-root":
      return "raw-seed";
    default:
      return `m/44'/501'/${accountIndex}'/0'`;
  }
}

/** Derive a Solana keypair for a given scheme + account index. */
export function deriveForScheme(mnemonic: string, scheme: SchemeId, accountIndex: number): Keypair {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic));
  if (scheme === "bip44-root") {
    // Some legacy wallets use the first 32 bytes of the BIP39 seed directly.
    return Keypair.fromSeed(seed.slice(0, 32));
  }
  const segments = scheme === "bip44" ? [44, 501, accountIndex] : [44, 501, accountIndex, 0];
  let node = slip10Master(seed);
  for (const idx of segments) node = slip10Child(node, idx);
  return Keypair.fromSeed(node.key);
}

/** Standard Phantom-compatible derivation (m/44'/501'/accountIndex'/0'). */
export function deriveKeypair(mnemonic: string, accountIndex: number): Keypair {
  return deriveForScheme(mnemonic, "bip44-change", accountIndex);
}

/** Accepts base58 (Phantom export) or a JSON byte array; returns a Keypair. */
export function keypairFromSecretInput(input: string): Keypair {
  const trimmed = input.trim();
  let bytes: Uint8Array;
  if (trimmed.startsWith("[")) {
    bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
  } else {
    bytes = bs58.decode(trimmed);
  }
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(`Expected a 64-byte secret key, got ${bytes.length} bytes`);
}

export function secretKeyToBase58(kp: Keypair): string {
  return bs58.encode(kp.secretKey);
}
