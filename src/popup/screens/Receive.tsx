import type { Snapshot } from "../../lib/types";
import { Btn } from "../components";
import { IconCopy } from "../icons";
import { QrCode } from "../qr";
import { useCopy } from "../store";
import { SubHeader } from "./Send";

export function Receive({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const copy = useCopy();
  const active = snap.pub.active!;
  const wallet = snap.pub.wallets.find((w) => w.id === active.walletId);
  const account = wallet?.accounts.find((a) => a.pubkey === active.pubkey);

  return (
    <div className="screen subscreen">
      <SubHeader title="Receive" onBack={() => nav("/")} />
      <div className="receive">
        <div className="receive-card">
          <QrCode value={active.pubkey} />
          <div className="receive-name">{account?.name ?? "Account"}</div>
          <div className="receive-addr mono">{active.pubkey}</div>
        </div>
        <Btn size="lg" onClick={() => void copy(active.pubkey, "Address copied")}>
          <IconCopy size={16} /> Copy address
        </Btn>
        <p className="fine-print center">
          Send only Solana (SOL) and SPL tokens to this address.
          {snap.pub.network !== "mainnet-beta" && ` You're on ${snap.pub.network}.`}
        </p>
      </div>
    </div>
  );
}
