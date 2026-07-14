import { useState } from "react";
import { FIAT_CURRENCIES } from "../../lib/prices";
import { truncateAddress } from "../../lib/format";
import { NETWORKS, type NetworkId, type Snapshot } from "../../lib/types";
import { bg } from "../bg";
import { Btn, Divider, Field, Row, Sheet } from "../components";
import { IconCheck, IconChevronR, IconCopy, IconGlobe, IconKey, IconLink, IconLock, IconShield, IconTrash, IconWallet, IconWarning } from "../icons";
import { useStore } from "../store";
import { QrCode } from "../qr";

type SheetId = "none" | "networks" | "security" | "sites" | "reset" | "fiat" | "password" | "addressbook" | "donate";

export function Settings({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const { refresh, toast } = useStore();
  const [sheet, setSheet] = useState<SheetId>("none");

  const lock = async () => {
    await bg({ type: "lock" });
    await refresh();
  };

  const copy = async (text: string, msg: string) => {
    await navigator.clipboard.writeText(text);
    toast(msg, "success");
  };

  const sites = Object.entries(snap.connectedSites ?? {});

  return (
    <div className="settings">
      <div className="settings-list">
        <Row
          left={<IconWallet size={18} />}
          title="Wallets & accounts"
          sub={(() => {
            const w = snap.pub.wallets.length;
            const a = snap.pub.wallets.reduce((n, x) => n + x.accounts.length, 0);
            return `${w} wallet${w === 1 ? "" : "s"}, ${a} account${a === 1 ? "" : "s"}`;
          })()}
          right={<IconChevronR size={16} />}
          onClick={() => nav("/accounts")}
        />
        <Row
          left={<IconGlobe size={18} />}
          title="Network"
          sub={snap.pub.network === "custom" ? snap.pub.customRpcUrl || "Custom RPC" : NETWORKS[snap.pub.network as Exclude<NetworkId, "custom">].label}
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("networks")}
        />
        <Row
          left={<IconGlobe size={18} />}
          title="Currency"
          sub={snap.pub.fiat || "USD"}
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("fiat")}
        />
        <Row
          left={<IconWallet size={18} />}
          title="Address book"
          sub={(snap.addressBook ?? []).length === 0 ? "No saved addresses" : `${(snap.addressBook ?? []).length} saved`}
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("addressbook")}
        />
        <Row
          left={<IconShield size={18} />}
          title="Security"
          sub={`Auto-lock: ${snap.pub.autoLockMinutes === 0 ? "never" : `${snap.pub.autoLockMinutes} min`}`}
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("security")}
        />
        <Row
          left={<IconKey size={18} />}
          title="Change password"
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("password")}
        />
        <Row
          left={<IconLink size={18} />}
          title="Connected apps"
          sub={sites.length === 0 ? "None" : `${sites.length} site${sites.length === 1 ? "" : "s"}`}
          right={<IconChevronR size={16} />}
          onClick={() => setSheet("sites")}
        />
        <Divider />
        <Row left={<IconLock size={18} />} title="Lock wallet" onClick={() => void lock()} />
        <Row left={<IconTrash size={18} />} title="Reset SOLWALL" sub="Erase this device" danger onClick={() => setSheet("reset")} />
      </div>
      <div className="about">
        SOLWALL v1.0.0 · non-custodial · keys never leave this device
        <div style={{ marginTop: "12px" }}>
          <button className="text-link" onClick={() => setSheet("donate")}>❤️ Donate to support the project</button>
        </div>
      </div>

      {/* networks */}
      <Sheet open={sheet === "networks"} onClose={() => setSheet("none")} title="Network">
        <NetworkSheet snap={snap} onDone={() => setSheet("none")} />
      </Sheet>

      {/* security */}
      <Sheet open={sheet === "security"} onClose={() => setSheet("none")} title="Security">
        <div className="field">
          <label>Auto-lock after</label>
          <div className="chip-row">
            {[5, 15, 60, 240, 0].map((m) => (
              <button
                key={m}
                className={`chip ${snap.pub.autoLockMinutes === m ? "chip-right" : ""}`}
                onClick={async () => {
                  await bg({ type: "setAutoLock", minutes: m });
                  await refresh();
                  toast("Auto-lock updated", "success");
                }}
              >
                {m === 0 ? "Never" : m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
        </div>
        <p className="sheet-text" style={{ marginTop: "1rem" }}>
          Your vault is encrypted with your password (AES-256-GCM, 1.2M-round PBKDF2). Recovery phrases and private keys can be
          revealed per wallet from <strong>Wallets &amp; accounts</strong> — password required every time.
        </p>
        <Divider />
        <div className="field" style={{ marginTop: "8px" }}>
          <label>Paranoia Mode (Block NFTs)</label>
          <p className="sheet-text" style={{ margin: "4px 0 12px 0" }}>If enabled, NFTs will not be loaded under any circumstances to ensure 100% network isolation.</p>
          <div className="seg">
            <button
              className={!snap.pub.hideNfts ? "on" : ""}
              onClick={async () => {
                await bg({ type: "setHideNfts", hidden: false });
                await refresh();
              }}
            >
              Off (Safe defaults)
            </button>
            <button
              className={snap.pub.hideNfts ? "on" : ""}
              onClick={async () => {
                await bg({ type: "setHideNfts", hidden: true });
                await refresh();
                toast("NFTs hidden", "success");
              }}
            >
              On (Block all)
            </button>
          </div>
        </div>
      </Sheet>

      {/* connected sites */}
      <Sheet open={sheet === "sites"} onClose={() => setSheet("none")} title="Connected apps">
        {sites.length === 0 ? (
          <p className="sheet-text">No apps are connected. When you approve a dApp connection, it will show up here.</p>
        ) : (
          <div className="menu-list">
            {sites.map(([origin, site]) => (
              <div key={origin} className="site-row">
                <div className="row-mid">
                  <div className="row-title">{origin.replace(/^https?:\/\//, "")}</div>
                  <div className="row-sub mono">{site.pubkey.slice(0, 8)}…</div>
                </div>
                <Btn
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await bg({ type: "revokeSite", origin });
                    await refresh();
                    toast("Disconnected", "success");
                  }}
                >
                  Revoke
                </Btn>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* currency */}
      <Sheet open={sheet === "fiat"} onClose={() => setSheet("none")} title="Display currency">
        <p className="sheet-text">Your assets are valued in this currency across the wallet.</p>
        <div className="chip-row">
          {FIAT_CURRENCIES.map((cur) => (
            <button
              key={cur}
              className={`chip ${(snap.pub.fiat || "USD") === cur ? "chip-right" : ""}`}
              onClick={async () => {
                await bg({ type: "setFiat", fiat: cur });
                await refresh();
                setSheet("none");
              }}
            >
              {cur}
            </button>
          ))}
        </div>
      </Sheet>

      {/* change password */}
      <Sheet open={sheet === "password"} onClose={() => setSheet("none")} title="Change password">
        <ChangePasswordSheet onDone={() => setSheet("none")} />
      </Sheet>

      {/* address book */}
      <Sheet open={sheet === "addressbook"} onClose={() => setSheet("none")} title="Address book">
        <AddressBookSheet snap={snap} />
      </Sheet>

      {/* reset */}
      <Sheet open={sheet === "reset"} onClose={() => setSheet("none")} title="Reset SOLWALL">
        <ResetSheet onDone={() => void refresh()} />
      </Sheet>

      {/* donate */}
      <Sheet open={sheet === "donate"} onClose={() => setSheet("none")} title="Support SOLWALL">
        <p className="sheet-text" style={{ marginBottom: "24px", textAlign: "center" }}>
          If you find this project useful, consider supporting its development with a donation. Thank you! ❤️
        </p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div className="receive-card" style={{ padding: "16px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "var(--text)", textAlign: "center" }}>Solana (SOL)</h3>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <QrCode value="gAJ9YBNnNrevtKDi2aFw2WiPWR93KhftCvJWV2Q8qEQ" />
            </div>
            <div className="mono" style={{ fontSize: "11px", wordBreak: "break-all", textAlign: "center", color: "var(--muted)", marginBottom: "16px" }}>
              gAJ9YBNnNrevtKDi2aFw2WiPWR93KhftCvJWV2Q8qEQ
            </div>
            <Btn size="md" variant="outline" onClick={() => void copy("gAJ9YBNnNrevtKDi2aFw2WiPWR93KhftCvJWV2Q8qEQ", "SOL Address copied")} style={{ width: "100%" }}>
              <IconCopy size={14} /> Copy SOL Address
            </Btn>
          </div>

          <div className="receive-card" style={{ padding: "16px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "var(--text)", textAlign: "center" }}>Monero (XMR)</h3>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <QrCode value="88YUhLmDGqgJbFBHVaSsywVZ6B5HBHUKuhx2tvx8iQWyLJ3EgtRXkxCjVV8M5t64akf6HAGUzhuCGBgtBqDjQwMjM4FFPon" />
            </div>
            <div className="mono" style={{ fontSize: "11px", wordBreak: "break-all", textAlign: "center", color: "var(--muted)", marginBottom: "16px" }}>
              88YUhLmDGqgJbFBHVaSsywVZ6B5HBHUKuhx2tvx8iQWyLJ3EgtRXkxCjVV8M5t64akf6HAGUzhuCGBgtBqDjQwMjM4FFPon
            </div>
            <Btn size="md" variant="outline" onClick={() => void copy("88YUhLmDGqgJbFBHVaSsywVZ6B5HBHUKuhx2tvx8iQWyLJ3EgtRXkxCjVV8M5t64akf6HAGUzhuCGBgtBqDjQwMjM4FFPon", "XMR Address copied")} style={{ width: "100%" }}>
              <IconCopy size={14} /> Copy XMR Address
            </Btn>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function ChangePasswordSheet({ onDone }: { onDone: () => void }) {
  const { refresh, toast } = useStore();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (newPw.length < 8) return setError("New password must be at least 8 characters.");
    if (newPw !== confirm) return setError("New passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await bg({ type: "changePassword", oldPassword: oldPw, newPassword: newPw });
      await refresh();
      toast("Password changed", "success");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="Current password" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus />
      <Field label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} hint="At least 8 characters" />
      <Field label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} />
      <Btn size="lg" loading={busy} disabled={!oldPw || !newPw} onClick={() => void submit()}>
        Change password
      </Btn>
    </>
  );
}

function AddressBookSheet({ snap }: { snap: Snapshot }) {
  const { refresh, toast } = useStore();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");

  const add = async () => {
    try {
      await bg({ type: "addAddress", address: address.trim(), name: name.trim() });
      await refresh();
      setAddress("");
      setName("");
      toast("Saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      {(snap.addressBook ?? []).length > 0 && (
        <div className="addr-list" style={{ marginBottom: 12 }}>
          {(snap.addressBook ?? []).map((e) => (
            <div key={e.address} className="site-row">
              <div className="row-mid">
                <div className="row-title">{e.name}</div>
                <div className="row-sub mono">{truncateAddress(e.address, 6)}</div>
              </div>
              <Btn
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await bg({ type: "removeAddress", address: e.address });
                  await refresh();
                }}
              >
                <IconTrash size={15} />
              </Btn>
            </div>
          ))}
        </div>
      )}
      <Field label="Label" placeholder="e.g. My Ledger" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
      <Field label="Address" className="mono-input" placeholder="Solana address" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} autoComplete="off" />
      <Btn size="lg" disabled={address.trim().length < 32} onClick={() => void add()}>
        Save address
      </Btn>
    </>
  );
}

function NetworkSheet({ snap, onDone }: { snap: Snapshot; onDone: () => void }) {
  const { refresh, toast } = useStore();
  const [customUrl, setCustomUrl] = useState(snap.pub.customRpcUrl);

  const pick = async (network: NetworkId, customRpcUrl?: string) => {
    await bg({ type: "setNetwork", network, customRpcUrl });
    await refresh();
    toast(`Switched to ${network}`, "success");
    onDone();
  };

  return (
    <div className="menu-list">
      {(Object.keys(NETWORKS) as Exclude<NetworkId, "custom">[]).map((id) => (
        <button key={id} className="menu-row" onClick={() => void pick(id)}>
          <IconGlobe size={16} />
          <div>
            <div className="row-title">{NETWORKS[id].label}</div>
            <div className="row-sub mono">{NETWORKS[id].rpcUrl.replace("https://", "")}</div>
          </div>
          {snap.pub.network === id && <IconCheck size={16} />}
        </button>
      ))}
      <div className="custom-rpc">
        <Field
          label="Custom RPC URL"
          className="mono-input"
          placeholder="https://your-rpc.example.com"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          spellCheck={false}
        />
        <Btn size="md" variant="outline" disabled={!/^https?:\/\/.+/.test(customUrl)} onClick={() => void pick("custom", customUrl)}>
          Use custom{snap.pub.network === "custom" ? " (active)" : ""}
        </Btn>
      </div>
    </div>
  );
}

function ResetSheet({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  return (
    <>
      <div className="callout warn">
        <IconWarning size={16} />
        Erases every wallet, account, and setting from this device. Funds stay on-chain — you can only get them back with each
        wallet's recovery phrase or private key.
      </div>
      <Field label={`Type "RESET" to confirm`} value={text} onChange={(e) => setText(e.target.value)} placeholder="RESET" autoComplete="off" />
      <Btn
        variant="danger"
        size="lg"
        disabled={text !== "RESET"}
        onClick={async () => {
          await bg({ type: "resetWallet" });
          location.hash = "/";
          onDone();
        }}
      >
        Erase everything
      </Btn>
    </>
  );
}
