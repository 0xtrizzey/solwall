import { useEffect, useState } from "react";
import { bytesFromB64, formatAmount, truncateAddress } from "../../lib/format";
import { makeConnection } from "../../lib/rpc";
import { analyzeTransaction, type TxAnalysis } from "../../lib/txanalyze";
import type { ApprovalRequest, Snapshot } from "../../lib/types";
import { bg } from "../bg";
import { Btn, Identicon } from "../components";
import { IconLink, IconWarning, Logo } from "../icons";

type State =
  | { status: "loading" }
  | { status: "gone"; message: string }
  | { status: "ready"; request: ApprovalRequest }
  | { status: "resolving" };

export function Approval({ snap, id }: { snap: Snapshot; id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [pubkey, setPubkey] = useState<string | undefined>(snap.pub.active?.pubkey);

  const [analysis, setAnalysis] = useState<TxAnalysis | "loading" | null>(null);

  useEffect(() => {
    bg<ApprovalRequest>({ type: "getApproval", id })
      .then((request) => setState({ status: "ready", request }))
      .catch((e) => setState({ status: "gone", message: e instanceof Error ? e.message : String(e) }));
  }, [id]);

  // Simulate + decode transaction approvals so the user isn't signing blind.
  useEffect(() => {
    if (state.status !== "ready" || state.request.payload.kind !== "signTransaction") return;
    const req = state.request;
    const owner = snap.pub.connectedSites[req.origin]?.pubkey ?? snap.pub.active?.pubkey;
    if (owner == null || req.payload.kind !== "signTransaction") return;
    setAnalysis("loading");
    const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
    analyzeTransaction(conn, req.payload.txsB64.map(bytesFromB64), owner)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
  }, [state, snap.pub.network, snap.pub.customRpcUrl]);

  const resolve = async (approved: boolean) => {
    if (state.status !== "ready") return;
    setState({ status: "resolving" });
    try {
      await bg({ type: "resolveApproval", id, approved, pubkey });
    } finally {
      window.close();
    }
  };

  if (state.status === "loading" || state.status === "resolving") {
    return (
      <div className="screen approval">
        <div className="approval-center">
          <span className="spinner big" />
        </div>
      </div>
    );
  }

  if (state.status === "gone") {
    return (
      <div className="screen approval">
        <div className="approval-center">
          <IconWarning size={28} />
          <p>{state.message}</p>
          <Btn variant="outline" onClick={() => window.close()}>
            Close
          </Btn>
        </div>
      </div>
    );
  }

  const { request } = state;
  const host = request.origin.replace(/^https?:\/\//, "");
  const kind = request.payload.kind;

  return (
    <div className="screen approval">
      <div className="approval-head">
        <Logo size={36} />
        <div className="origin-pill">
          <IconLink size={13} />
          {host}
        </div>
      </div>

      <div className="approval-body">
        {kind === "connect" && (
          <>
            <h1>Connect to {host}?</h1>
            <p className="approval-sub">
              The app will see this account's address and balances, and can ask you to approve transactions. It cannot move
              funds without your approval.
            </p>
            <div className="field">
              <label>Account</label>
              <select className="select" value={pubkey} onChange={(e) => setPubkey(e.target.value)}>
                {snap.pub.wallets.flatMap((w) =>
                  w.accounts.map((a) => (
                    <option key={a.pubkey} value={a.pubkey}>
                      {w.name} / {a.name} ({truncateAddress(a.pubkey)})
                    </option>
                  )),
                )}
              </select>
            </div>
          </>
        )}

        {kind === "signMessage" && (
          <>
            <h1>Sign message</h1>
            <p className="approval-sub">
              {host} asks you to sign a message. Signing costs nothing and sends no transaction — but only sign text you
              understand.
            </p>
            <div className="secret-box mono message-box">{decodeMessage(request.payload.messageB64)}</div>
          </>
        )}

        {kind === "signTransaction" && (
          <>
            <h1>{request.payload.send ? "Approve transaction" : "Sign transaction"}</h1>
            <p className="approval-sub">
              {host} asks you to {request.payload.send ? "approve and send" : "sign"}{" "}
              {request.payload.txsB64.length === 1 ? "a transaction" : `${request.payload.txsB64.length} transactions`} on{" "}
              {snap.pub.network}.
            </p>
            <TxPreview analysis={analysis} host={host} />
            <div className="review-rows">
              <div className="kv">
                <span>Network</span>
                <span>{snap.pub.network}</span>
              </div>
              <div className="kv">
                <span>Account</span>
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Identicon address={snap.pub.connectedSites[request.origin]?.pubkey ?? ""} size={14} />
                  {truncateAddress(snap.pub.connectedSites[request.origin]?.pubkey ?? "?", 6)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="approval-actions">
        <Btn size="lg" variant="outline" onClick={() => void resolve(false)}>
          Reject
        </Btn>
        <Btn size="lg" onClick={() => void resolve(true)}>
          {kind === "connect" ? "Connect" : "Approve"}
        </Btn>
      </div>
    </div>
  );
}

function TxPreview({ analysis, host }: { analysis: TxAnalysis | "loading" | null; host: string }) {
  if (analysis === "loading") {
    return (
      <div className="tx-preview loading">
        <span className="spinner" aria-hidden /> Simulating transaction…
      </div>
    );
  }
  if (!analysis) {
    return (
      <div className="callout warn">
        <IconWarning size={16} />
        Couldn't preview this transaction. Only approve if you trust {host}.
      </div>
    );
  }
  // "Couldn't verify" = the simulation could not compute the balance change
  // (RPC returned no account data, unsupported method, non-mainnet). That is NOT
  // evidence of a drain — it's simply no signal, and must never be shown as a
  // scary alert, or false alarms train users to ignore the real warnings.
  const couldNotVerify = analysis.status === "unknown" || (analysis.status === "ok" && analysis.solDelta == null);
  // Genuine soft signal: simulation SUCCEEDED and showed ~zero SOL change, yet
  // the transaction touches an unverified program and decodes to nothing
  // recognisable — worth a measured heads-up, not a "drain detected" claim.
  const zeroChangeUnknownCode =
    analysis.status === "ok" &&
    analysis.solDelta != null &&
    Math.abs(analysis.solDelta) < 1e-9 &&
    analysis.lines.length === 0 &&
    analysis.hasUnknownPrograms;
  return (
    <div className="tx-preview">
      {analysis.status === "will-fail" && (
        <div className="callout danger">
          <IconWarning size={16} />
          This transaction is expected to fail on-chain — nothing is spent beyond the network fee.
        </div>
      )}
      {analysis.solDelta != null && Math.abs(analysis.solDelta) > 1e-9 && (
        <div className={`tx-delta ${analysis.solDelta < 0 ? "out" : "in"}`}>
          <span>Your balance changes</span>
          <span className="mono">
            {analysis.solDelta < 0 ? "−" : "+"}
            {formatAmount(Math.abs(analysis.solDelta), 6)} SOL
          </span>
        </div>
      )}
      {analysis.lines.length > 0 && (
        <ul className="tx-lines">
          {analysis.lines.map((l, i) => (
            <li key={i} className={`tone-${l.tone}`}>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {analysis.programs.length > 0 && <div className="tx-programs">via {analysis.programs.join(" · ")}</div>}
      {analysis.extraTxCount > 0 && <div className="tx-note">+{analysis.extraTxCount} more transaction(s) in this request</div>}
      {couldNotVerify ? (
        <div className="callout warn">
          <IconWarning size={16} />
          This transaction couldn't be simulated, so its effect can't be verified here. Approve only if you trust {host}.
        </div>
      ) : zeroChangeUnknownCode ? (
        <div className="callout warn">
          <IconWarning size={16} />
          Simulation shows no SOL change, but this interacts with an unverified program. Some contracts hide their real effect — only sign if you expected this from {host}.
        </div>
      ) : null}
    </div>
  );
}

function decodeMessage(b64: string): string {
  try {
    const bytes = bytesFromB64(b64);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/^[\x20-\x7e\s]*$/.test(text)) return text;
    return hex(bytes);
  } catch {
    return hex(bytesFromB64(b64));
  }
}

function hex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
