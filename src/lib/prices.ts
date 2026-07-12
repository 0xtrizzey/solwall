// USD prices — Jupiter lite API first (per-mint), CoinGecko fallback for SOL.
// Both are best-effort: on failure the UI degrades to amounts without USD.

import { WSOL_MINT } from "./tokens";

const cache = new Map<string, { price: number; at: number }>();
const TTL = 60_000;

async function jupPrices(mints: string[]): Promise<Record<string, number>> {
  const url = `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`price api ${res.status}`);
  const json = await res.json();
  const out: Record<string, number> = {};
  // v3 shape: { <mint>: { usdPrice } } ; v2 shape: { data: { <mint>: { price } } }
  const body = json?.data ?? json;
  for (const mint of mints) {
    const entry = body?.[mint];
    const p = Number(entry?.usdPrice ?? entry?.price);
    if (isFinite(p) && p > 0 && p < 1_000_000) out[mint] = p;
  }
  return out;
}

async function coingeckoSol(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    if (!res.ok) return null;
    const json = await res.json();
    const p = Number(json?.solana?.usd);
    return isFinite(p) && p > 0 && p < 1_000_000 ? p : null;
  } catch {
    return null;
  }
}

/** Returns a mint -> USD price map. Use WSOL_MINT for native SOL. */
export async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  const need = mints.filter((m) => {
    const c = cache.get(m);
    return !c || now - c.at > TTL;
  });

  if (need.length > 0) {
    try {
      const fresh = await jupPrices(need);
      for (const [m, p] of Object.entries(fresh)) cache.set(m, { price: p, at: now });
    } catch {
      // fall through to coingecko for SOL only
    }
    if (need.includes(WSOL_MINT) && !cache.has(WSOL_MINT)) {
      const p = await coingeckoSol();
      if (p) cache.set(WSOL_MINT, { price: p, at: now });
    }
  }

  const out: Record<string, number> = {};
  for (const m of mints) {
    const c = cache.get(m);
    if (c) out[m] = c.price;
  }
  return out;
}

// ---- fiat FX (USD -> selected currency) ----

export const FIAT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "BRL", "KRW", "SGD"];

const fx: { at: number; rates: Record<string, number> } = { at: 0, rates: { USD: 1 } };

/** USD -> `fiat` multiplier. Cached 1h; falls back to last-known or 1.0 (USD). */
export async function fetchFiatRate(fiat: string): Promise<number> {
  const f = (fiat || "USD").toUpperCase();
  if (f === "USD") return 1;
  if (Date.now() - fx.at < 3_600_000 && fx.rates[f]) return fx.rates[f];
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.rates && typeof json.rates === "object") {
      const safeRates: Record<string, number> = {};
      for (const [k, v] of Object.entries(json.rates)) {
        const num = Number(v);
        if (isFinite(num) && num > 0 && num < 100_000) safeRates[k] = num;
      }
      fx.rates = safeRates;
      fx.at = Date.now();
    }
  } catch {
    // keep last-known rates
  }
  const r = fx.rates[f];
  return isFinite(r) && r > 0 ? r : 1;
}
