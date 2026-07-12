// In-page provider — Phantom-compatible surface exposed as window.solwall,
// window.solana, and window.phantom.solana. Runs in the page context with no
// extension privileges; everything round-trips through the content script.

export {}; // module scope — avoids global collisions with content.ts

type Listener = (...args: unknown[]) => void;

const CHANNEL_REQ = "solwall#request";
const CHANNEL_RES = "solwall#response";
const CHANNEL_EVT = "solwall#event";

let nextId = 1;
const inflight = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data) return;
  if (data.channel === CHANNEL_RES) {
    const entry = inflight.get(data.id);
    if (!entry) return;
    inflight.delete(data.id);
    const payload = data.payload;
    if (payload?.ok) entry.resolve(payload.data);
    else entry.reject(new Error(payload?.error ?? "Unknown wallet error"));
  } else if (data.channel === CHANNEL_EVT) {
    handleEvent(data.payload);
  }
});

function request(method: string, params?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    inflight.set(id, { resolve, reject });
    window.postMessage({ channel: CHANNEL_REQ, id, method, params }, window.location.origin);
  });
}

// ---- byte helpers (no Buffer in page context) ----

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    const val = B58_ALPHABET.indexOf(ch);
    if (val < 0) throw new Error("Invalid base58");
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch === "1") bytes.push(0);
    else break;
  }
  return Uint8Array.from(bytes.reverse());
}

function b58encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte === 0) out += "1";
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

/** Minimal PublicKey stand-in — enough for dApps that call toString/toBase58/toBytes. */
class ProviderPublicKey {
  private readonly _b58: string;
  constructor(b58: string) {
    this._b58 = b58;
  }
  toBase58(): string {
    return this._b58;
  }
  toString(): string {
    return this._b58;
  }
  toBytes(): Uint8Array {
    return b58decode(this._b58);
  }
  toJSON(): string {
    return this._b58;
  }
  equals(other: { toString(): string }): boolean {
    return other?.toString() === this._b58;
  }
}

// ---- transaction (de)serialization against the dApp's own objects ----

function serializeTx(tx: any): string {
  if (typeof tx?.serialize === "function" && tx?.message !== undefined) {
    // VersionedTransaction — serialize() gives the full wire format.
    return toB64(tx.serialize());
  }
  if (typeof tx?.serialize === "function") {
    // Legacy Transaction.
    return toB64(new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false })));
  }
  throw new Error("Unsupported transaction object");
}

/** Copy signatures from the wallet-signed bytes back onto the dApp's object. */
function applySignedBytes(tx: any, signedB64: string, walletPubkey: string): any {
  const signed = fromB64(signedB64);
  if (tx?.message !== undefined && Array.isArray(tx.signatures)) {
    // VersionedTransaction: signatures[i] are raw Uint8Arrays, ordered by the
    // message's signer list. Copy every non-empty signature across.
    const numSigs = tx.signatures.length;
    let off = 1; // skip shortvec count byte (sig counts < 128 in practice)
    for (let i = 0; i < numSigs; i++) {
      const sig = signed.slice(off, off + 64);
      off += 64;
      if (sig.some((b: number) => b !== 0)) tx.signatures[i] = sig;
    }
    return tx;
  }
  if (Array.isArray(tx?.signatures)) {
    // Legacy Transaction: signatures = [{ publicKey, signature }] in signer
    // order, which matches the wire format's signature order.
    const numSigs = signed[0];
    const sigs: Uint8Array[] = [];
    let off = 1;
    for (let i = 0; i < numSigs; i++) {
      sigs.push(signed.slice(off, off + 64));
      off += 64;
    }
    tx.signatures.forEach((entry: any, i: number) => {
      const sig = sigs[i];
      if (sig && sig.some((b) => b !== 0)) {
        entry.signature = sig;
      }
    });
    return tx;
  }
  throw new Error("Unsupported transaction object");
}

// ---- the provider ----

class SolwallProvider {
  isPhantom = true;
  isSolwall = true;
  publicKey: ProviderPublicKey | null = null;
  isConnected = false;

  private listeners = new Map<string, Set<Listener>>();

  on(event: string, cb: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: Listener): void {
    this.listeners.get(event)?.delete(cb);
  }

  removeListener(event: string, cb: Listener): void {
    this.off(event, cb);
  }

  removeAllListeners(event?: string): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch {
        /* dApp listener error — not ours */
      }
    });
  }

  async connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: ProviderPublicKey }> {
    const method = opts?.onlyIfTrusted ? "connectIfTrusted" : "connect";
    const res = await request(method);
    this.publicKey = new ProviderPublicKey(res.publicKey);
    this.isConnected = true;
    this.emit("connect", this.publicKey);
    return { publicKey: this.publicKey };
  }

  async disconnect(): Promise<void> {
    await request("disconnect");
    this.publicKey = null;
    this.isConnected = false;
    this.emit("disconnect");
  }

  async signMessage(message: Uint8Array, _display?: string): Promise<{ signature: Uint8Array; publicKey: ProviderPublicKey }> {
    const res = await request("signMessage", { messageB64: toB64(message) });
    return { signature: b58decode(res.signatureB58), publicKey: new ProviderPublicKey(res.publicKey) };
  }

  async signTransaction(tx: any): Promise<any> {
    const res = await request("signTransaction", { txsB64: [serializeTx(tx)] });
    return applySignedBytes(tx, res.signedTxsB64[0], res.publicKey);
  }

  async signAllTransactions(txs: any[]): Promise<any[]> {
    const res = await request("signAllTransactions", { txsB64: txs.map(serializeTx) });
    return txs.map((tx, i) => applySignedBytes(tx, res.signedTxsB64[i], res.publicKey));
  }

  async signAndSendTransaction(tx: any, _opts?: unknown): Promise<{ signature: string; publicKey: ProviderPublicKey }> {
    const res = await request("signAndSendTransaction", { txsB64: [serializeTx(tx)] });
    return { signature: res.signature, publicKey: new ProviderPublicKey(res.publicKey) };
  }

  async request(args: { method: string; params?: any }): Promise<any> {
    switch (args?.method) {
      case "connect":
        return this.connect(args.params);
      case "disconnect":
        return this.disconnect();
      case "signMessage":
        return this.signMessage(args.params?.message);
      case "signTransaction":
        return this.signTransaction(args.params?.transaction);
      case "signAndSendTransaction":
        return this.signAndSendTransaction(args.params?.transaction);
      default:
        throw new Error(`Unsupported method: ${args?.method}`);
    }
  }

  /** internal — wired to background broadcasts */
  _handleEvent(payload: { event: string; data?: any }): void {
    if (payload.event === "accountChanged") {
      const pk = payload.data?.publicKey;
      if (this.isConnected && pk) {
        this.publicKey = new ProviderPublicKey(pk);
        this.emit("accountChanged", this.publicKey);
      }
    } else if (payload.event === "disconnect") {
      if (this.isConnected) {
        this.publicKey = null;
        this.isConnected = false;
        this.emit("disconnect");
      }
    }
  }
}

const provider = new SolwallProvider();

// ---------------- Wallet Standard (dApp auto-discovery) ----------------
// Current Solana dApps (wallet-adapter, Jupiter, Tensor, Drift…) find wallets
// via the Wallet Standard register event, NOT window.solana. Without this,
// SOLWALL never shows up in the connect list. Spec (current as of 2026):
// github.com/wallet-standard/wallet-standard, features versioned "1.0.0".

const SOLANA_CHAINS = ["solana:mainnet", "solana:devnet", "solana:testnet"] as const;
const ACCOUNT_FEATURES = ["solana:signAndSendTransaction", "solana:signTransaction", "solana:signMessage"];

function standardIcon(): `data:image/svg+xml;base64,${string}` {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="9" fill="#171208"/>' +
    '<circle cx="16" cy="14.5" r="7.5" fill="#f5b843"/>' +
    '<rect x="6" y="21.5" width="20" height="1.6" rx="0.8" fill="#f5b843"/></svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function toStandardAccount(address: string): any {
  return { address, publicKey: b58decode(address), chains: SOLANA_CHAINS, features: ACCOUNT_FEATURES, label: "SOLWALL", icon: standardIcon() };
}

/** Wallet Standard wallet, backed by the same background bridge as the provider. */
class SolwallStandardWallet {
  #account: any = null;
  #listeners: Record<string, Set<(...a: any[]) => void>> = { change: new Set() };

  get version() { return "1.0.0" as const; }
  get name() { return "SOLWALL"; }
  get icon() { return standardIcon(); }
  get chains() { return SOLANA_CHAINS.slice(); }
  get accounts() { return this.#account ? [this.#account] : []; }

  get features(): any {
    return {
      "standard:connect": { version: "1.0.0", connect: this.#connect },
      "standard:disconnect": { version: "1.0.0", disconnect: this.#disconnect },
      "standard:events": { version: "1.0.0", on: this.#on },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signAndSendTransaction: this.#signAndSendTransaction },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: this.#signTransaction },
      "solana:signMessage": { version: "1.0.0", signMessage: this.#signMessage },
    };
  }

  #emit(props: any) {
    this.#listeners.change.forEach((l) => {
      try {
        l(props);
      } catch {
        /* dApp listener error — not ours */
      }
    });
  }

  #setAccount = (address: string | null) => {
    this.#account = address ? toStandardAccount(address) : null;
    this.#emit({ accounts: this.accounts });
  };

  #on = (event: string, listener: (...a: any[]) => void) => {
    (this.#listeners[event] ??= new Set()).add(listener);
    return () => this.#listeners[event]?.delete(listener);
  };

  #connect = async (input?: { silent?: boolean }) => {
    if (!this.#account) {
      try {
        const res = await request(input?.silent ? "connectIfTrusted" : "connect");
        this.#setAccount(res.publicKey);
        provider.publicKey = new ProviderPublicKey(res.publicKey);
        provider.isConnected = true;
      } catch (e) {
        if (input?.silent) return { accounts: [] };
        throw e;
      }
    }
    return { accounts: this.accounts };
  };

  #disconnect = async () => {
    await request("disconnect").catch(() => {});
    this.#setAccount(null);
  };

  #signAndSendTransaction = async (...inputs: any[]) => {
    const out: any[] = [];
    for (const input of inputs) {
      const res = await request("signAndSendTransaction", { txsB64: [toB64(input.transaction)] });
      out.push({ signature: b58decode(res.signature) });
    }
    return out;
  };

  #signTransaction = async (...inputs: any[]) => {
    const res = await request("signAllTransactions", { txsB64: inputs.map((i) => toB64(i.transaction)) });
    return res.signedTxsB64.map((b64: string) => ({ signedTransaction: fromB64(b64) }));
  };

  #signMessage = async (...inputs: any[]) => {
    const out: any[] = [];
    for (const input of inputs) {
      const res = await request("signMessage", { messageB64: toB64(input.message) });
      out.push({ signedMessage: input.message, signature: b58decode(res.signatureB58) });
    }
    return out;
  };

  _handleEvent(payload: { event: string; data?: any }) {
    if (payload.event === "accountChanged" && this.#account && payload.data?.publicKey) this.#setAccount(payload.data.publicKey);
    else if (payload.event === "disconnect" && this.#account) this.#setAccount(null);
  }
}

class RegisterWalletEvent extends Event {
  #detail: any;
  constructor(callback: any) {
    super("wallet-standard:register-wallet", { bubbles: false, cancelable: false, composed: false });
    this.#detail = callback;
  }
  get detail() {
    return this.#detail;
  }
}

const standardWallet = new SolwallStandardWallet();

function registerStandardWallet(wallet: any): void {
  const callback = (api: any) => api.register(wallet);
  // (a) announce now in case the dApp is already listening…
  try {
    window.dispatchEvent(new RegisterWalletEvent(callback));
  } catch {
    /* older engines */
  }
  // …and (b) answer late-loading dApps that ask for wallets.
  try {
    window.addEventListener("wallet-standard:app-ready", (e: any) => callback(e.detail));
  } catch {
    /* older engines */
  }
}

function handleEvent(payload: { event: string; data?: any }): void {
  provider._handleEvent(payload);
  standardWallet._handleEvent(payload);
}

// Expose the injected (window.solana / Phantom-compat) provider AND register the
// Wallet Standard wallet — covers both discovery paths.
(window as any).solwall = provider;
if (!(window as any).solana) (window as any).solana = provider;
if (!(window as any).phantom) (window as any).phantom = { solana: provider };

registerStandardWallet(standardWallet);
window.dispatchEvent(new Event("solwall#initialized"));
