// Transaction preview for the approval screen — turns blind signing into
// informed signing. Two independent signals:
//   1) static instruction decode → human-readable summary + danger flags
//   2) RPC simulation → authoritative pass/fail + the signer's real SOL delta
// Both are best-effort and wrapped so analysis never blocks the decision; if it
// can't preview, the screen says so and the user can still reject.

import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { formatAmount, truncateAddress, LAMPORTS, bytesFromB64 } from "./format";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } from "./spl";
import { isVersionedTransaction } from "./txbytes";

export interface TxLine {
  label: string;
  tone: "neutral" | "warn" | "danger" | "good";
}

export interface TxAnalysis {
  status: "ok" | "will-fail" | "unknown";
  solDelta: number | null; // signer's SOL change from the tx (excl. network fee)
  lines: TxLine[];
  programs: string[];
  hasUnknownPrograms: boolean;
  extraTxCount: number; // additional txs in a signAll batch, not analysed
  err?: string;
}

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN = TOKEN_PROGRAM_ID.toBase58();
const TOKEN22 = TOKEN_2022_PROGRAM_ID.toBase58();

const KNOWN_PROGRAMS: Record<string, string> = {
  [SYSTEM_PROGRAM]: "System",
  [TOKEN]: "Token",
  [TOKEN22]: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca",
};

interface Ix {
  programId: string;
  keys: string[];
  data: Uint8Array;
}

function extractInstructions(bytes: Uint8Array): Ix[] {
  if (isVersionedTransaction(bytes)) {
    const vtx = VersionedTransaction.deserialize(bytes);
    const keys = vtx.message.staticAccountKeys.map((k) => k.toBase58());
    return vtx.message.compiledInstructions.map((ci) => ({
      programId: keys[ci.programIdIndex] ?? "unknown",
      keys: Array.from(ci.accountKeyIndexes, (i) => keys[i] ?? "?"),
      data: ci.data instanceof Uint8Array ? ci.data : Uint8Array.from(ci.data),
    }));
  }
  const tx = Transaction.from(bytes);
  return tx.instructions.map((ix) => ({
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => k.pubkey.toBase58()),
    data: new Uint8Array(ix.data),
  }));
}

function decode(bytes: Uint8Array, owner: string): { lines: TxLine[]; programs: string[]; hasUnknownPrograms: boolean } {
  const lines: TxLine[] = [];
  const programSet = new Set<string>();
  let hasUnknownPrograms = false;
  const ixs = extractInstructions(bytes);

  for (const ix of ixs) {
    if (!KNOWN_PROGRAMS[ix.programId]) hasUnknownPrograms = true;
    programSet.add(KNOWN_PROGRAMS[ix.programId] ?? truncateAddress(ix.programId));
    const d = ix.data;

    if (ix.programId === SYSTEM_PROGRAM && d.length >= 4) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      const instructionType = dv.getUint32(0, true);
      if (instructionType === 2 && d.length >= 12) {
        // Transfer
        const lamports = Number(dv.getBigUint64(4, true));
        const to = ix.keys[1];
        const outgoing = ix.keys[0] === owner;
        lines.push({
          label: `${outgoing ? "Send" : "Transfer"} ${formatAmount(lamports / LAMPORTS, 6)} SOL${to ? ` ${outgoing ? "to" : "via"} ${truncateAddress(to)}` : ""}`,
          tone: outgoing ? "warn" : "neutral",
        });
      } else if (instructionType === 4) {
        // AdvanceNonceAccount
        lines.push({ label: "Delayed/Durable Nonce Transaction", tone: "danger" });
      }
    } else if (ix.programId === TOKEN || ix.programId === TOKEN22) {
      const t = d[0];
      if (t === 3 || t === 12) lines.push({ label: "Transfer a token", tone: "warn" });
      else if (t === 4 || t === 13) lines.push({ label: "Approve a token spending allowance", tone: "danger" });
      else if (t === 6) lines.push({ label: "Change a token account's authority", tone: "danger" });
      else if (t === 9) lines.push({ label: "Close a token account", tone: "warn" });
    }
  }

  return { lines, programs: [...programSet], hasUnknownPrograms };
}

async function simulate(
  conn: Connection,
  bytes: Uint8Array,
  owner: string,
): Promise<{ err: unknown; ownerPostLamports: number | null }> {
  if (isVersionedTransaction(bytes)) {
    const vtx = VersionedTransaction.deserialize(bytes);
    const res = await conn.simulateTransaction(vtx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      accounts: { encoding: "base64", addresses: [owner] },
    });
    return { err: res.value.err, ownerPostLamports: res.value.accounts?.[0]?.lamports ?? null };
  }
  const tx = Transaction.from(bytes);
  const res = await conn.simulateTransaction(tx, undefined, [new PublicKey(owner)]);
  return { err: res.value.err, ownerPostLamports: res.value.accounts?.[0]?.lamports ?? null };
}

/** Raw amount (u64) at offset 64 of an SPL token account under simulation. */
async function simulateTokenAccountAmount(conn: Connection, bytes: Uint8Array, ata: PublicKey): Promise<bigint | null> {
  let accounts;
  if (isVersionedTransaction(bytes)) {
    const res = await conn.simulateTransaction(VersionedTransaction.deserialize(bytes), {
      sigVerify: false,
      replaceRecentBlockhash: true,
      accounts: { encoding: "base64", addresses: [ata.toBase58()] },
    });
    accounts = res.value.accounts;
  } else {
    const res = await conn.simulateTransaction(Transaction.from(bytes), undefined, [ata]);
    accounts = res.value.accounts;
  }
  const acc = accounts?.[0];
  if (!acc || !acc.data) return null;
  const b64 = Array.isArray(acc.data) ? acc.data[0] : typeof acc.data === "string" ? acc.data : null;
  if (!b64) return null;
  const data = bytesFromB64(b64);
  if (data.length < 72) return null; // SPL token account layout: amount is u64 LE at offset 64
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

/**
 * Raw amount of `mint` the owner SPENDS under simulation (current − post), or
 * null if it can't be determined. Guards a swap against an API that returns a
 * transaction draining more of the *input token* than quoted. Assumes the
 * classic SPL Token program (the swap UI's token list is all classic SPL); if
 * the ATA can't be read the check simply returns null and does not block.
 */
export async function simulateTokenSpend(
  conn: Connection,
  txBytes: Uint8Array,
  owner: string,
  mint: string,
): Promise<bigint | null> {
  try {
    const ata = getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner));
    const [currentRaw, postRaw] = await Promise.all([
      conn.getTokenAccountBalance(ata).then((r) => BigInt(r.value.amount)).catch(() => null),
      simulateTokenAccountAmount(conn, txBytes, ata).catch(() => null),
    ]);
    if (currentRaw == null || postRaw == null) return null;
    return currentRaw - postRaw; // positive = tokens leaving the wallet
  } catch {
    return null;
  }
}

export async function analyzeTransaction(
  conn: Connection,
  txsB64: Uint8Array[],
  owner: string,
): Promise<TxAnalysis> {
  const analysis: TxAnalysis = {
    status: "unknown",
    solDelta: null,
    lines: [],
    programs: [],
    hasUnknownPrograms: false,
    extraTxCount: 0,
  };

  const programSet = new Set<string>();

  try {
    const current = await conn.getBalance(new PublicKey(owner)).catch(() => null);
    let totalSolDelta = 0;

    for (let i = 0; i < txsB64.length; i++) {
      const bytes = txsB64[i];
      try {
        const { lines, programs, hasUnknownPrograms } = decode(bytes, owner);
        analysis.lines.push(...lines);
        programs.forEach(p => programSet.add(p));
        if (hasUnknownPrograms) analysis.hasUnknownPrograms = true;
      } catch {
        // undecodable — simulation below still runs
      }

      const sim = await simulate(conn, bytes, owner);
      if (sim.err) {
        analysis.status = "will-fail";
        analysis.err = typeof sim.err === "string" ? sim.err : JSON.stringify(sim.err).slice(0, 120);
        analysis.programs = [...programSet];
        return analysis;
      }

      if (sim.ownerPostLamports != null && current != null) {
        totalSolDelta += (sim.ownerPostLamports - current) / LAMPORTS;
      }
    }

    analysis.status = "ok";
    analysis.programs = [...programSet];
    if (current != null) {
      analysis.solDelta = totalSolDelta;
    }
  } catch {
    analysis.status = "unknown";
  }

  return analysis;
}
