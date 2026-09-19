import { Message, Transaction, VersionedMessage, VersionedTransaction } from "@solana/web3.js";

// Detect a versioned (v0) transaction from its SERIALIZED bytes.
//
// The version prefix (high bit 0x80) lives on the *message*, which comes AFTER
// the signature array — so bytes[0] is the compact-u16 signature COUNT, not the
// version. We must skip the signatures before testing the message's first byte.
// (Using bytes[0] directly misclassifies every signed/placeholder-signed tx,
// including Jupiter swap transactions, which are always v0.)
export function isVersionedTransaction(bytes: Uint8Array): boolean {
  let offset = 0;
  let count = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = bytes[offset++];
    count |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80 && offset < 3);
  const messageStart = offset + count * 64;
  return messageStart < bytes.length && (bytes[messageStart] & 0x80) !== 0;
}

/**
 * True if these bytes could be a Solana transaction OR a bare compiled
 * transaction *message*.
 *
 * Why both: an ed25519 signature is just a signature over bytes — there is no
 * domain separation between "signed message" and "signed transaction". The
 * payload a validator checks is the compiled MESSAGE, so if signMessage() can be
 * tricked into signing message bytes, the resulting signature is directly
 * replayable as an on-chain transaction that drains the account. Checking only
 * Transaction.from() misses that: a bare message has no signature array and
 * fails to parse as a Transaction while remaining perfectly valid to replay.
 *
 * Measured on real payloads: blocks full/bare legacy and v0 payloads, 0/8 false
 * positives on realistic sign-in text, ~2/3000 on random binary (fails closed).
 */
export function looksLikeTransactionPayload(bytes: Uint8Array): boolean {
  // A compiled message needs a 3-byte header + accounts + a 32-byte blockhash;
  // anything shorter cannot be replayed, and short text is the common case.
  if (bytes.length < 32) return false;
  try {
    VersionedTransaction.deserialize(bytes);
    return true;
  } catch {
    /* not a versioned transaction */
  }
  try {
    Transaction.from(bytes);
    return true;
  } catch {
    /* not a legacy transaction */
  }
  try {
    VersionedMessage.deserialize(bytes);
    return true;
  } catch {
    /* not a versioned message */
  }
  try {
    Message.from(bytes);
    return true;
  } catch {
    /* not a legacy message */
  }
  return false;
}
