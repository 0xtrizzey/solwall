import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { truncateAddress } from "../lib/format";
import { useCopy, useStore } from "./store";
import { IconCheck, IconClose, IconCopy, IconWarning } from "./icons";

// ---- buttons ----

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "md" | "lg" | "sm";
  loading?: boolean;
}

export function Btn({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : children}
    </button>
  );
}

// ---- inputs ----

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, trailing, className = "", id, ...rest }: FieldProps) {
  const inputId = id ?? `f-${label?.replace(/\s+/g, "-").toLowerCase() ?? Math.random().toString(36).slice(2)}`;
  return (
    <div className={`field ${error ? "field-error" : ""} ${className}`}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="field-box">
        <input id={inputId} {...rest} />
        {trailing && <div className="field-trailing">{trailing}</div>}
      </div>
      {error ? <div className="field-msg error">{error}</div> : hint ? <div className="field-msg">{hint}</div> : null}
    </div>
  );
}

// ---- bottom sheet ----

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---- toasts ----

export function ToastHost() {
  const { toasts } = useStore();
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "success" && <IconCheck size={15} />}
          {t.kind === "error" && <IconWarning size={15} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---- address chip ----

export function AddressChip({ address, chars = 4 }: { address: string; chars?: number }) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  return (
    <button
      className="addr-chip"
      onClick={() => {
        void copy(address, "Address copied");
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      title={address}
    >
      <Identicon address={address} size={14} />
      <span className="mono">{truncateAddress(address, chars)}</span>
      {done ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

// ---- identicon ----

export function Identicon({ address, size = 20 }: { address: string; size?: number }) {
  let hash = 5381;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 33) ^ address.charCodeAt(i);
  }
  hash >>>= 0;

  const colors = Array.from({ length: 9 }).map((_, i) => {
    const bits = (hash >>> (i * 3)) & 0b111;
    const hue = bits * 45; 
    return `hsl(${hue} 70% 60%)`;
  });

  return (
    <div
      className="identicon"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        width: size,
        height: size,
        borderRadius: size * 0.15,
        overflow: "hidden",
        flexShrink: 0,
      }}
      aria-hidden
    >
      {colors.map((c, i) => (
        <div key={i} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

// ---- token icon with monogram fallback ----

const HUES = [36, 158, 210, 268, 330, 12, 96];

export function TokenAvatar({ symbol, logoURI, size = 36 }: { symbol: string; logoURI?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hue = HUES[(symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % HUES.length];
  if (logoURI && !failed) {
    return (
      <img
        className="token-avatar"
        src={logoURI}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="token-avatar token-avatar-mono"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 28% 26%), hsl(${hue} 32% 16%))`,
        color: `hsl(${hue} 65% 72%)`,
        fontSize: size * 0.34,
      }}
      aria-hidden
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ---- skeletons / empty / error ----

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="sk sk-circle" />
          <div className="sk-lines">
            <div className="sk sk-line" style={{ width: "42%" }} />
            <div className="sk sk-line" style={{ width: "26%" }} />
          </div>
          <div className="sk sk-line" style={{ width: 56 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon error">
        <IconWarning size={22} />
      </div>
      <h3>Couldn't load</h3>
      <p>{message}</p>
      {onRetry && (
        <Btn variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Btn>
      )}
    </div>
  );
}

// ---- count-up number ----

export function useCountUp(target: number | null, duration = 550): number | null {
  const [value, setValue] = useState<number | null>(target);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (target == null) {
      setValue(null);
      prev.current = null;
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = prev.current ?? 0;
    prev.current = target;
    if (reduced || from === target) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ---- misc ----

export function Divider() {
  return <div className="divider" />;
}

export function Row({
  left,
  title,
  sub,
  right,
  onClick,
  danger,
}: {
  left?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp className={`list-row ${onClick ? "clickable" : ""} ${danger ? "danger" : ""}`} onClick={onClick}>
      {left && <div className="row-left">{left}</div>}
      <div className="row-mid">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {right && <div className="row-right">{right}</div>}
    </Comp>
  );
}
