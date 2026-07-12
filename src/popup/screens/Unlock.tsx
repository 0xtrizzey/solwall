import { useState } from "react";
import type { Snapshot } from "../../lib/types";
import { bg } from "../bg";
import { Btn, Field, Sheet } from "../components";
import { Logo } from "../icons";
import { useStore } from "../store";

export function Unlock() {
  const { refresh } = useStore();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");

  const unlock = async () => {
    if (!pw) return;
    setBusy(true);
    setError(null);
    try {
      await bg<Snapshot>({ type: "unlock", password: pw });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setBusy(false);
    }
  };

  return (
    <div className="screen unlock">
      <div className="solar-field" aria-hidden />
      <div className="unlock-hero">
        <Logo size={56} />
        <h1 className="wordmark">SOLWALL</h1>
      </div>
      <div className={`unlock-form ${shake ? "shake" : ""}`}>
        <Field
          label="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void unlock()}
          error={error}
          autoFocus
        />
        <Btn size="lg" loading={busy} onClick={() => void unlock()} disabled={!pw}>
          Unlock
        </Btn>
        <button className="link-btn center" onClick={() => setResetOpen(true)}>
          Forgot password?
        </button>
      </div>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Reset SOLWALL">
        <p className="sheet-text">
          Your password can't be recovered. You can erase this wallet from the device and restore it with your{" "}
          <strong>recovery phrase</strong>. Funds are safe on-chain — but without the phrase they are gone.
        </p>
        <Field
          label={`Type "RESET" to confirm`}
          value={resetText}
          onChange={(e) => setResetText(e.target.value)}
          placeholder="RESET"
          autoComplete="off"
        />
        <Btn
          variant="danger"
          size="lg"
          disabled={resetText !== "RESET"}
          onClick={async () => {
            await bg({ type: "resetWallet" });
            location.hash = "/";
            await refresh();
          }}
        >
          Erase and start over
        </Btn>
      </Sheet>
    </div>
  );
}
