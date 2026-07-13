// Read-side RPC layer used by the popup (no secrets touch this module).

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { NETWORKS, type NetworkId } from "./types";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAtaIdempotentInstruction,
  transferCheckedInstruction,
} from "./spl";
import { KNOWN_TOKENS, fetchOnchainMeta, type TokenInfo } from "./tokens";

export function rpcUrl(network: NetworkId, customRpcUrl: string): string {
  if (network === "custom") return customRpcUrl || NETWORKS["mainnet-beta"].rpcUrl;
  return NETWORKS[network].rpcUrl;
}

export function makeConnection(network: NetworkId, customRpcUrl: string): Connection {
  return new Connection(rpcUrl(network, customRpcUrl), { commitment: "confirmed" });
}

export interface TokenHolding {
  mint: string;
  amount: number; // ui amount
  rawAmount: string;
  decimals: number;
  symbol: string;
  name: string;
  logoURI?: string;
  tokenProgram: string;
  ata: string;
  isNft: boolean;
  unverified?: boolean;
}

export async function fetchSolBalance(conn: Connection, owner: string): Promise<number> {
  return conn.getBalance(new PublicKey(owner));
}

export async function fetchTokenHoldings(conn: Connection, owner: string): Promise<TokenHolding[]> {
  const ownerPk = new PublicKey(owner);
  const results = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID }),
    conn.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const accounts = results.flatMap((r, i) =>
    r.status === "fulfilled"
      ? r.value.value.map((v) => ({ ...v, program: i === 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID }))
      : [],
  );

  const holdings: TokenHolding[] = [];
  for (const acc of accounts) {
    const info = acc.account.data.parsed?.info;
    if (!info) continue;
    const amt = info.tokenAmount;
    if (!amt || amt.uiAmount === 0) continue;
    const mint: string = info.mint;
    const known = KNOWN_TOKENS[mint];
    holdings.push({
      mint,
      amount: amt.uiAmount ?? 0,
      rawAmount: amt.amount,
      decimals: amt.decimals,
      symbol: known?.symbol ?? mint.slice(0, 4),
      name: known?.name ?? "Unknown token",
      logoURI: known?.logoURI,
      tokenProgram: acc.program.toBase58(),
      ata: acc.pubkey.toBase58(),
      isNft: amt.decimals === 0 && amt.amount === "1",
      unverified: !known,
    });
  }

  // Resolve names for unknown fungible tokens from on-chain metadata (best effort).
  await Promise.allSettled(
    holdings
      .filter((h) => !KNOWN_TOKENS[h.mint] && !h.isNft)
      .slice(0, 12)
      .map(async (h) => {
        const meta = await fetchOnchainMeta(conn, h.mint);
        if (meta?.symbol) h.symbol = meta.symbol;
        if (meta?.name) h.name = meta.name;
      }),
  );

  return holdings.sort((a, b) => b.amount - a.amount);
}

// ---- Activity ----

export interface ActivityItem {
  signature: string;
  time: number | null;
  err: boolean;
  kind: "sent" | "received" | "app" | "unknown";
  label: string;
  delta: string; // signed display amount, e.g. "-0.5 SOL"
  counterparty?: string;
  unverified?: boolean;
}

export async function fetchActivity(conn: Connection, owner: string, limit = 15): Promise<ActivityItem[]> {
  const ownerPk = new PublicKey(owner);
  const sigs = await conn.getSignaturesForAddress(ownerPk, { limit });
  if (sigs.length === 0) return [];

  let parsed: (ParsedTransactionWithMeta | null)[] = [];
  try {
    parsed = await conn.getParsedTransactions(
      sigs.map((s) => s.signature),
      { maxSupportedTransactionVersion: 0 },
    );
  } catch {
    parsed = sigs.map(() => null);
  }

  return sigs.map((sig, i) => {
    const base: ActivityItem = {
      signature: sig.signature,
      time: sig.blockTime ?? null,
      err: sig.err != null,
      kind: "unknown",
      label: "Transaction",
      delta: "",
    };
    const tx = parsed[i];
    if (!tx || !tx.meta) {
      base.label = "Archived Transaction";
      return base;
    }
    try {
      return classify(tx, owner, base);
    } catch (e) {
      console.warn("Classification failed:", e);
      return base;
    }
  });
}

function classify(tx: ParsedTransactionWithMeta, owner: string, base: ActivityItem): ActivityItem {
  const keys = tx.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey.toBase58() === owner);
  const meta = tx.meta!;

  // Token balance change for owner?
  const preTok = (meta.preTokenBalances ?? []).filter((b) => b.owner === owner);
  const postTok = (meta.postTokenBalances ?? []).filter((b) => b.owner === owner);
  
  const tokenMints = Array.from(new Set([...preTok.map((b) => b.mint), ...postTok.map((b) => b.mint)]));
  for (const mint of tokenMints) {
    const pre = preTok.find((p) => p.mint === mint);
    const post = postTok.find((p) => p.mint === mint);
    const preAmt = pre?.uiTokenAmount.uiAmount ?? 0;
    const postAmt = post?.uiTokenAmount.uiAmount ?? 0;
    const diff = postAmt - preAmt;
    if (Math.abs(diff) > 1e-9) {
      const known = KNOWN_TOKENS[mint];
      const sym = known?.symbol ?? mint.slice(0, 4);
      const sign = diff > 0 ? "+" : "−";
      
      let counterparty: string | undefined;
      const otherPost = (meta.postTokenBalances ?? []).filter((b) => b.owner !== owner && b.mint === mint);
      const otherPre = (meta.preTokenBalances ?? []).filter((b) => b.owner !== owner && b.mint === mint);
      
      const otherOwners = Array.from(new Set([...otherPre.map(b => b.owner), ...otherPost.map(b => b.owner)]));
      for (const opOwner of otherOwners) {
        if (!opOwner) continue;
        const opPostAmt = otherPost.find(p => p.owner === opOwner)?.uiTokenAmount.uiAmount ?? 0;
        const opPreAmt = otherPre.find(p => p.owner === opOwner)?.uiTokenAmount.uiAmount ?? 0;
        const oDiff = opPostAmt - opPreAmt;
        if ((diff < 0 && oDiff > 0) || (diff > 0 && oDiff < 0)) {
          counterparty = opOwner;
          break;
        }
      }

      return {
        ...base,
        kind: diff > 0 ? "received" : "sent",
        label: diff > 0 ? `Received ${sym}` : `Sent ${sym}`,
        delta: `${sign}${Math.abs(diff).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sym}`,
        unverified: !known,
        counterparty,
      };
    }
  }

  // SOL delta (net of fee if we were the fee payer).
  if (idx >= 0) {
    let diff = (meta.postBalances[idx] - meta.preBalances[idx]) / 1e9;
    if (idx === 0) diff += (meta.fee ?? 0) / 1e9; // ignore pure fee spend for classification
    if (Math.abs(diff) > 1e-9) {
      const sign = diff > 0 ? "+" : "−";
      const label = diff > 0 ? "Received SOL" : "Sent SOL";
      
      let counterparty: string | undefined;
      for (const ix of tx.transaction.message.instructions) {
        if ("parsed" in ix && ix.program === "system" && ix.parsed.type === "transfer") {
          const info = ix.parsed.info;
          if (info.source === owner) counterparty = info.destination;
          else if (info.destination === owner) counterparty = info.source;
          if (counterparty) break;
        }
      }
      if (!counterparty) {
        // Fallback to balance differences
        for (let i = 0; i < meta.postBalances.length; i++) {
          if (i === idx) continue;
          let cDiff = (meta.postBalances[i] - meta.preBalances[i]) / 1e9;
          if (i === 0) cDiff += (meta.fee ?? 0) / 1e9;
          if ((diff < 0 && cDiff > 0) || (diff > 0 && cDiff < 0)) {
            let address = keys[i]?.pubkey?.toBase58();
            if (!address && meta.loadedAddresses) {
                const writable = meta.loadedAddresses.writable ?? [];
                const readonly = meta.loadedAddresses.readonly ?? [];
                const altIndex = i - keys.length;
                if (altIndex >= 0) {
                    if (altIndex < writable.length) {
                        address = writable[altIndex].toBase58();
                    } else {
                        address = readonly[altIndex - writable.length].toBase58();
                    }
                }
            }
            counterparty = address;
            if (counterparty) break;
          }
        }
      }

      return {
        ...base,
        kind: diff > 0 ? "received" : "sent",
        label,
        delta: `${sign}${Math.abs(diff).toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL`,
        counterparty,
      };
    }
  }

  const progs = tx.transaction.message.instructions.map((ix) => ("program" in ix ? ix.program : "")).filter(Boolean);
  return { ...base, kind: "app", label: progs.includes("vote") ? "Vote" : "App interaction", delta: "" };
}

// ---- Transfer building (unsigned; the background signs) ----

export async function buildSolTransfer(
  conn: Connection,
  from: string,
  to: string,
  lamports: number | bigint,
): Promise<Transaction> {
  const fromPk = new PublicKey(from);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: new PublicKey(to), lamports }),
  );
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPk;
  return tx;
}

export async function buildTokenTransfer(
  conn: Connection,
  from: string,
  to: string,
  holding: TokenHolding,
  rawAmount: bigint,
): Promise<Transaction> {
  const fromPk = new PublicKey(from);
  const toPk = new PublicKey(to);
  const mintPk = new PublicKey(holding.mint);
  const program = new PublicKey(holding.tokenProgram);
  const destAta = getAssociatedTokenAddress(mintPk, toPk, program);

  const tx = new Transaction()
    .add(createAtaIdempotentInstruction(fromPk, destAta, toPk, mintPk, program))
    .add(transferCheckedInstruction(new PublicKey(holding.ata), mintPk, destAta, fromPk, rawAmount, holding.decimals, program));
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPk;
  return tx;
}

export async function estimateFee(conn: Connection, tx: Transaction): Promise<number | null> {
  try {
    const fee = await conn.getFeeForMessage(tx.compileMessage(), "confirmed");
    return fee.value;
  } catch {
    return null;
  }
}

export async function waitForSignature(conn: Connection, signature: string, timeoutMs = 45_000): Promise<"confirmed" | "failed" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await conn.getSignatureStatuses([signature]);
    const s = st.value[0];
    if (s) {
      if (s.err) return "failed";
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return "confirmed";
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return "timeout";
}

export function explorerTxUrl(signature: string, network: NetworkId): string {
  const cluster = network === "mainnet-beta" || network === "custom" ? "" : `?cluster=${network}`;
  return `https://solscan.io/tx/${signature}${cluster}`;
}

export function explorerAddressUrl(addr: string, network: NetworkId): string {
  const cluster = network === "mainnet-beta" || network === "custom" ? "" : `?cluster=${network}`;
  return `https://solscan.io/account/${addr}${cluster}`;
}

export function isValidAddress(addr: string): boolean {
  try {
    new PublicKey(addr.trim());
    return true;
  } catch {
    return false;
  }
}
