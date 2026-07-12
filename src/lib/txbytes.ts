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
