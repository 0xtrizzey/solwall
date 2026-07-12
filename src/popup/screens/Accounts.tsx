import { useState } from "react";
import { isValidMnemonic, newMnemonic, type SchemeId } from "../../lib/keyring";
import { truncateAddress } from "../../lib/format";
import type { Snapshot, WalletMeta } from "../../lib/types";
import { bg } from "../bg";
import { Btn, Field, Sheet } from "../components";
import { IconCheck, IconChevronD, IconCopy, IconEye, IconKey, IconPlus, IconSeed, IconTrash, IconWarning } from "../icons";
import { useCopy, useStore } from "../store";
import { SubHeader } from "./Send";

type SheetState =
  | { id: "none" }
  | { id: "add" }
  | { id: "add-new-phrase"; mnemonic: string }
  | { id: "import-phrase" }
  | { id: "import-key" }
  | { id: "rename-account"; walletId: string; pubkey: string; current: string }
  | { id: "rename-wallet"; walletId: string; current: string }
  | { id: "reveal-phrase"; walletId: string }
  | { id: "reveal-key"; walletId: string; pubkey: string }
  | { id: "remove-wallet"; walletId: string; name: string };

export function Accounts({ snap, nav }: { snap: Snapshot; nav: (r: string) => void }) {
  const { refresh, toast } = useStore();
  const copy = useCopy();
  const [sheet, setSheet] = useState<SheetState>({ id: "none" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const active = snap.pub.active;

  const act = async (key: string, fn: () => Promise<unknown>, successMsg?: string) => {
    setBusyKey(key);
    try {
      await fn();
      await refresh();
      if (successMsg) toast(successMsg, "success");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="screen subscreen">
      <SubHeader
        title="Wallets & accounts"
        onBack={() => nav("/")}
        right={
          <button className="icon-btn" aria-label="Add wallet" onClick={() => setSheet({ id: "add" })}>
            <IconPlus size={18} />
          </button>
        }
      />
      <div className="accounts-list">
        {snap.pub.wallets.map((w) => (
          <WalletGroup
            key={w.id}
            wallet={w}
            activePubkey={active?.pubkey}
            busyKey={busyKey}
            onSelect={(pubkey) => void act(`sel-${pubkey}`, () => bg({ type: "setActive", walletId: w.id, pubkey }))}
            onAddAccount={() => void act(`addacc-${w.id}`, () => bg({ type: "addAccount", walletId: w.id }), "Account added")}
            onMenu={setSheet}
            copy={copy}
          />
        ))}
      </div>

      {/* ---- add wallet ---- */}
      <Sheet open={sheet.id === "add"} onClose={() => setSheet({ id: "none" })} title="Add a wallet">
        <div className="menu-list">
          <button className="menu-row" onClick={() => setSheet({ id: "add-new-phrase", mnemonic: newMnemonic(12) })}>
            <IconPlus size={18} />
            <div>
              <div className="row-title">Create new wallet</div>
              <div className="row-sub">Fresh recovery phrase</div>
            </div>
          </button>
          <button className="menu-row" onClick={() => setSheet({ id: "import-phrase" })}>
            <IconSeed size={18} />
            <div>
              <div className="row-title">Import recovery phrase</div>
              <div className="row-sub">12 or 24 words</div>
            </div>
          </button>
          <button className="menu-row" onClick={() => setSheet({ id: "import-key" })}>
            <IconKey size={18} />
            <div>
              <div className="row-title">Import private key</div>
              <div className="row-sub">Single account</div>
            </div>
          </button>
        </div>
      </Sheet>

      {sheet.id === "add-new-phrase" && (
        <NewPhraseSheet
          mnemonic={sheet.mnemonic}
          onClose={() => setSheet({ id: "none" })}
          onConfirm={async () => {
            const okDone = await act(
              "add-new",
              () => bg({ type: "addMnemonicWallet", mnemonic: sheet.mnemonic, name: `Wallet ${snap.pub.wallets.length + 1}` }),
              "Wallet created",
            );
            if (okDone) setSheet({ id: "none" });
          }}
          busy={busyKey === "add-new"}
        />
      )}

      {sheet.id === "import-phrase" && (
        <ImportPhraseSheet
          onClose={() => setSheet({ id: "none" })}
          busy={busyKey === "import-phrase"}
          onImport={async (mnemonic, scheme) => {
            const okDone = await act(
              "import-phrase",
              () => bg({ type: "addMnemonicWallet", mnemonic, name: `Wallet ${snap.pub.wallets.length + 1}`, scheme }),
              "Wallet imported",
            );
            if (okDone) setSheet({ id: "none" });
          }}
        />
      )}

      {sheet.id === "import-key" && (
        <ImportKeySheet
          onClose={() => setSheet({ id: "none" })}
          busy={busyKey === "import-key"}
          onImport={async (secretKey) => {
            const okDone = await act(
              "import-key",
              () => bg({ type: "importPrivateKey", secretKey, name: `Imported ${snap.pub.wallets.filter((w) => w.type === "privateKey").length + 1}` }),
              "Account imported",
            );
            if (okDone) setSheet({ id: "none" });
          }}
        />
      )}

      {/* ---- rename ---- */}
      {(sheet.id === "rename-account" || sheet.id === "rename-wallet") && (
        <RenameSheet
          current={sheet.current}
          label={sheet.id === "rename-account" ? "Account name" : "Wallet name"}
          onClose={() => setSheet({ id: "none" })}
          onSave={async (name) => {
            const okDone = await act(
              "rename",
              () =>
                sheet.id === "rename-account"
                  ? bg({ type: "renameAccount", walletId: sheet.walletId, pubkey: sheet.pubkey, name })
                  : bg({ type: "renameWallet", walletId: sheet.walletId, name }),
              "Renamed",
            );
            if (okDone) setSheet({ id: "none" });
          }}
          busy={busyKey === "rename"}
        />
      )}

      {/* ---- reveal secrets (password gated) ---- */}
      {(sheet.id === "reveal-phrase" || sheet.id === "reveal-key") && (
        <RevealSheet
          kind={sheet.id === "reveal-phrase" ? "phrase" : "key"}
          fetchSecret={async (password) => {
            if (sheet.id === "reveal-phrase") {
              const r = await bg<{ mnemonic: string }>({ type: "revealMnemonic", walletId: sheet.walletId, password });
              return r.mnemonic;
            }
            const r = await bg<{ secretKey: string }>({ type: "revealPrivateKey", walletId: sheet.walletId, pubkey: sheet.pubkey, password });
            return r.secretKey;
          }}
          onClose={() => setSheet({ id: "none" })}
        />
      )}

      {/* ---- remove wallet ---- */}
      {sheet.id === "remove-wallet" && (
        <RemoveWalletSheet
          name={sheet.name}
          busy={busyKey === "remove"}
          onClose={() => setSheet({ id: "none" })}
          onRemove={async (password) => {
            const okDone = await act("remove", () => bg({ type: "removeWallet", walletId: sheet.walletId, password }), "Wallet removed");
            if (okDone) setSheet({ id: "none" });
          }}
        />
      )}
    </div>
  );
}

function WalletGroup({
  wallet,
  activePubkey,
  busyKey,
  onSelect,
  onAddAccount,
  onMenu,
  copy,
}: {
  wallet: WalletMeta;
  activePubkey?: string;
  busyKey: string | null;
  onSelect: (pubkey: string) => void;
  onAddAccount: () => void;
  onMenu: (s: SheetState) => void;
  copy: (text: string, label?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="wallet-group">
      <div className="wallet-head">
        <button className="wallet-head-main" onClick={() => setOpen(!open)}>
          <IconChevronD size={14} className={`disclosure ${open ? "open" : ""}`} />
          <span className="wallet-name">{wallet.name}</span>
          <span className="wallet-kind">{wallet.type === "mnemonic" ? "Seed phrase" : "Private key"}</span>
        </button>
        <div className="wallet-head-actions">
          {wallet.type === "mnemonic" && (
            <button className="mini-btn" onClick={() => onMenu({ id: "reveal-phrase", walletId: wallet.id })} title="Show recovery phrase">
              <IconSeed size={14} />
            </button>
          )}
          <button className="mini-btn" onClick={() => onMenu({ id: "rename-wallet", walletId: wallet.id, current: wallet.name })} title="Rename wallet">
            ✎
          </button>
          <button className="mini-btn danger" onClick={() => onMenu({ id: "remove-wallet", walletId: wallet.id, name: wallet.name })} title="Remove wallet">
            <IconTrash size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="account-rows">
          {wallet.accounts.map((a) => {
            const isActive = a.pubkey === activePubkey;
            return (
              <div key={a.pubkey} className={`account-row ${isActive ? "active" : ""}`}>
                <button className="account-main" onClick={() => onSelect(a.pubkey)}>
                  <div className={`account-dot ${isActive ? "on" : ""}`}>{isActive && <IconCheck size={12} />}</div>
                  <div>
                    <div className="row-title">{a.name}</div>
                    <div className="row-sub mono">{truncateAddress(a.pubkey, 6)}</div>
                  </div>
                </button>
                <div className="account-actions">
                  <button className="mini-btn" onClick={() => void copy(a.pubkey, "Address copied")} title="Copy address">
                    <IconCopy size={13} />
                  </button>
                  <button
                    className="mini-btn"
                    onClick={() => onMenu({ id: "reveal-key", walletId: wallet.id, pubkey: a.pubkey })}
                    title="Show private key"
                  >
                    <IconKey size={13} />
                  </button>
                  <button
                    className="mini-btn"
                    onClick={() => onMenu({ id: "rename-account", walletId: wallet.id, pubkey: a.pubkey, current: a.name })}
                    title="Rename account"
                  >
                    ✎
                  </button>
                </div>
              </div>
            );
          })}
          {wallet.type === "mnemonic" && (
            <button className="add-account" onClick={onAddAccount} disabled={busyKey === `addacc-${wallet.id}`}>
              <IconPlus size={14} /> Add account
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewPhraseSheet({ mnemonic, onClose, onConfirm, busy }: { mnemonic: string; onClose: () => void; onConfirm: () => void; busy: boolean }) {
  const [saved, setSaved] = useState(false);
  const copy = useCopy();
  return (
    <Sheet open onClose={onClose} title="New recovery phrase">
      <div className="phrase-grid small">
        {mnemonic.split(" ").map((w, i) => (
          <div key={i} className="phrase-word">
            <span className="phrase-idx">{i + 1}</span>
            <span className="mono">{w}</span>
          </div>
        ))}
      </div>
      <button className="link-btn" onClick={() => void copy(mnemonic, "Phrase copied")}>
        <IconCopy size={14} /> Copy
      </button>
      <label className="checkline">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I saved this phrase somewhere safe
      </label>
      <Btn size="lg" disabled={!saved} loading={busy} onClick={onConfirm}>
        Create wallet
      </Btn>
    </Sheet>
  );
}

function ImportPhraseSheet({ onClose, onImport, busy }: { onClose: () => void; onImport: (m: string, scheme?: SchemeId) => void; busy: boolean }) {
  const [phrase, setPhrase] = useState("");
  const [scheme, setScheme] = useState<string>("");
  const valid = isValidMnemonic(phrase);
  return (
    <Sheet open onClose={onClose} title="Import recovery phrase">
      <div className="field">
        <label htmlFor="acc-imp-phrase">Recovery phrase</label>
        <textarea
          id="acc-imp-phrase"
          className="phrase-input mono"
          rows={3}
          placeholder="12 or 24 words separated by spaces"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {phrase.trim() !== "" && !valid && <div className="field-msg error">Not a valid phrase yet.</div>}
      </div>
      <div className="field">
        <label htmlFor="acc-imp-scheme">Wallet type</label>
        <select id="acc-imp-scheme" className="select" value={scheme} onChange={(e) => setScheme(e.target.value)}>
          <option value="">Auto-detect (recommended)</option>
          <option value="bip44-change">Phantom · Solflare · Backpack</option>
          <option value="bip44">Ledger</option>
          <option value="bip44-root">Legacy / raw seed</option>
        </select>
      </div>
      <Btn size="lg" disabled={!valid} loading={busy} onClick={() => onImport(phrase, (scheme || undefined) as SchemeId | undefined)}>
        Import
      </Btn>
    </Sheet>
  );
}

function ImportKeySheet({ onClose, onImport, busy }: { onClose: () => void; onImport: (k: string) => void; busy: boolean }) {
  const [key, setKey] = useState("");
  return (
    <Sheet open onClose={onClose} title="Import private key">
      <Field
        label="Private key"
        className="mono-input"
        placeholder="base58 key or JSON byte array"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <Btn size="lg" disabled={key.trim().length < 32} loading={busy} onClick={() => onImport(key.trim())}>
        Import
      </Btn>
    </Sheet>
  );
}

function RenameSheet({ current, label, onClose, onSave, busy }: { current: string; label: string; onClose: () => void; onSave: (name: string) => void; busy: boolean }) {
  const [name, setName] = useState(current);
  return (
    <Sheet open onClose={onClose} title="Rename">
      <Field label={label} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={32} />
      <Btn size="lg" disabled={!name.trim()} loading={busy} onClick={() => onSave(name)}>
        Save
      </Btn>
    </Sheet>
  );
}

function RevealSheet({ kind, fetchSecret, onClose }: { kind: "phrase" | "key"; fetchSecret: (password: string) => Promise<string>; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = useCopy();

  return (
    <Sheet open onClose={onClose} title={kind === "phrase" ? "Recovery phrase" : "Private key"}>
      {secret == null ? (
        <>
          <div className="callout warn">
            <IconWarning size={16} />
            Never share this with anyone. Anyone who has it controls the funds.
          </div>
          <Field
            label="Wallet password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={error}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && pw && void reveal()}
          />
          <Btn size="lg" loading={busy} disabled={!pw} onClick={() => void reveal()}>
            <IconEye size={16} /> Reveal
          </Btn>
        </>
      ) : (
        <>
          <div className={`secret-box mono ${kind === "key" ? "wrap-any" : ""}`}>{secret}</div>
          <Btn size="lg" variant="outline" onClick={() => void copy(secret, "Copied — clear your clipboard after")}>
            <IconCopy size={16} /> Copy
          </Btn>
        </>
      )}
    </Sheet>
  );

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      setSecret(await fetchSecret(pw));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
}

function RemoveWalletSheet({ name, busy, onClose, onRemove }: { name: string; busy: boolean; onClose: () => void; onRemove: (password: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <Sheet open onClose={onClose} title={`Remove "${name}"`}>
      <div className="callout warn">
        <IconWarning size={16} />
        This removes the wallet from this device only. Without its recovery phrase or private key you will lose access to its
        funds permanently.
      </div>
      <Field label="Wallet password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      <Btn size="lg" variant="danger" disabled={!pw} loading={busy} onClick={() => onRemove(pw)}>
        Remove wallet
      </Btn>
    </Sheet>
  );
}
