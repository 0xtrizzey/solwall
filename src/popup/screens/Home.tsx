import { useEffect, useState } from "react";
import { formatAmount, formatFiat } from "../../lib/format";
import { fetchFiatRate } from "../../lib/prices";
import type { Snapshot } from "../../lib/types";
import { usePortfolio, type Portfolio } from "../balances";
import { Btn, ErrorState, SkeletonRows, TokenAvatar, useCountUp } from "../components";
import { IconGlobe, IconReceive, IconSend, IconSwap, IconWallet } from "../icons";

export function Home({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const active = snap.pub.active;
  const { portfolio, reload } = usePortfolio(active?.pubkey, snap.pub.network, snap.pub.customRpcUrl, 10_000);
  const fiat = snap.pub.fiat || "USD";
  const [rate, setRate] = useState(1);

  useEffect(() => {
    let alive = true;
    fetchFiatRate(fiat).then((r) => alive && setRate(r));
    return () => {
      alive = false;
    };
  }, [fiat]);

  const defaultMainnet = snap.pub.network === "mainnet-beta" && !snap.pub.customRpcUrl;

  return (
    <div className="home">
      <BalanceHero portfolio={portfolio} network={snap.pub.network} fiat={fiat} rate={rate} />
      <div className="action-row">
        <ActionBtn label="Receive" icon={<IconReceive size={20} />} onClick={() => nav("/receive")} />
        <ActionBtn label="Send" icon={<IconSend size={20} />} onClick={() => nav("/send")} />
        <ActionBtn label="Swap" icon={<IconSwap size={20} />} onClick={() => nav("/swap")} />
      </div>
      <TokenList portfolio={portfolio} reload={reload} nav={nav} fiat={fiat} rate={rate} showRpcHint={defaultMainnet} />
    </div>
  );
}

function BalanceHero({ portfolio, network, fiat, rate }: { portfolio: Portfolio; network: string; fiat: string; rate: number }) {
  const totalFiat = portfolio.status === "ready" && portfolio.totalUsd != null ? portfolio.totalUsd * rate : null;
  const value = useCountUp(totalFiat);
  const sol = portfolio.rows.find((r) => r.isNative);

  return (
    <div className="balance-hero">
      <div className="solar-field hero-field" aria-hidden />
      <div className="balance-label">Total balance</div>
      {portfolio.status === "loading" ? (
        <div className="sk sk-balance" />
      ) : portfolio.status === "error" ? (
        <div className="balance-usd">—</div>
      ) : value != null ? (
        <div className="balance-usd">{formatFiat(value, fiat)}</div>
      ) : (
        <div className="balance-usd">{formatAmount(sol?.amount ?? 0, 4)} SOL</div>
      )}
      {portfolio.status === "ready" && value != null && sol && (
        <div className="balance-sub mono">
          {formatAmount(sol.amount, 4)} SOL{network !== "mainnet-beta" ? ` · ${network}` : ""}
        </div>
      )}
      {portfolio.status === "ready" && value == null && network !== "mainnet-beta" && (
        <div className="balance-sub mono">{network} · prices unavailable</div>
      )}
    </div>
  );
}

function ActionBtn({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className="action-btn" onClick={onClick}>
      <span className="action-icon">{icon}</span>
      {label}
    </button>
  );
}

function TokenList({
  portfolio,
  reload,
  nav,
  fiat,
  rate,
  showRpcHint,
}: {
  portfolio: Portfolio;
  reload: () => void;
  nav: (r: string) => void;
  fiat: string;
  rate: number;
  showRpcHint: boolean;
}) {
  if (portfolio.status === "loading") return <SkeletonRows count={3} />;
  if (portfolio.status === "error") return <ErrorState message={portfolio.error ?? "Network error"} onRetry={reload} />;

  const rows = portfolio.rows;
  const hasFunds = rows.some((r) => r.amount > 0);

  return (
    <div className="token-list stagger">
      {rows.map((r) => (
        <button key={r.mint} className="token-row" onClick={() => nav(`/send?mint=${r.isNative ? "sol" : r.mint}`)}>
          <TokenAvatar symbol={r.symbol} logoURI={r.isNative ? SOL_LOGO : r.logoURI} />
          <div className="token-mid">
            <div className="token-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {r.isNative ? "Solana" : r.name}
              {r.holding?.unverified && (
                <span className="unverified-badge" title={`Unverified token. Mint: ${r.mint}`}>
                  Unverified
                </span>
              )}
            </div>
            <div className="token-amount mono">
              {formatAmount(r.amount, 5)} {r.symbol}
            </div>
          </div>
          <div className="token-usd mono">{r.usd != null ? formatFiat(r.usd * rate, fiat) : ""}</div>
        </button>
      ))}
      {!hasFunds && (
        <div className="fund-hint">
          <div className="fund-icon">
            <IconWallet size={20} />
          </div>
          <div>
            <strong>No SOL yet.</strong> Deposit from an exchange or another wallet to get started.
          </div>
          <Btn size="sm" variant="outline" onClick={() => nav("/receive")}>
            Show address
          </Btn>
        </div>
      )}
      {showRpcHint && (
        <button className="rpc-hint" onClick={() => nav("/settings")}>
          <IconGlobe size={16} />
          <span>
            Only SOL shows on the default RPC. Add a custom RPC in Settings to see all your SPL tokens & NFTs.
          </span>
        </button>
      )}
    </div>
  );
}

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
