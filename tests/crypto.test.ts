// Vault crypto: Argon2id round-trip, wrong-password rejection, and — most
// important — that a legacy PBKDF2 vault still opens and migrates. A bug in
// that path locks users out of their funds permanently.
import { createEncryptedVault, openVault, reencryptVault, verifyPassword, exportSessionKey, importSessionKey, type EncryptedVault } from "../src/lib/crypto";
import { assessPassword, assertPasswordPolicy } from "../src/lib/password";

let pass = true;
const check = (cond: boolean, label: string) => {
  if (!cond) pass = false;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
};
const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

const SECRET = JSON.stringify({ wallets: [{ id: "w1", type: "mnemonic", mnemonic: "abandon abandon about" }] });
const PW = "correct horse battery staple 7";

async function main() {
  // ---- Argon2id round-trip ----
  const { vault, key } = await createEncryptedVault(PW, SECRET);
  check(vault.v === 2 && !!vault.argon, "new vault uses Argon2id (v2)");
  const opened = await openVault(PW, vault);
  check(opened.plaintext === SECRET, "argon2id round-trip preserves plaintext");
  check(opened.needsUpgrade === false, "argon2id vault does not ask for upgrade");

  // ---- wrong password ----
  let rejected = false;
  try {
    await openVault(PW + "x", vault);
  } catch {
    rejected = true;
  }
  check(rejected, "wrong password is rejected");

  // ---- verifyPassword ----
  let verifyOk = true;
  try {
    await verifyPassword(PW, vault);
  } catch {
    verifyOk = false;
  }
  check(verifyOk, "verifyPassword accepts the right password");
  let verifyBad = false;
  try {
    await verifyPassword("nope", vault);
  } catch {
    verifyBad = true;
  }
  check(verifyBad, "verifyPassword rejects the wrong password");

  // ---- session key re-encrypt (mutation path) ----
  const exported = await exportSessionKey(key);
  const reimported = await importSessionKey(exported);
  const mutated = JSON.stringify({ wallets: [], addressBook: [{ address: "A", name: "n" }] });
  const re = await reencryptVault(reimported, vault, mutated);
  check((await openVault(PW, re)).plaintext === mutated, "re-encrypt with session key round-trips");

  // ---- LEGACY PBKDF2 vault must still open, and report needsUpgrade ----
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", enc(PW), "PBKDF2", false, ["deriveKey"]);
  const legacyKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 1_200_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, legacyKey, enc(SECRET));
  const legacyVault: EncryptedVault = {
    v: 1,
    saltB64: b64(salt),
    ivB64: b64(iv),
    ctB64: b64(new Uint8Array(ct)),
    iterations: 1_200_000,
  };
  const legacyOpened = await openVault(PW, legacyVault);
  check(legacyOpened.plaintext === SECRET, "LEGACY pbkdf2 vault still opens (no lockout)");
  check(legacyOpened.needsUpgrade === true, "legacy vault reports needsUpgrade");

  // migrate exactly as handlers.unlock does, then confirm it opens as Argon2id
  const upgraded = await createEncryptedVault(PW, legacyOpened.plaintext);
  const afterMigration = await openVault(PW, upgraded.vault);
  check(afterMigration.plaintext === SECRET, "migrated vault opens with the same password");
  check(upgraded.vault.v === 2 && afterMigration.needsUpgrade === false, "migrated vault is Argon2id");

  // ---- password policy ----
  const weak = ["short", "password", "P@ssw0rd", "12345678901", "aaaaaaaaaaaa", "qwertyuiop", "solana"];
  for (const w of weak) check(!assessPassword(w).ok, `weak password rejected: "${w}"`);
  const strong = ["correct horse battery staple 7", "Tr0ub4dour&3xplode!", "a-long-passphrase-with-words-99"];
  for (const g of strong) check(assessPassword(g).ok, `strong password accepted: "${g}"`);

  let policyThrew = false;
  try {
    assertPasswordPolicy("password");
  } catch {
    policyThrew = true;
  }
  check(policyThrew, "assertPasswordPolicy throws on a weak password");

  console.log(pass ? "\nCRYPTO: argon2id + legacy migration safe" : "\n*** CRYPTO CHECK FAILED ***");
  process.exit(pass ? 0 : 1);
}
main();
