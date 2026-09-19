// SIWS message construction must match the spec byte-for-byte: the dApp
// reconstructs the same string server-side and verifies the signature against
// it, so any formatting drift silently breaks every sign-in.
import { assertNoFieldInjection, buildSignInMessage, checkSignInInput } from "../src/lib/siws";

const ADDR = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
let pass = true;
const check = (cond: boolean, label: string) => {
  if (!cond) pass = false;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
};
const eq = (actual: string, expected: string, label: string) => {
  const good = actual === expected;
  if (!good) {
    pass = false;
    console.log(`FAIL ${label}\n--- got ---\n${actual}\n--- want ---\n${expected}`);
  } else console.log(`OK   ${label}`);
};

// 1) Minimal (empty input) — exactly two lines, no trailing blank.
eq(
  buildSignInMessage({}, "example.com", ADDR),
  `example.com wants you to sign in with your Solana account:\n${ADDR}`,
  "minimal message",
);

// 2) Statement only — blank line before the statement.
eq(
  buildSignInMessage({ statement: "Accept the terms." }, "example.com", ADDR),
  `example.com wants you to sign in with your Solana account:\n${ADDR}\n\nAccept the terms.`,
  "statement message",
);

// 3) Maximal — advanced fields after a blank line, resources dash-prefixed.
eq(
  buildSignInMessage(
    {
      statement: "Sign in to Example.",
      uri: "https://example.com/login",
      version: "1",
      chainId: "mainnet",
      nonce: "abc12345",
      issuedAt: "2026-09-19T10:00:00.000Z",
      expirationTime: "2026-09-19T10:10:00.000Z",
      notBefore: "2026-09-19T09:59:00.000Z",
      requestId: "req-1",
      resources: ["https://a.example/tos", "https://b.example/privacy"],
    },
    "example.com",
    ADDR,
  ),
  [
    "example.com wants you to sign in with your Solana account:",
    ADDR,
    "",
    "Sign in to Example.",
    "",
    "URI: https://example.com/login",
    "Version: 1",
    "Chain ID: mainnet",
    "Nonce: abc12345",
    "Issued At: 2026-09-19T10:00:00.000Z",
    "Expiration Time: 2026-09-19T10:10:00.000Z",
    "Not Before: 2026-09-19T09:59:00.000Z",
    "Request ID: req-1",
    "Resources:",
    "- https://a.example/tos",
    "- https://b.example/privacy",
  ].join("\n"),
  "maximal message",
);

// 4) Field injection: a newline in statement could forge "URI:" etc.
let threw = false;
try {
  assertNoFieldInjection({ statement: "hello\nURI: https://evil.example" });
} catch {
  threw = true;
}
check(threw, "newline in statement is refused (field-forgery)");

let threwRes = false;
try {
  assertNoFieldInjection({ resources: ["https://ok.example\nNonce: 000"] });
} catch {
  threwRes = true;
}
check(threwRes, "newline in resources is refused");
check(
  (() => {
    try {
      assertNoFieldInjection({ statement: "clean statement", uri: "https://ok.example" });
      return true;
    } catch {
      return false;
    }
  })(),
  "clean input passes injection check",
);

// 5) Domain binding.
const owned = [ADDR];
check(!checkSignInInput({ domain: "example.com" }, "example.com", ADDR, owned).domainMismatch, "exact domain matches");
check(
  !checkSignInInput({ domain: "example.com" }, "app.example.com", ADDR, owned).domainMismatch,
  "subdomain of claimed domain is allowed",
);
check(
  checkSignInInput({ domain: "jup.ag" }, "evil.example", ADDR, owned).domainMismatch,
  "impersonation (evil.example claiming jup.ag) is flagged",
);
check(
  !checkSignInInput({ domain: "example.com.evil.test" }, "example.com", ADDR, owned).domainMismatch === false,
  "suffix trick does not accidentally match",
);

// 6) Time window + unknown account.
const past = new Date(Date.now() - 3_600_000).toISOString();
const future = new Date(Date.now() + 3_600_000).toISOString();
check(checkSignInInput({ expirationTime: past }, "example.com", ADDR, owned).expired, "expired request flagged");
check(checkSignInInput({ notBefore: future }, "example.com", ADDR, owned).notYetValid, "not-yet-valid flagged");
check(checkSignInInput({ issuedAt: past }, "example.com", ADDR, owned).staleIssuedAt, "stale issuedAt flagged");
check(
  checkSignInInput({ address: "So11111111111111111111111111111111111111112" }, "example.com", ADDR, owned).addressMismatch,
  "unowned requested address flagged",
);

console.log(pass ? "\nSIWS: spec-conformant + hardened" : "\n*** SIWS CHECK FAILED ***");
process.exit(pass ? 0 : 1);
