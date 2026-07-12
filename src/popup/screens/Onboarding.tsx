import { useMemo, useState } from "react";
import { isValidMnemonic, newMnemonic, type SchemeId } from "../../lib/keyring";
import type { Snapshot } from "../../lib/types";
import { bg } from "../bg";
import { Btn, Field } from "../components";
import { IconBack, IconCheck, IconCopy, IconEye, IconKey, IconSeed, IconWarning, Logo } from "../icons";
import { useCopy, useStore } from "../store";

type Step =
  | { id: "welcome" }
  | { id: "create-phrase"; mnemonic: string }
  | { id: "confirm-phrase"; mnemonic: string }
  | { id: "import" }
  | { id: "password"; secret: { mnemonic?: string; secretKey?: string; scheme?: SchemeId } };

export function Onboarding() {
  const [step, setStep] = useState<Step>({ id: "welcome" });

  return (
    <div className="screen onboard">
      {step.id === "welcome" && <Welcome onCreate={() => setStep({ id: "create-phrase", mnemonic: newMnemonic(12) })} onImport={() => setStep({ id: "import" })} />}
      {step.id === "create-phrase" && (
        <CreatePhrase
          mnemonic={step.mnemonic}
          onBack={() => setStep({ id: "welcome" })}
          onNext={() => setStep({ id: "confirm-phrase", mnemonic: step.mnemonic })}
        />
      )}
      {step.id === "confirm-phrase" && (
        <ConfirmPhrase
          mnemonic={step.mnemonic}
          onBack={() => setStep({ id: "create-phrase", mnemonic: step.mnemonic })}
          onNext={() => setStep({ id: "password", secret: { mnemonic: step.mnemonic } })}
        />
      )}
      {step.id === "import" && (
        <ImportStep
          onBack={() => setStep({ id: "welcome" })}
          onNext={(secret) => setStep({ id: "password", secret })}
        />
      )}
      {step.id === "password" && <PasswordStep secret={step.secret} onBack={() => setStep({ id: "welcome" })} />}
    </div>
  );
}

function Welcome({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div className="onboard-welcome">
      <div className="solar-field" aria-hidden />
      <div className="welcome-hero">
        <Logo size={64} />
        <h1 className="wordmark">SOLWALL</h1>
        <p className="tagline">Your keys. Your Solana. A wallet that never leaves your hands.</p>
      </div>
      <div className="welcome-actions">
        <Btn size="lg" onClick={onCreate}>
          Create a new wallet
        </Btn>
        <Btn size="lg" variant="outline" onClick={onImport}>
          I already have a wallet
        </Btn>
        <p className="fine-print">Non-custodial · keys are encrypted on this device and never sent anywhere.</p>
      </div>
    </div>
  );
}

function StepHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="step-header">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <IconBack size={18} />
      </button>
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}

function CreatePhrase({ mnemonic, onBack, onNext }: { mnemonic: string; onBack: () => void; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = useCopy();
  const words = mnemonic.split(" ");

  return (
    <div className="step">
      <StepHeader title="Your recovery phrase" sub="These 12 words are the only way to restore this wallet. Write them down, in order, somewhere offline." onBack={onBack} />
      <div className={`phrase-grid ${revealed ? "" : "blurred"}`} onClick={() => setRevealed(true)}>
        {words.map((w, i) => (
          <div key={i} className="phrase-word">
            <span className="phrase-idx">{i + 1}</span>
            <span className="mono">{w}</span>
          </div>
        ))}
        {!revealed && (
          <button className="phrase-reveal" onClick={() => setRevealed(true)}>
            <IconEye size={18} /> Click to reveal
          </button>
        )}
      </div>
      <button className="link-btn" onClick={() => void copy(mnemonic, "Phrase copied — clear your clipboard after")}>
        <IconCopy size={14} /> Copy to clipboard
      </button>
      <div className="callout warn">
        <IconWarning size={16} />
        Anyone with these words can take everything in this wallet. SOLWALL will never ask for them.
      </div>
      <label className="checkline">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I saved my recovery phrase somewhere safe
      </label>
      <div className="step-actions">
        <Btn size="lg" disabled={!saved || !revealed} onClick={onNext}>
          Continue
        </Btn>
      </div>
    </div>
  );
}

function ConfirmPhrase({ mnemonic, onBack, onNext }: { mnemonic: string; onBack: () => void; onNext: () => void }) {
  const words = mnemonic.split(" ");
  const quiz = useMemo(() => {
    const idxs = shuffle([...Array(words.length).keys()]).slice(0, 3).sort((a, b) => a - b);
    return idxs.map((idx) => {
      const decoys = shuffle(words.filter((_, i) => i !== idx)).slice(0, 2);
      return { idx, options: shuffle([words[idx], ...decoys]) };
    });
  }, [mnemonic]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const allCorrect = quiz.every((q) => answers[q.idx] === words[q.idx]);
  const allAnswered = quiz.every((q) => answers[q.idx] != null);

  return (
    <div className="step">
      <StepHeader title="Verify your phrase" sub="Pick the correct word for each position." onBack={onBack} />
      <div className="quiz">
        {quiz.map((q) => (
          <div key={q.idx} className="quiz-row">
            <div className="quiz-label">Word #{q.idx + 1}</div>
            <div className="quiz-options">
              {q.options.map((opt) => {
                const chosen = answers[q.idx] === opt;
                const wrong = chosen && opt !== words[q.idx];
                return (
                  <button
                    key={opt}
                    className={`chip ${chosen ? (wrong ? "chip-wrong" : "chip-right") : ""}`}
                    onClick={() => setAnswers((a) => ({ ...a, [q.idx]: opt }))}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {allAnswered && !allCorrect && <div className="callout warn">One or more words don't match — check your backup.</div>}
      <div className="step-actions">
        <Btn size="lg" disabled={!allCorrect} onClick={onNext}>
          {allCorrect ? (
            <>
              <IconCheck size={16} /> Verified — continue
            </>
          ) : (
            "Continue"
          )}
        </Btn>
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ImportStep({ onBack, onNext }: { onBack: () => void; onNext: (secret: { mnemonic?: string; secretKey?: string; scheme?: SchemeId }) => void }) {
  const [mode, setMode] = useState<"phrase" | "key">("phrase");
  const [phrase, setPhrase] = useState("");
  const [key, setKey] = useState("");
  const [scheme, setScheme] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (mode === "phrase") {
      if (!isValidMnemonic(phrase)) {
        setError("That's not a valid 12 or 24-word recovery phrase.");
        return;
      }
      onNext({ mnemonic: phrase, scheme: (scheme || undefined) as SchemeId | undefined });
    } else {
      if (key.trim().length < 32) {
        setError("Paste a base58 private key (or a JSON byte array).");
        return;
      }
      onNext({ secretKey: key.trim() });
    }
  };

  return (
    <div className="step">
      <StepHeader title="Import a wallet" sub="Restore from a recovery phrase or a single private key." onBack={onBack} />
      <div className="seg">
        <button className={mode === "phrase" ? "on" : ""} onClick={() => setMode("phrase")}>
          <IconSeed size={15} /> Recovery phrase
        </button>
        <button className={mode === "key" ? "on" : ""} onClick={() => setMode("key")}>
          <IconKey size={15} /> Private key
        </button>
      </div>
      {mode === "phrase" ? (
        <div className="field">
          <label htmlFor="imp-phrase">Recovery phrase</label>
          <textarea
            id="imp-phrase"
            className="phrase-input mono"
            rows={3}
            placeholder="12 or 24 words separated by spaces"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label htmlFor="imp-scheme">Wallet type</label>
            <select id="imp-scheme" className="select" value={scheme} onChange={(e) => setScheme(e.target.value)}>
              <option value="">Auto-detect (recommended)</option>
              <option value="bip44-change">Phantom · Solflare · Backpack</option>
              <option value="bip44">Ledger</option>
              <option value="bip44-root">Legacy / raw seed</option>
            </select>
            <div className="field-msg">If your wallet imports empty, pick the wallet you exported the phrase from.</div>
          </div>
        </div>
      ) : (
        <Field
          label="Private key"
          className="mono-input"
          placeholder="base58 key, e.g. 4wBq…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {error && <div className="callout warn">{error}</div>}
      <div className="step-actions">
        <Btn size="lg" onClick={submit} disabled={mode === "phrase" ? phrase.trim() === "" : key.trim() === ""}>
          Continue
        </Btn>
      </div>
    </div>
  );
}

function PasswordStep({ secret, onBack }: { secret: { mnemonic?: string; secretKey?: string; scheme?: SchemeId }; onBack: () => void }) {
  const { refresh, toast } = useStore();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = pw.length >= 14 ? "strong" : pw.length >= 10 ? "good" : pw.length >= 8 ? "okay" : "too short";

  const submit = async () => {
    if (pw.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await bg<Snapshot>({ type: "createVault", password: pw, walletName: "Wallet 1", ...secret });
      toast("Wallet ready", "success");
      location.hash = "/";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="step">
      <StepHeader title="Set a password" sub="Unlocks SOLWALL on this device. It can't recover your phrase — only encrypt it." onBack={onBack} />
      <Field
        label="Password"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        hint={pw ? `Strength: ${strength}` : "At least 8 characters"}
        autoFocus
      />
      <Field
        label="Confirm password"
        type="password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
      {error && <div className="callout warn">{error}</div>}
      <div className="step-actions">
        <Btn size="lg" loading={busy} onClick={() => void submit()}>
          Create wallet
        </Btn>
      </div>
    </div>
  );
}
