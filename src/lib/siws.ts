// Sign In With Solana (SIWS) — the `solana:signIn` Wallet Standard feature.
//
// The whole point of SIWS is that the WALLET builds the message, not the dApp:
// that is what lets us bind the message to the real origin and show the user a
// message we constructed rather than arbitrary text a site handed us. So this
// module lives in the background (trusted) and never trusts the page.
//
// Message format follows the SIWS spec (modelled on EIP-4361):
//   <domain> wants you to sign in with your Solana account:
//   <address>
//   [blank]
//   [statement]
//   [blank]
//   URI: ...            (advanced fields, each on its own line)
//   Resources:
//   - <uri>

export interface SolanaSignInInput {
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface SignInChecks {
  /** input.domain disagrees with the origin actually making the request */
  domainMismatch: boolean;
  /** input.address is not an account this wallet controls */
  addressMismatch: boolean;
  expired: boolean;
  notYetValid: boolean;
  /** issuedAt is more than 10 minutes away from now (Phantom uses the same window) */
  staleIssuedAt: boolean;
  warnings: string[];
}

/** Fields that occupy exactly one line — a newline in any of them would let a
 *  malicious dApp forge additional message fields (e.g. a statement containing
 *  "\nURI: https://evil.com"). Reject rather than sanitise: the dApp is
 *  misbehaving and a silently-rewritten message is worse than a refusal. */
const SINGLE_LINE_FIELDS = [
  "domain",
  "address",
  "statement",
  "uri",
  "version",
  "chainId",
  "nonce",
  "issuedAt",
  "expirationTime",
  "notBefore",
  "requestId",
] as const;

export function assertNoFieldInjection(input: SolanaSignInInput): void {
  for (const f of SINGLE_LINE_FIELDS) {
    const v = input[f];
    if (typeof v === "string" && /[\r\n]/.test(v)) {
      throw new Error(`Refused: SIWS field "${f}" contains a line break, which could forge message fields.`);
    }
  }
  for (const r of input.resources ?? []) {
    if (typeof r === "string" && /[\r\n]/.test(r)) {
      throw new Error('Refused: a SIWS "resources" entry contains a line break.');
    }
  }
}

/** Build the exact message the user signs. `domain`/`address` are the values the
 *  WALLET resolved (verified origin + a real account), not whatever the dApp asked for. */
export function buildSignInMessage(input: SolanaSignInInput, domain: string, address: string): string {
  const lines: string[] = [`${domain} wants you to sign in with your Solana account:`, address];

  if (input.statement) {
    lines.push("", input.statement);
  }

  const advanced: string[] = [];
  if (input.uri) advanced.push(`URI: ${input.uri}`);
  if (input.version) advanced.push(`Version: ${input.version}`);
  if (input.chainId) advanced.push(`Chain ID: ${input.chainId}`);
  if (input.nonce) advanced.push(`Nonce: ${input.nonce}`);
  if (input.issuedAt) advanced.push(`Issued At: ${input.issuedAt}`);
  if (input.expirationTime) advanced.push(`Expiration Time: ${input.expirationTime}`);
  if (input.notBefore) advanced.push(`Not Before: ${input.notBefore}`);
  if (input.requestId) advanced.push(`Request ID: ${input.requestId}`);
  if (input.resources?.length) {
    advanced.push("Resources:");
    for (const r of input.resources) advanced.push(`- ${r}`);
  }
  if (advanced.length) lines.push("", ...advanced);

  return lines.join("\n");
}

const TEN_MINUTES = 10 * 60 * 1000;

/** Domain binding + time-window validation. Returns findings for the approval
 *  UI; it never throws, so the user always gets to see what was requested. */
export function checkSignInInput(
  input: SolanaSignInInput,
  originHost: string,
  signingAddress: string,
  ownedAddresses: string[],
): SignInChecks {
  const warnings: string[] = [];
  const now = Date.now();

  // Accept an exact match or a subdomain of the claimed domain (app.foo.com may
  // legitimately sign in for foo.com); anything else is possible impersonation.
  const claimed = input.domain?.toLowerCase();
  const host = originHost.toLowerCase();
  const domainMismatch = !!claimed && host !== claimed && !host.endsWith("." + claimed);
  if (domainMismatch) {
    warnings.push(`This site is ${originHost} but asked you to sign in to "${input.domain}".`);
  }

  const addressMismatch = !!input.address && !ownedAddresses.includes(input.address);
  if (addressMismatch) {
    warnings.push("The site requested an account this wallet does not control.");
  } else if (input.address && input.address !== signingAddress) {
    warnings.push("The site requested a different account than the one selected.");
  }

  const parse = (s?: string): number | null => {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  const exp = parse(input.expirationTime);
  const nbf = parse(input.notBefore);
  const iat = parse(input.issuedAt);

  const expired = exp != null && exp < now;
  if (expired) warnings.push("This sign-in request has already expired.");

  const notYetValid = nbf != null && nbf > now;
  if (notYetValid) warnings.push("This sign-in request is not valid yet.");

  const staleIssuedAt = iat != null && Math.abs(now - iat) > TEN_MINUTES;
  if (staleIssuedAt) warnings.push("The request's issued-at time is far from now.");

  if (input.nonce && input.nonce.length < 8) {
    warnings.push("The request uses a weak nonce (under 8 characters).");
  }

  return { domainMismatch, addressMismatch, expired, notYetValid, staleIssuedAt, warnings };
}
