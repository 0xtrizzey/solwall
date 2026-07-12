import { useEffect, useRef, useState } from "react";
import { formatAmount, truncateAddress } from "../../lib/format";
import { getQuote, getSwapTransaction, type SwapQuote } from "../../lib/jupiter";
import { explorerTxUrl, makeConnection, waitForSignature } from "../../lib/rpc";
import { KNOWN_TOKENS, WSOL_MINT } from "../../lib/tokens";
import type { Snapshot } from "../../lib/types";
import { friendlyRpcError, friendlyTxError } from "../../lib/errors";
import { usePortfolio, type PortfolioRow } from "../balances";
import { bg } from "../bg";
import { Btn, Sheet, TokenAvatar } from "../components";
import { IconCheck, IconChevronD, IconExternal, IconSwap, IconWarning } from "../icons";
import { SolscanVerify, SubHeader } from "./Send";
import { useCopy } from "../store";

interface SwapSide {
  mint: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

const POPULAR: SwapSide[] = [
  { mint: WSOL_MINT, symbol: "SOL", decimals: 9, logoURI: KNOWN_TOKENS[WSOL_MINT].logoURI },
  ...["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"].map((m) => ({
    mint: m,
    symbol: KNOWN_TOKENS[m].symbol,
    decimals: KNOWN_TOKENS[m].decimals,
    logoURI: KNOWN_TOKENS[m].logoURI,
  })),
];

type Phase = { id: "form" } | { id: "swapping" } | { id: "done"; signature: string; status: string } | { id: "failed"; error: string };

export function Swap({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const copy = useCopy();
  const active = snap.pub.active!;
  const { portfolio, reload } = usePortfolio(active.pubkey, snap.pub.network, snap.pub.customRpcUrl);
  const [from, setFrom] = useState<SwapSide>(POPULAR[0]);
  const [to, setTo] = useState<SwapSide>(POPULAR[1]);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "error">("idle");
  const [quoteError, setQuoteError] = useState("");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [phase, setPhase] = useState<Phase>({ id: "form" });
  const debounce = useRef<number>();

  const mainnet = snap.pub.network === "mainnet-beta";
  const amountNum = parseFloat(amount);
  const fromBalance = from.mint === WSOL_MINT
    ? portfolio.rows.find((r) => r.isNative)?.amount ?? 0
    : portfolio.rows.find((r) => r.mint === from.mint)?.amount ?? 0;

  useEffect(() => {
    window.clearTimeout(debounce.current);
    setQuote(null);
    if (!mainnet || !isFinite(amountNum) || amountNum <= 0 || from.mint === to.mint) {
      setQuoteState("idle");
      return;
    }
    setQuoteState("loading");
    debounce.current = window.setTimeout(async () => {
      try {
        const raw = BigInt(Math.round(amountNum * 10 ** from.decimals)).toString();
        const q = await getQuote(from.mint, to.mint, raw);
        setQuote(q);
        setQuoteState("idle");
      } catch (e) {
        setQuoteError(friendlyRpcError(e));
        setQuoteState("error");
      }
    }, 600);
    return () => window.clearTimeout(debounce.current);
  }, [amount, from, to, mainnet, amountNum]);

  const outAmount = quote ? Number(quote.outAmount) / 10 ** to.decimals : null;
  const impact = quote ? parseFloat(quote.priceImpactPct) * 100 : 0;

  const doSwap = async () => {
    if (!quote) return;
    setPhase({ id: "swapping" });
    try {
      const txB64 = await getSwapTransaction(quote, active.pubkey);
      const { signature } = await bg<{ signature: string }>({ type: "signAndSend", txB64 });
      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const status = await waitForSignature(conn, signature, 60_000);
      if (status === "failed") setPhase({ id: "failed", error: "Swap failed on-chain (slippage or expired quote). Nothing was taken beyond fees." });
      else {
        reload();
        setPhase({ id: "done", signature, status });
      }
    } catch (e) {
      setPhase({ id: "failed", error: friendlyTxError(e) });
    }
  };

  if (phase.id === "done") {
    return (
      <div className="screen subscreen">
        <div className="result">
          <div className="result-badge success"><IconCheck size={26} /></div>
          <h1>Swapped</h1>
          <p>
            {formatAmount(amountNum, 6)} {from.symbol} → {outAmount != null ? formatAmount(outAmount, 6) : "?"} {to.symbol}
          </p>
          <SolscanVerify signature={phase.signature} network={snap.pub.network} onCopy={copy} />
          <Btn size="lg" onClick={() => nav("/")}>Done</Btn>
        </div>
      </div>
    );
  }

  if (phase.id === "failed") {
    return (
      <div className="screen subscreen">
        <div className="result">
          <div className="result-badge error"><IconWarning size={26} /></div>
          <h1>Swap failed</h1>
          <p className="wrap-any">{phase.error}</p>
          <Btn size="lg" variant="outline" onClick={() => setPhase({ id: "form" })}>Back</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="screen subscreen">
      <SubHeader title="Swap" onBack={() => nav("/")} />
      {!mainnet ? (
        <div className="callout warn" style={{ margin: "16px 20px" }}>
          <IconWarning size={16} /> Swaps route through Jupiter on mainnet only. Switch networks in Settings.
        </div>
      ) : (
        <div className="swap-form">
          <div className="swap-box">
            <div className="swap-box-head">
              <span>You pay</span>
              <button className="max-btn" onClick={() => setAmount(String(from.mint === WSOL_MINT ? Math.max(0, fromBalance - 0.01) : fromBalance))}>
                Balance: {formatAmount(fromBalance, 4)}
              </button>
            </div>
            <div className="swap-box-main">
              <input
                className="swap-amount mono"
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button className="token-select compact" onClick={() => setPicker("from")}>
                <TokenAvatar symbol={from.symbol} logoURI={from.logoURI} size={22} />
                {from.symbol}
                <IconChevronD size={14} />
              </button>
            </div>
          </div>

          <button
            className="swap-flip"
            aria-label="Flip direction"
            onClick={() => {
              setFrom(to);
              setTo(from);
              setQuote(null);
            }}
          >
            <IconSwap size={16} />
          </button>

          <div className="swap-box">
            <div className="swap-box-head">
              <span>You receive</span>
            </div>
            <div className="swap-box-main">
              <div className={`swap-amount mono ${outAmount == null ? "placeholder" : ""}`}>
                {quoteState === "loading" ? "…" : outAmount != null ? formatAmount(outAmount, 6) : "0.0"}
              </div>
              <button className="token-select compact" onClick={() => setPicker("to")}>
                <TokenAvatar symbol={to.symbol} logoURI={to.logoURI} size={22} />
                {to.symbol}
                <IconChevronD size={14} />
              </button>
            </div>
          </div>

          {quote && outAmount != null && (
            <div className="review-rows quote-rows">
              <div className="kv">
                <span>Rate</span>
                <span className="mono">1 {from.symbol} ≈ {formatAmount(outAmount / amountNum, 6)} {to.symbol}</span>
              </div>
              <div className="kv">
                <span>Price impact</span>
                <span className={`mono ${impact > 1 ? "text-danger" : ""}`}>{impact < 0.01 ? "<0.01" : impact.toFixed(2)}%</span>
              </div>
              <div className="kv">
                <span>Route</span>
                <span>{quote.routeLabels.slice(0, 2).join(" · ") || "Jupiter"}</span>
              </div>
              <div className="kv">
                <span>Slippage</span>
                <span className="mono">0.5%</span>
              </div>
            </div>
          )}
          {quoteState === "error" && <div className="callout warn"><IconWarning size={16} /> {quoteError}</div>}

          <div className="step-actions">
            <Btn
              size="lg"
              disabled={!quote || amountNum > fromBalance}
              loading={quoteState === "loading"}
              onClick={() => void doSwap()}
            >
              {amountNum > fromBalance ? `Not enough ${from.symbol}` : "Swap"}
            </Btn>
          </div>
        </div>
      )}

      <Sheet open={picker != null} onClose={() => setPicker(null)} title={picker === "from" ? "You pay" : "You receive"}>
        <div className="picker-list">
          {POPULAR.map((t) => (
            <button
              key={t.mint}
              className="token-row"
              onClick={() => {
                if (picker === "from") {
                  if (t.mint === to.mint) setTo(from);
                  setFrom(t);
                } else {
                  if (t.mint === from.mint) setFrom(to);
                  setTo(t);
                }
                setPicker(null);
                setQuote(null);
              }}
            >
              <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} />
              <div className="token-mid">
                <div className="token-name">{t.symbol}</div>
                <div className="token-amount mono">{truncateAddress(t.mint)}</div>
              </div>
              {(picker === "from" ? from : to).mint === t.mint && <IconCheck size={16} />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
