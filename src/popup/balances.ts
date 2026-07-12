// Portfolio data hook — SOL + SPL holdings + USD prices, cached per
// account+network for 30s so tab switches feel instant.

import { useCallback, useEffect, useRef, useState } from "react";
import { makeConnection, fetchSolBalance, fetchTokenHoldings, type TokenHolding } from "../lib/rpc";
import { fetchPrices } from "../lib/prices";
import { WSOL_MINT } from "../lib/tokens";
import { friendlyRpcError } from "../lib/errors";
import type { NetworkId } from "../lib/types";

/** Resolve to `fallback` if `p` doesn't settle within `ms` (never hangs the UI). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    const finish = (v: T) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    p.then(finish).catch(() => finish(fallback));
  });
}

export interface PortfolioRow {
  mint: string; // WSOL_MINT stands in for native SOL
  isNative: boolean;
  symbol: string;
  name: string;
  amount: number;
  usd: number | null;
  logoURI?: string;
  holding?: TokenHolding;
}

export interface Portfolio {
  status: "loading" | "ready" | "error";
  rows: PortfolioRow[];
  nfts: TokenHolding[];
  totalUsd: number | null;
  solLamports: number;
  error?: string;
}

const cache = new Map<string, { at: number; data: Portfolio }>();
const TTL = 30_000;

export function usePortfolio(pubkey: string | undefined, network: NetworkId, customRpcUrl: string, autoRefreshMs?: number) {
  const key = `${pubkey}|${network}|${customRpcUrl}`;
  const cached = cache.get(key);
  const [portfolio, setPortfolio] = useState<Portfolio>(
    cached && Date.now() - cached.at < TTL ? cached.data : { status: "loading", rows: [], nfts: [], totalUsd: null, solLamports: 0 },
  );
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async (force = false) => {
    if (!pubkey) return;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL) {
      setPortfolio(hit.data);
      return;
    }
    if (!hit) setPortfolio({ status: "loading", rows: [], nfts: [], totalUsd: null, solLamports: 0 });
    try {
      const conn = makeConnection(network, customRpcUrl);
      // Each call is time-boxed so one slow/blocked RPC method (some public
      // endpoints throttle or block token-account queries) can never hang the
      // whole portfolio. SOL balance is required; tokens/prices degrade to empty.
      const [lamports, holdings] = await Promise.all([
        withTimeout(fetchSolBalance(conn, pubkey), 9000, null as number | null),
        withTimeout(fetchTokenHoldings(conn, pubkey).catch(() => [] as TokenHolding[]), 9000, [] as TokenHolding[]),
      ]);
      if (lamports === null) throw new Error("RPC timed out");
      const fungible = holdings.filter((h) => !h.isNft);
      const nfts = holdings.filter((h) => h.isNft);
      const mints = [WSOL_MINT, ...fungible.map((h) => h.mint)];
      const prices =
        network === "mainnet-beta"
          ? await withTimeout(fetchPrices(mints).catch(() => ({}) as Record<string, number>), 6000, {} as Record<string, number>)
          : {};

      const solAmount = lamports / 1e9;
      const rows: PortfolioRow[] = [
        {
          mint: WSOL_MINT,
          isNative: true,
          symbol: "SOL",
          name: "Solana",
          amount: solAmount,
          usd: prices[WSOL_MINT] != null ? solAmount * prices[WSOL_MINT] : null,
        },
        ...fungible.map((h) => ({
          mint: h.mint,
          isNative: false,
          symbol: h.symbol,
          name: h.name,
          amount: h.amount,
          usd: prices[h.mint] != null ? h.amount * prices[h.mint] : null,
          logoURI: h.logoURI,
          holding: h,
        })),
      ];
      const priced = rows.filter((r) => r.usd != null);
      const totalUsd = priced.length > 0 ? priced.reduce((s, r) => s + (r.usd ?? 0), 0) : null;
      const data: Portfolio = { status: "ready", rows, nfts, totalUsd, solLamports: lamports };
      cache.set(key, { at: Date.now(), data });
      if (keyRef.current === key) setPortfolio(data);
    } catch (e) {
      const data: Portfolio = {
        status: "error",
        rows: [],
        nfts: [],
        totalUsd: null,
        solLamports: 0,
        error: friendlyRpcError(e),
      };
      if (keyRef.current === key) setPortfolio(data);
    }
  }, [pubkey, network, customRpcUrl, key]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh on an interval (silent — no loading flicker), paused while the
  // popup is hidden so we don't hammer the RPC in the background.
  useEffect(() => {
    if (!autoRefreshMs || !pubkey) return;
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, autoRefreshMs);
    const onVisible = () => {
      if (!document.hidden) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefreshMs, pubkey, load]);

  return { portfolio, reload: () => load(true) };
}
