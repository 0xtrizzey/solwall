import { useEffect, useMemo, useState } from "react";
import { formatAmount, formatSol, truncateAddress, b64FromBytes, parseAmountToRaw } from "../../lib/format";
import {
  buildSolTransfer,
  buildTokenTransfer,
  estimateFee,
  explorerTxUrl,
  isValidAddress,
  makeConnection,
  waitForSignature,
} from "../../lib/rpc";
import type { NetworkId, Snapshot } from "../../lib/types";
import { friendlyRpcError, friendlyTxError } from "../../lib/errors";
import { usePortfolio, type PortfolioRow } from "../balances";
import { bg } from "../bg";
import { Btn, Field, Sheet, TokenAvatar, Identicon } from "../components";
import { IconBack, IconCheck, IconChevronD, IconCopy, IconExternal, IconWarning } from "../icons";
import { useCopy, useStore } from "../store";

type Phase =
  | { id: "form" }
  | { id: "review"; fee: number | null }
  | { id: "sending" }
  | { id: "done"; signature: string; status: "confirmed" | "timeout" }
  | { id: "failed"; error: string };

export function Send({ snap, nav, query }: { snap: Snapshot; nav: (r: string) => void; query: URLSearchParams }) {
  const { toast, refresh } = useStore();
  const copy = useCopy();
  const active = snap.pub.active!;
  const { portfolio } = usePortfolio(active.pubkey, snap.pub.network, snap.pub.customRpcUrl);

  const spendable = portfolio.rows.filter((r) => r.amount > 0 || r.isNative);
  const preselect = query.get("mint");
  const [mint, setMint] = useState<string>(preselect === "sol" || !preselect ? "sol" : preselect);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>({ id: "form" });

  const token: PortfolioRow | undefined =
    mint === "sol" ? portfolio.rows.find((r) => r.isNative) : portfolio.rows.find((r) => r.mint === mint);

  const toValid = to.trim() === "" ? null : isValidAddress(to.trim());
  const amountNum = parseFloat(amount);
  const amountValid = isFinite(amountNum) && amountNum > 0 && token != null && amountNum <= token.amount;
  const selfSend = to.trim() === active.pubkey;

  const buildTx = async () => {
    const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
    if (!token) throw new Error("Select a token");
    if (token.isNative) {
      return buildSolTransfer(conn, active.pubkey, to.trim(), parseAmountToRaw(amount, 9));
    }
    return buildTokenTransfer(conn, active.pubkey, to.trim(), token.holding!, parseAmountToRaw(amount, token.holding!.decimals));
  };

  const review = async () => {
    try {
      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const tx = await buildTx();
      const fee = await estimateFee(conn, tx);
      setPhase({ id: "review", fee });
    } catch (e) {
      toast(friendlyRpcError(e), "error");
    }
  };

  const send = async () => {
    setPhase({ id: "sending" });
    try {
      const tx = await buildTx(); // rebuild for a fresh blockhash
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signature } = await bg<{ signature: string }>({ type: "signAndSend", txB64: b64FromBytes(new Uint8Array(bytes)) });
      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const status = await waitForSignature(conn, signature);
      if (status === "failed") setPhase({ id: "failed", error: "Transaction failed on-chain." });
      else setPhase({ id: "done", signature, status });
    } catch (e) {
      setPhase({ id: "failed", error: friendlyTxError(e) });
    }
  };

  if (phase.id === "done") {
    return (
      <div className="screen subscreen">
        <div className="result">
          <div className="result-badge success">
            <IconCheck size={26} />
          </div>
          <h1>{phase.status === "confirmed" ? "Sent" : "Submitted"}</h1>
          <p>
            {formatAmount(amountNum, 6)} {token?.symbol} to <span className="mono">{truncateAddress(to.trim())}</span>
            {phase.status === "timeout" && " — confirmation is taking longer than usual."}
          </p>
          <SolscanVerify signature={phase.signature} network={snap.pub.network} onCopy={copy} />
          {!(snap.addressBook ?? []).some((e) => e.address === to.trim()) && (
            <Btn
              size="md"
              variant="outline"
              onClick={async () => {
                await bg({ type: "addAddress", address: to.trim(), name: "" });
                await refresh();
                toast("Saved to address book", "success");
              }}
            >
              Save recipient
            </Btn>
          )}
          <Btn size="lg" onClick={() => nav("/")}>
            Done
          </Btn>
        </div>
      </div>
    );
  }

  if (phase.id === "failed") {
    return (
      <div className="screen subscreen">
        <div className="result">
          <div className="result-badge error">
            <IconWarning size={26} />
          </div>
          <h1>Not sent</h1>
          <p className="wrap-any">{phase.error}</p>
          <Btn size="lg" variant="outline" onClick={() => setPhase({ id: "form" })}>
            Back
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="screen subscreen">
      <SubHeader title="Send" onBack={() => nav("/")} />
      <div className="send-form">
        <div className="field">
          <label>Asset</label>
          <button className="token-select" onClick={() => setPickerOpen(true)}>
            {token ? (
              <>
                <TokenAvatar symbol={token.symbol} logoURI={token.logoURI} size={28} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span className="token-select-sym" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {token.symbol}
                    {token.holding?.unverified && <span className="unverified-badge" title={`Unverified token. Mint: ${token.mint}`}>Unverified</span>}
                  </span>
                  <span className="token-select-bal mono">{formatAmount(token.amount, 5)} available</span>
                </div>
              </>
            ) : (
              <span>Select token</span>
            )}
            <IconChevronD size={16} />
          </button>
        </div>
        <Field
          label="To"
          className="mono-input"
          placeholder="Recipient's Solana address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={toValid === false ? "That's not a valid Solana address." : selfSend ? "This is your own address." : null}
          spellCheck={false}
          autoComplete="off"
        />
        {(snap.addressBook ?? []).length > 0 && (
          <div className="saved-addrs">
            {(snap.addressBook ?? []).map((e) => (
              <button key={e.address} type="button" className={`chip ${to.trim() === e.address ? "chip-right" : ""}`} onClick={() => setTo(e.address)}>
                {e.name}
              </button>
            ))}
          </div>
        )}
        <Field
          label="Amount"
          className="mono-input"
          type="number"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          min="0"
          step="any"
          onChange={(e) => setAmount(e.target.value)}
          error={amount && !amountValid ? (amountNum > (token?.amount ?? 0) ? "More than your balance." : "Enter a valid amount.") : null}
          trailing={
            <button
              className="max-btn"
              onClick={() => {
                if (!token) return;
                const max = token.isNative ? Math.max(0, token.amount - 0.001) : token.amount;
                setAmount(String(max));
              }}
            >
              Max
            </button>
          }
        />
        <div className="step-actions">
          <Btn size="lg" disabled={!toValid || !amountValid} onClick={() => void review()}>
            Review
          </Btn>
        </div>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Select asset">
        <div className="picker-list">
          {spendable.map((r) => (
            <button
              key={r.mint}
              className="token-row"
              onClick={() => {
                setMint(r.isNative ? "sol" : r.mint);
                setPickerOpen(false);
              }}
            >
              <TokenAvatar symbol={r.symbol} logoURI={r.logoURI} />
              <div className="token-mid">
                <div className="token-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {r.name}
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
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={phase.id === "review" || phase.id === "sending"} onClose={() => phase.id === "review" && setPhase({ id: "form" })} title="Confirm send">
        <div className="review">
          <div className="review-amount">
            {formatAmount(amountNum, 6)} <span>{token?.symbol}</span>
          </div>
          <div className="review-rows">
            <div className="kv">
              <span>To</span>
              <span className="mono" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Identicon address={to.trim()} size={14} />
                {truncateAddress(to.trim(), 6)}
              </span>
            </div>
            <div className="kv">
              <span>Network</span>
              <span>{snap.pub.network}</span>
            </div>
            <div className="kv">
              <span>Network fee</span>
              <span className="mono">{phase.id === "review" && phase.fee != null ? `${formatSol(phase.fee, 6)} SOL` : "~0.000005 SOL"}</span>
            </div>
          </div>
          <Btn size="lg" loading={phase.id === "sending"} onClick={() => void send()}>
            Send now
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}

export function SolscanVerify({
  signature,
  network,
  onCopy,
}: {
  signature: string;
  network: NetworkId;
  onCopy: (text: string, label?: string) => Promise<void>;
}) {
  return (
    <div className="sig-verify">
      <button className="sig-chip" onClick={() => void onCopy(signature, "Signature copied")} title={signature}>
        <span className="mono">{truncateAddress(signature, 8)}</span>
        <IconCopy size={13} />
      </button>
      <a className="link-btn" href={explorerTxUrl(signature, network)} target="_blank" rel="noreferrer">
        Verify on Solscan <IconExternal size={14} />
      </a>
    </div>
  );
}

export function SubHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="sub-header">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <IconBack size={18} />
      </button>
      <h1>{title}</h1>
      <div className="sub-header-right">{right}</div>
    </div>
  );
}
