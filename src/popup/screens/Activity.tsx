import { useCallback, useEffect, useState } from "react";
import { dayLabel, formatTime, truncateAddress } from "../../lib/format";
import { explorerTxUrl, fetchActivity, makeConnection, type ActivityItem } from "../../lib/rpc";
import type { Snapshot } from "../../lib/types";
import { friendlyRpcError } from "../../lib/errors";
import { EmptyState, ErrorState, SkeletonRows, Sheet, Field, Btn } from "../components";
import { IconActivity, IconExternal, IconLink, IconReceive, IconSend, IconPlus, IconCopy } from "../icons";
import { bg } from "../bg";
import { useStore } from "../store";

type State = { status: "loading" } | { status: "ready"; items: ActivityItem[] } | { status: "error"; message: string };

const cache = new Map<string, { at: number; items: ActivityItem[] }>();

export function Activity({ snap }: { snap: Snapshot }) {
  const active = snap.pub.active!;
  const key = `${active.pubkey}|${snap.pub.network}`;
  const cached = cache.get(key);
  const [state, setState] = useState<State>(
    cached && Date.now() - cached.at < 30_000 ? { status: "ready", items: cached.items } : { status: "loading" },
  );
  
  const { toast, refresh } = useStore();
  const [saveContactAddress, setSaveContactAddress] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTx, setSelectedTx] = useState<ActivityItem | null>(null);
  const [showSpam, setShowSpam] = useState(false);

  const load = useCallback(async () => {
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    try {
      const conn = makeConnection(snap.pub.network, snap.pub.customRpcUrl);
      const items = await fetchActivity(conn, active.pubkey, 15);
      cache.set(key, { at: Date.now(), items });
      setState({ status: "ready", items });
    } catch (e) {
      setState({ status: "error", message: friendlyRpcError(e) });
    }
  }, [active.pubkey, snap.pub.network, snap.pub.customRpcUrl, key]);

  useEffect(() => {
    if (!cached || Date.now() - cached.at > 30_000) void load();
  }, [load]);

  if (state.status === "loading") return <div className="pad-screen"><SkeletonRows count={5} /></div>;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={() => void load()} />;
  if (state.items.length === 0) {
    return (
      <EmptyState
        icon={<IconActivity size={22} />}
        title="No activity yet"
        body="Transactions for this account will show up here once you send, receive, or interact with apps."
      />
    );
  }

  const filteredItems = state.items.filter((item) => {
    if (!item.isSpam) return true;
    const isSaved = item.counterparty && (snap.addressBook ?? []).some((e) => e.address.trim().toLowerCase() === item.counterparty!.trim().toLowerCase());
    return isSaved || showSpam;
  });
  
  if (filteredItems.length === 0 && state.items.length > 0) {
    return (
      <EmptyState
        icon={<IconActivity size={22} />}
        title="No recent activity"
        body="Only hidden spam transactions were found."
      />
    );
  }

  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of filteredItems) {
    const label = dayLabel(item.time);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="activity stagger">
      {groups.map((g) => (
        <div key={g.label} className="activity-group">
          <div className="group-label">{g.label}</div>
          {g.items.map((item) => {
            const saved = item.counterparty ? (snap.addressBook ?? []).find((e) => e.address.trim().toLowerCase() === item.counterparty!.trim().toLowerCase()) : null;
            const counterpartyDisplay = saved ? saved.name : (item.counterparty ? truncateAddress(item.counterparty, 4) : "Unknown");
            
            return (
              <button
                key={item.signature}
                className="tx-card"
                onClick={() => setSelectedTx(item)}
              >
                <div className="tx-icon-wrap">
                  <div className={`tx-icon-inner bg-${item.kind}`}>
                    <div className="tx-icon-base" />
                  </div>
                  <div className={`tx-badge tx-badge-${item.kind}`}>
                    {item.kind === "sent" ? <IconSend size={10} /> : item.kind === "received" ? <IconReceive size={10} /> : <IconLink size={10} />}
                  </div>
                </div>
                <div className="tx-content">
                  <div className="tx-title">{item.err ? "Failed — " : ""}{item.label}</div>
                  <div className="tx-subtitle">
                    {item.kind === "sent" ? `To ${counterpartyDisplay}` : item.kind === "received" ? `From ${counterpartyDisplay}` : counterpartyDisplay}
                  </div>
                </div>
                <div className={`tx-amount ${item.delta.startsWith("+") ? "text-success" : ""}`}>{item.delta}</div>
              </button>
            );
          })}
        </div>
      ))}
      
      {state.items.length > filteredItems.length && !showSpam && (
        <button 
          className="chip" 
          style={{ margin: "16px auto", display: "block" }} 
          onClick={() => setShowSpam(true)}
        >
          Show {state.items.length - filteredItems.length} hidden spam transactions
        </button>
      )}
      
      <Sheet open={selectedTx !== null} onClose={() => setSelectedTx(null)} title="">
        {selectedTx && (() => {
            const saved = selectedTx.counterparty ? (snap.addressBook ?? []).find((e) => e.address.trim().toLowerCase() === selectedTx.counterparty!.trim().toLowerCase()) : null;
            const cpDisplay = saved ? saved.name : (selectedTx.counterparty ? truncateAddress(selectedTx.counterparty, 4) : "Unknown");
            
            return (
              <div className="tx-details">
                <div className="tx-details-header">
                  <div className="tx-icon-wrap huge">
                    <div className={`tx-icon-inner bg-${selectedTx.kind}`}>
                      <div className="tx-icon-base" style={{ width: 32, height: 32 }} />
                    </div>
                    <div className={`tx-badge tx-badge-${selectedTx.kind}`}>
                      {selectedTx.kind === "sent" ? <IconSend size={14} /> : selectedTx.kind === "received" ? <IconReceive size={14} /> : <IconLink size={14} />}
                    </div>
                  </div>
                  <div className={`tx-details-amount ${selectedTx.delta.startsWith("+") ? "text-success" : ""}`}>
                    {selectedTx.delta || "0.00 SOL"}
                  </div>
                </div>
                
                <div className="tx-details-table">
                  <div className="tx-dt-row">
                    <span className="tx-dt-label">Date</span>
                    <span className="tx-dt-val">
                      {selectedTx.time 
                        ? new Date(selectedTx.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true }) 
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="tx-dt-row">
                    <span className="tx-dt-label">Status</span>
                    <span className={`tx-dt-val ${selectedTx.err ? "text-danger" : "text-success"}`}>
                      {selectedTx.err ? "Failed" : "Success"}
                    </span>
                  </div>
                  {selectedTx.counterparty && (
                    <div className="tx-dt-row">
                      <span className="tx-dt-label">{selectedTx.kind === "sent" ? "To" : "From"}</span>
                      <div className="tx-dt-val copyable-val">
                        <button 
                          className="copy-btn" 
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTx.counterparty!);
                            toast("Copied", "success");
                          }}
                        >
                          {cpDisplay} <IconCopy size={12} style={{marginLeft: 4, color: "var(--muted)"}} />
                        </button>
                        {!saved && (
                           <button className="icon-btn save-btn" onClick={() => {
                              setSelectedTx(null);
                              setContactName("");
                              setSaveContactAddress(selectedTx.counterparty!);
                           }} title="Save Contact">
                              <IconPlus size={12} />
                           </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="tx-dt-row">
                    <span className="tx-dt-label">Network</span>
                    <span className="tx-dt-val">Solana</span>
                  </div>
                  {selectedTx.fee !== undefined && (
                    <div className="tx-dt-row">
                      <span className="tx-dt-label">Network Fee</span>
                      <span className="tx-dt-val">-{selectedTx.fee.toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL</span>
                    </div>
                  )}
                  <a href={explorerTxUrl(selectedTx.signature, snap.pub.network)} target="_blank" rel="noreferrer" className="tx-dt-link">
                    View on Solscan <IconExternal size={14} style={{marginLeft: 4}} />
                  </a>
                </div>
                
                <Btn size="lg" variant="outline" onClick={() => setSelectedTx(null)} style={{ marginTop: 24 }}>
                  Close
                </Btn>
              </div>
            );
        })()}
      </Sheet>

      <Sheet open={saveContactAddress !== null} onClose={() => setSaveContactAddress(null)} title="Save Recipient">
        <div className="save-contact-form" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Address" className="mono-input" value={saveContactAddress || ""} readOnly />
          <Field
            label="Name"
            placeholder="e.g. Alice"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            autoFocus
          />
          <Btn
            size="lg"
            disabled={!contactName.trim() || isSaving}
            loading={isSaving}
            onClick={async () => {
              if (!saveContactAddress) return;
              setIsSaving(true);
              try {
                await bg({ type: "addAddress", address: saveContactAddress, name: contactName.trim() });
                await refresh();
                toast("Contact saved", "success");
                setSaveContactAddress(null);
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), "error");
              } finally {
                setIsSaving(false);
              }
            }}
          >
            Save
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
