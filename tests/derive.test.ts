// Regression check: key derivation must be byte-identical after dependency
// updates. A silent change here would strand every existing wallet on a
// different (empty) address.
import { deriveForScheme, isValidMnemonic, normalizeMnemonic } from "../src/lib/keyring";

const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const out = {
  "bip44-change[0]": deriveForScheme(M, "bip44-change", 0).publicKey.toBase58(),
  "bip44-change[1]": deriveForScheme(M, "bip44-change", 1).publicKey.toBase58(),
  "bip44[0]": deriveForScheme(M, "bip44", 0).publicKey.toBase58(),
  "bip44-root": deriveForScheme(M, "bip44-root", 0).publicKey.toBase58(),
};

// Golden values recorded when the scheme support was introduced.
const EXPECTED: Record<string, string> = {
  "bip44-change[0]": "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  "bip44-change[1]": "Hh8QwFUA6MtVu1qAoq12ucvFHNwCcVTV7hpWjeY1Hztb",
  "bip44[0]": "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL",
  "bip44-root": "EHqmfkN89RJ7Y33CXM6uCzhVeuywHoJXZZLszBHHZy7o",
};

let pass = true;
for (const [k, v] of Object.entries(out)) {
  const good = EXPECTED[k] === v;
  if (!good) pass = false;
  console.log(`${good ? "OK  " : "FAIL"} ${k}: ${v}`);
}

// Multi-language BIP39 must still validate (the import-bug fix).
const langs = {
  english: "legal winner thank year wave sausage worth useful legal winner thank yellow",
  spanish: "ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco abierto",
  zeroWidth: "legal​ winner thank year wave sausage worth useful legal winner thank yellow",
};
for (const [k, v] of Object.entries(langs)) {
  const ok = isValidMnemonic(v);
  if (!ok) pass = false;
  console.log(`${ok ? "OK  " : "FAIL"} mnemonic/${k} validates`);
}
console.log(`\nnormalize strips zero-width: ${normalizeMnemonic(langs.zeroWidth) === normalizeMnemonic(langs.english)}`);
console.log(pass ? "\nDERIVATION UNCHANGED" : "\n*** DERIVATION REGRESSION ***");
process.exit(pass ? 0 : 1);
