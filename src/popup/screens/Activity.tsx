import { useCallback, useEffect, useState } from "react";
import { dayLabel, formatTime, truncateAddress } from "../../lib/format";
import { explorerTxUrl, fetchActivity, makeConnection, type ActivityItem } from "../../lib/rpc";
import type { Snapshot } from "../../lib/types";
import { friendlyRpcError } from "../../lib/errors";
import { EmptyState, ErrorState, SkeletonRows, Sheet, Field, Btn } from "../components";
import { IconActivity, IconExternal, IconLink, IconReceive, IconSend, IconPlus } from "../icons";
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

  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of state.items) {
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
          {g.items.map((item) => (
            <a
              key={item.signature}
              className="activity-row"
              href={explorerTxUrl(item.signature, snap.pub.network)}
              target="_blank"
              rel="noreferrer"
            >
              <div className={`act-icon act-${item.err ? "err" : item.kind}`}>
                {item.kind === "sent" ? <IconSend size={16} /> : item.kind === "received" ? <IconReceive size={16} /> : <IconLink size={16} />}
              </div>
              <div className="row-mid">
                <div className="row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {item.err ? "Failed — " : ""}
                  {item.label}
                  {item.unverified && <span className="unverified-badge" title="Unverified token">Unverified</span>}
                </div>
                <div className="row-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {formatTime(item.time)}
                  {item.counterparty && (
                    <>
                      <span>•</span>
                      {(() => {
                        const saved = (snap.addressBook ?? []).find((e) => e.address === item.counterparty);
                        if (saved) return <span className="mono">{saved.name}</span>;
                        return (
                          <span className="mono" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {truncateAddress(item.counterparty, 4)}
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                setContactName("");
                                setSaveContactAddress(item.counterparty!);
                              }}
                              title="Save contact"
                              style={{ width: 14, height: 14, background: "rgba(255,255,255,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              <IconPlus size={10} />
                            </button>
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
              <div className={`act-delta mono ${item.delta.startsWith("+") ? "text-success" : ""}`}>{item.delta}</div>
              <IconExternal size={13} className="act-ext" />
            </a>
          ))}
        </div>
      ))}
      
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
            disabled={!contactName.trim()}
            onClick={async () => {
              if (!saveContactAddress) return;
              await bg({ type: "addAddress", address: saveContactAddress, name: contactName.trim() });
              await refresh();
              toast("Contact saved", "success");
              setSaveContactAddress(null);
            }}
          >
            Save Contact
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
