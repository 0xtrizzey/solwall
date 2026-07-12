// Known-token registry (majors) + on-chain Metaplex metadata fallback.

import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const STATIC_URL = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet";

export const KNOWN_TOKENS: Record<string, TokenInfo> = Object.fromEntries(
  (
    [
      { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
      { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether USD", decimals: 6 },
      { mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", symbol: "mSOL", name: "Marinade staked SOL", decimals: 9 },
      { mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", symbol: "JitoSOL", name: "Jito staked SOL", decimals: 9 },
      { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", decimals: 5 },
      { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", decimals: 6 },
      { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", name: "dogwifhat", decimals: 6 },
      { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "RAY", name: "Raydium", decimals: 6 },
      { mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", symbol: "PYTH", name: "Pyth Network", decimals: 6 },
      { mint: WSOL_MINT, symbol: "wSOL", name: "Wrapped SOL", decimals: 9 },
    ] as TokenInfo[]
  ).map((t) => [t.mint, { ...t, logoURI: `${STATIC_URL}/${t.mint}/logo.png` }]),
);

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  return pda;
}

export interface OnchainMeta {
  name: string;
  symbol: string;
  uri: string;
}

/** Minimal borsh read of a Metaplex Metadata account: name/symbol/uri only. */
export function parseMetadataAccount(data: Uint8Array): OnchainMeta | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let off = 1 + 32 + 32; // key + update authority + mint
    const readStr = () => {
      const len = view.getUint32(off, true);
      off += 4;
      const raw = data.slice(off, off + len);
      off += len;
      return new TextDecoder().decode(raw).replace(/\0+$/g, "").trim();
    };
    const name = readStr();
    const symbol = readStr();
    const uri = readStr();
    return { name, symbol, uri };
  } catch {
    return null;
  }
}

const metaCache = new Map<string, OnchainMeta | null>();

export async function fetchOnchainMeta(conn: Connection, mint: string): Promise<OnchainMeta | null> {
  if (metaCache.has(mint)) return metaCache.get(mint)!;
  try {
    const info = await conn.getAccountInfo(metadataPda(new PublicKey(mint)));
    const meta = info ? parseMetadataAccount(new Uint8Array(info.data)) : null;
    metaCache.set(mint, meta);
    return meta;
  } catch {
    metaCache.set(mint, null);
    return null;
  }
}
