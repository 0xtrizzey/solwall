import { useCallback, useEffect, useState } from "react";
import { dayLabel, formatTime } from "../../lib/format";
import { explorerTxUrl, fetchActivity, makeConnection, type ActivityItem } from "../../lib/rpc";
import type { Snapshot } from "../../lib/types";
import { friendlyRpcError } from "../../lib/errors";
import { EmptyState, ErrorState, SkeletonRows } from "../components";
import { IconActivity, IconExternal, IconLink, IconReceive, IconSend } from "../icons";

type State = { status: "loading" } | { status: "ready"; items: ActivityItem[] } | { status: "error"; message: string };

const cache = new Map<string, { at: number; items: ActivityItem[] }>();

export function Activity({ snap }: { snap: Snapshot }) {
  const active = snap.pub.active!;
  const key = `${active.pubkey}|${snap.pub.network}`;
  const cached = cache.get(key);
  const [state, setState] = useState<State>(
    cached && Date.now() - cached.at < 30_000 ? { status: "ready", items: cached.items } : { status: "loading" },
  );

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
                <div className="row-title">
                  {item.err ? "Failed — " : ""}
                  {item.label}
                </div>
                <div className="row-sub">{formatTime(item.time)}</div>
              </div>
              <div className={`act-delta mono ${item.delta.startsWith("+") ? "text-success" : ""}`}>{item.delta}</div>
              <IconExternal size={13} className="act-ext" />
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
