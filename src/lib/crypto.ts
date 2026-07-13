// Vault encryption: PBKDF2-SHA256 (1.2M iterations, OWASP 2026) -> AES-256-GCM.
// WebCrypto only — available in both the popup and the MV3 service worker.
//
// After unlock we keep the *derived AES key* (not the password) in memory-only
// session storage. That still lets us re-encrypt on wallet mutations, but never
// exposes the user's password (which they may reuse elsewhere). The salt is
// reused across re-encryptions so the password path can always re-derive it; a
// fresh IV per encryption keeps AES-GCM safe.

const PBKDF2_ITERATIONS = 1_200_000;

export interface EncryptedVault {
  v: 1;
  saltB64: string;
  ivB64: string;
  ctB64: string;
  iterations: number;
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

async function deriveKey(password: string, salt: Uint8Array, iterations: number, extractable: boolean): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

async function encryptWithKey(key: CryptoKey, salt: Uint8Array, iterations: number, plaintext: string): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return { v: 1, saltB64: b64encode(salt), ivB64: b64encode(iv), ctB64: b64encode(ct), iterations };
}

async function decryptWithKey(key: CryptoKey, vault: EncryptedVault): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(vault.ivB64) as BufferSource },
    key,
    b64decode(vault.ctB64) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/** New vault: fresh salt, returns the blob plus the (extractable) session key. */
export async function createEncryptedVault(password: string, plaintext: string): Promise<{ vault: EncryptedVault; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS, true);
  const vault = await encryptWithKey(key, salt, PBKDF2_ITERATIONS, plaintext);
  return { vault, key };
}

/** Unlock: derive from the vault's salt, decrypt (throws on wrong password), return the key. */
export async function openVault(password: string, vault: EncryptedVault): Promise<{ plaintext: string; key: CryptoKey }> {
  const key = await deriveKey(password, b64decode(vault.saltB64), vault.iterations, true);
  const plaintext = await decryptWithKey(key, vault); // AES-GCM auth failure => wrong password
  return { plaintext, key };
}

/** Re-encrypt with the in-memory session key, reusing the vault's salt + iterations. */
export async function reencryptVault(key: CryptoKey, prev: EncryptedVault, plaintext: string): Promise<EncryptedVault> {
  return encryptWithKey(key, b64decode(prev.saltB64), prev.iterations, plaintext);
}

/** Verify a password against a vault without unlocking the session (reveal/remove flows). */
export async function verifyPassword(password: string, vault: EncryptedVault): Promise<void> {
  const key = await deriveKey(password, b64decode(vault.saltB64), vault.iterations, false);
  await decryptWithKey(key, vault); // throws if wrong
}

// Session key <-> transportable string. The raw key lives only in memory-only
// session storage (TRUSTED_CONTEXTS); it can decrypt the vault but cannot be
// reversed to the password.
export async function exportSessionKey(key: CryptoKey): Promise<string> {
  return b64encode(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importSessionKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64decode(b64) as BufferSource, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
