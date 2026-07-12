// User-facing error mapping. Raw RPC responses leak the account address, the
// endpoint, and internal JSON (a data-exfiltration + fingerprinting surface) and
// read as bugs. Never surface them — map to generic, actionable text instead.

function rawMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? "");
}

/** For data loads (balances, activity, quotes) — always generic. */
export function friendlyRpcError(e: unknown): string {
  const raw = rawMessage(e);
  if (/\b(403|429)\b/.test(raw) || /forbidden|rate.?limit|too many requests/i.test(raw)) {
    return "The public Solana RPC is busy right now. Add your own RPC in Settings → Network for reliable access.";
  }
  if (/failed to fetch|networkerror|load failed|err_/i.test(raw) || /\btimed? ?out\b/i.test(raw)) {
    return "Couldn't reach the Solana network. Check your connection, then retry.";
  }
  if (/node is behind|blockhash/i.test(raw)) {
    return "The network is catching up. Try again in a moment.";
  }
  return "Couldn't load this right now. Please retry.";
}

/** For transaction results — recognises common failure classes, never echoes raw payloads. */
export function friendlyTxError(e: unknown): string {
  const raw = rawMessage(e);
  if (/user rejected|rejected the request/i.test(raw)) return "Request rejected.";
  if (/\b(403|429)\b/.test(raw) || /forbidden|rate.?limit|too many requests/i.test(raw)) {
    return "The network is rate-limiting requests. Add a custom RPC in Settings and try again.";
  }
  if (/insufficient|0x1\b|debit an account/i.test(raw)) {
    return "Insufficient balance for this transaction, including network fees.";
  }
  if (/blockhash|expired|node is behind/i.test(raw)) {
    return "The transaction expired before confirming. Please try again.";
  }
  if (/slippage|0x1771|exceeds desired/i.test(raw)) {
    return "The price moved beyond your slippage tolerance. Try again.";
  }
  // Anything else (including raw RPC/JSON) is collapsed so nothing leaks.
  return "The transaction couldn't be completed. Please try again.";
}
