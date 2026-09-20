// Vault encryption: Argon2id (memory-hard) -> AES-256-GCM.
//
// Why Argon2id and not PBKDF2: the realistic attack on a browser wallet is not
// breaking AES, it is someone obtaining the encrypted vault (malware, disk
// forensics, a synced profile, a backup) and grinding passwords offline.
// PBKDF2-SHA256 is cheap to accelerate on GPUs/ASICs, so iteration count buys
// little. Argon2id is memory-hard: each guess costs real RAM, which is what
// actually prices an attacker out.
//
// Existing PBKDF2 vaults still open (v1) and are transparently re-encrypted to
// Argon2id on the next successful unlock — see `needsUpgrade`.
//
// After unlock we keep the derived AES key (never the password) in memory-only
// session storage, so mutations can re-encrypt without holding a secret the
// user may have reused elsewhere.

import { argon2idAsync } from "@noble/hashes/argon2.js";

/** OWASP-aligned Argon2id parameters, tuned up for a wallet unlock (~1s). */
const ARGON = { t: 3, m: 65536, p: 1 } as const; // 64 MiB
const LEGACY_PBKDF2_ITERATIONS = 1_200_000;

export interface EncryptedVault {
  /** 1 = PBKDF2-SHA256 (legacy), 2 = Argon2id */
  v: 1 | 2;
  saltB64: string;
  ivB64: string;
  ctB64: string;
  /** PBKDF2 only */
  iterations?: number;
  /** Argon2id only */
  argon?: { t: number; m: number; p: number };
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAes(raw: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM", length: 256 }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveArgon(password: string, salt: Uint8Array, opts: { t: number; m: number; p: number }, extractable: boolean) {
  const raw = await argon2idAsync(new TextEncoder().encode(password), salt, { ...opts, dkLen: 32 });
  return importAes(raw as Uint8Array, extractable);
}

/** Legacy path — only used to open (and then upgrade) pre-Argon2id vaults. */
async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number, extractable: boolean) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

async function deriveForVault(password: string, vault: EncryptedVault, extractable: boolean): Promise<CryptoKey> {
  const salt = b64decode(vault.saltB64);
  if (vault.v === 2) return deriveArgon(password, salt, vault.argon ?? ARGON, extractable);
  return derivePbkdf2(password, salt, vault.iterations ?? LEGACY_PBKDF2_ITERATIONS, extractable);
}

async function encryptWithKey(key: CryptoKey, salt: Uint8Array, plaintext: string): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return { v: 2, saltB64: b64encode(salt), ivB64: b64encode(iv), ctB64: b64encode(ct), argon: { ...ARGON } };
}

async function decryptWithKey(key: CryptoKey, vault: EncryptedVault): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(vault.ivB64) as BufferSource },
    key,
    b64decode(vault.ctB64) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/** New vault: fresh salt, Argon2id. Returns the blob plus the session key. */
export async function createEncryptedVault(password: string, plaintext: string): Promise<{ vault: EncryptedVault; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveArgon(password, salt, ARGON, true);
  const vault = await encryptWithKey(key, salt, plaintext);
  return { vault, key };
}

/**
 * Unlock. Throws on the wrong password (AES-GCM auth failure).
 * `needsUpgrade` is true for legacy PBKDF2 vaults; the caller should re-encrypt
 * with `createEncryptedVault` while it still has the password in hand.
 */
export async function openVault(
  password: string,
  vault: EncryptedVault,
): Promise<{ plaintext: string; key: CryptoKey; needsUpgrade: boolean }> {
  const key = await deriveForVault(password, vault, true);
  const plaintext = await decryptWithKey(key, vault);
  return { plaintext, key, needsUpgrade: vault.v !== 2 };
}

/** Re-encrypt with the in-memory session key, reusing the vault's salt/params. */
export async function reencryptVault(key: CryptoKey, prev: EncryptedVault, plaintext: string): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return { ...prev, ivB64: b64encode(iv), ctB64: b64encode(ct) };
}

/** Verify a password without unlocking the session (reveal / remove flows). */
export async function verifyPassword(password: string, vault: EncryptedVault): Promise<void> {
  const key = await deriveForVault(password, vault, false);
  await decryptWithKey(key, vault); // throws if wrong
}

// Session key <-> transportable string. The raw key lives only in memory-only
// session storage (TRUSTED_CONTEXTS); it decrypts the vault but cannot be
// reversed to the password.
export async function exportSessionKey(key: CryptoKey): Promise<string> {
  return b64encode(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importSessionKey(b64: string): Promise<CryptoKey> {
  return importAes(b64decode(b64), true);
}
