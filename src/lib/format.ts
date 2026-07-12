export const LAMPORTS = 1_000_000_000;

export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatSol(lamports: number, maxDecimals = 4): string {
  const sol = lamports / LAMPORTS;
  return formatAmount(sol, maxDecimals);
}

export function formatAmount(n: number, maxDecimals = 4): string {
  if (!isFinite(n)) return "—";
  if (n !== 0 && Math.abs(n) < 1 / 10 ** maxDecimals) return `<${(1 / 10 ** maxDecimals).toFixed(maxDecimals)}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function parseAmountToRaw(uiAmountStr: string, decimals: number): bigint {
  if (!uiAmountStr) return 0n;
  const parts = uiAmountStr.replace(/,/g, "").split(".");
  const intPart = parts[0] || "0";
  const fracPart = (parts[1] || "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(intPart + fracPart);
}

export function formatUsd(n: number | null | undefined): string {
  return formatFiat(n, "USD");
}

export function formatFiat(n: number | null | undefined, currency = "USD"): string {
  if (n == null || !isFinite(n)) return "—";
  try {
    if (n !== 0 && Math.abs(n) < 0.01) {
      const symbol = (0).toLocaleString("en-US", { style: "currency", currency }).replace(/[\d.,\s]/g, "");
      return `<${symbol}0.01`;
    }
    return n.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "";
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dayLabel(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "Pending";
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function uid(): string {
  return crypto.randomUUID();
}

export function b64FromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
