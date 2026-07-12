// All secret-touching logic lives here, in the background service worker.
// The popup is pure UI; content scripts only relay. Decrypted secrets exist
// only in chrome.storage.session (memory-only) and are wiped on lock,
// auto-lock alarm, or browser exit.

import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  createEncryptedVault,
  openVault,
  reencryptVault,
  exportSessionKey,
  importSessionKey,
  verifyPassword as cryptoVerifyPassword,
  type EncryptedVault,
} from "../lib/crypto";
import {
  deriveKeypair,
  deriveForScheme,
  keypairFromSecretInput,
  newMnemonic,
  isValidMnemonic,
  normalizeMnemonic,
  secretKeyToBase58,
  SOLANA_SCHEMES,
  type SchemeId,
} from "../lib/keyring";
import { localGet, localRemove, localSet, sessionGet, sessionRemove, sessionSet, clearAll } from "../lib/storage";
import { b64FromBytes, bytesFromB64, uid } from "../lib/format";
import { rpcUrl } from "../lib/rpc";
import {
  STORAGE_KEYS,
  type ApprovalRequest,
  type BgRequest,
  type BgResponse,
  type DappMethod,
  type DappParams,
  type PublicState,
  type Snapshot,
  type VaultSecrets,
  type VaultWallet,
  type WalletMeta,
} from "../lib/types";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { isVersionedTransaction } from "../lib/txbytes";

export { newMnemonic, isValidMnemonic };

interface SessionData {
  secrets: VaultSecrets;
  /** raw AES key (memory-only session storage) so mutations re-encrypt without the password */
  keyB64: string;
}

const DEFAULT_PUB: PublicState = {
  wallets: [],
  active: null,
  network: "mainnet-beta",
  customRpcUrl: "",
  autoLockMinutes: 15,
  connectedSites: {},
  fiat: "USD",
  addressBook: [],
};

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(fallback);
      }
    });
  });
}

// ---- import: derivation-path discovery ----
// Different Solana wallets use different derivation paths. On import we scan the
// known schemes for the one that actually holds funds/history, so any Solana
// recovery phrase lands on the user's real accounts (not an empty address).

async function accountActive(conn: Connection, pubkey: PublicKey): Promise<boolean> {
  const [bal, sigs] = await Promise.all([
    conn.getBalance(pubkey).catch(() => 0),
    conn.getSignaturesForAddress(pubkey, { limit: 1 }).catch(() => [] as unknown[]),
  ]);
  return bal > 0 || sigs.length > 0;
}

async function discoverMnemonic(mnemonic: string): Promise<{ scheme: SchemeId; indices: number[] }> {
  const fallback = { scheme: "bip44-change" as SchemeId, indices: [0] };
  try {
    const conn = await activeConnection();
    // Pick the scheme whose first account shows on-chain activity.
    let chosen: SchemeId | null = null;
    for (const s of SOLANA_SCHEMES) {
      const kp = deriveForScheme(mnemonic, s.id, 0);
      if (await withTimeout(accountActive(conn, kp.publicKey), 3000, false)) {
        chosen = s.id;
        break;
      }
    }
    if (!chosen) return fallback; // nothing funded anywhere → standard, account 0
    if (chosen === "bip44-root") return { scheme: chosen, indices: [0] };
    // Gap-limit scan for additional active accounts in the chosen scheme.
    const indices: number[] = [];
    let empty = 0;
    for (let i = 0; i < 10 && empty < 3; i++) {
      const kp = deriveForScheme(mnemonic, chosen, i);
      if (await withTimeout(accountActive(conn, kp.publicKey), 3000, false)) {
        indices.push(i);
        empty = 0;
      } else {
        empty++;
      }
    }
    return { scheme: chosen, indices: indices.length ? indices : [0] };
  } catch {
    return fallback;
  }
}

// Import must NEVER hang on the network. If the user forces a scheme we use it
// directly (instant, offline). Otherwise auto-detect runs under a hard total
// time budget and falls back to the standard path if the RPC is slow.
async function buildMnemonicWallet(
  id: string,
  mnemonic: string,
  walletName: string,
  forcedScheme?: SchemeId,
): Promise<{ vw: VaultWallet; mw: WalletMeta; active: string }> {
  const normalized = normalizeMnemonic(mnemonic);
  const { scheme, indices } = forcedScheme
    ? { scheme: forcedScheme, indices: [0] }
    : await withTimeout(discoverMnemonic(normalized), 7000, { scheme: "bip44-change" as SchemeId, indices: [0] });
  const mw: WalletMeta = {
    id,
    name: walletName,
    type: "mnemonic",
    accounts: indices.map((index, n) => ({
      index,
      name: `Account ${n + 1}`,
      pubkey: deriveForScheme(normalized, scheme, index).publicKey.toBase58(),
    })),
  };
  const vw: VaultWallet = { id, type: "mnemonic", scheme, mnemonic: normalized, accounts: indices.map((index) => ({ index })) };
  return { vw, mw, active: mw.accounts[0].pubkey };
}

// ---- state helpers ----

async function getPub(): Promise<PublicState> {
  const stored = await localGet<PublicState>(STORAGE_KEYS.pub);
  // Merge with defaults so wallets created before a field existed still work.
  return stored ? { ...DEFAULT_PUB, ...stored } : { ...DEFAULT_PUB };
}

async function setPub(pub: PublicState): Promise<void> {
  await localSet(STORAGE_KEYS.pub, pub);
}

async function getSession(): Promise<SessionData | undefined> {
  return sessionGet<SessionData>(STORAGE_KEYS.session);
}

async function requireSession(): Promise<SessionData> {
  const s = await getSession();
  if (!s) throw new Error("Wallet is locked");
  return s;
}

// Re-encrypt the vault with the in-memory session key (mutations only; the
// vault must already exist). Never touches the password.
async function saveSession(secrets: VaultSecrets, keyB64: string): Promise<void> {
  const prev = await localGet<EncryptedVault>(STORAGE_KEYS.vault);
  if (!prev) throw new Error("Wallet is locked");
  const key = await importSessionKey(keyB64);
  const enc = await reencryptVault(key, prev, JSON.stringify(secrets));
  await localSet(STORAGE_KEYS.vault, enc);
  await sessionSet(STORAGE_KEYS.session, { secrets, keyB64 } satisfies SessionData);
}

async function snapshot(): Promise<Snapshot> {
  const [vault, session, pub] = await Promise.all([
    localGet<EncryptedVault>(STORAGE_KEYS.vault),
    getSession(),
    getPub(),
  ]);
  return { hasVault: !!vault, locked: !session, pub };
}

function resetAutoLock(minutes: number): void {
  if (typeof chrome.alarms === "undefined") return;
  chrome.alarms.clear("solwall-autolock");
  if (minutes > 0) chrome.alarms.create("solwall-autolock", { delayInMinutes: minutes });
}

export async function lockNow(): Promise<void> {
  await sessionRemove(STORAGE_KEYS.session);
  broadcastEvent({ event: "disconnect" });
}

// ---- signing helpers ----

function keypairFor(secrets: VaultSecrets, pub: PublicState, pubkey: string): Keypair {
  for (const w of secrets.wallets) {
    const metaWallet = pub.wallets.find((m) => m.id === w.id);
    if (!metaWallet) continue;
    for (const acc of metaWallet.accounts) {
      if (acc.pubkey !== pubkey) continue;
      if (w.type === "mnemonic" && w.mnemonic) return deriveForScheme(w.mnemonic, w.scheme ?? "bip44-change", acc.index);
      const secret = w.accounts.find((a) => a.index === acc.index)?.secretKey;
      if (secret) return keypairFromSecretInput(secret);
    }
  }
  throw new Error("Account not found in vault");
}

function signTxBytes(kp: Keypair, txBytes: Uint8Array): Uint8Array {
  if (isVersionedTransaction(txBytes)) {
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([kp]);
    return vtx.serialize();
  }
  const tx = Transaction.from(txBytes);
  tx.partialSign(kp);
  return new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

async function activeConnection(): Promise<Connection> {
  const pub = await getPub();
  return new Connection(rpcUrl(pub.network, pub.customRpcUrl), { commitment: "confirmed" });
}

// ---- dApp approval plumbing ----

const pendingApprovals = new Map<
  string,
  { request: ApprovalRequest; resolve: (r: BgResponse) => void }
>();

function openApprovalWindow(id: string): void {
  const url = chrome.runtime.getURL(`popup.html#/approve/${id}`);
  chrome.windows.create({ url, type: "popup", width: 388, height: 648, focused: true });
}

function awaitApproval(origin: string, payload: ApprovalRequest["payload"]): Promise<BgResponse> {
  const request: ApprovalRequest = { id: uid(), origin, payload, createdAt: Date.now() };
  return new Promise<BgResponse>((resolve) => {
    pendingApprovals.set(request.id, { request, resolve });
    openApprovalWindow(request.id);
    // Hard timeout so a closed/ignored window doesn't hang the dApp forever.
    setTimeout(() => {
      if (pendingApprovals.has(request.id)) {
        pendingApprovals.delete(request.id);
        resolve({ ok: false, error: "Request timed out" });
      }
    }, 5 * 60_000);
  });
}

function broadcastEvent(payload: { event: string; data?: unknown }): void {
  if (typeof chrome.tabs === "undefined") return;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { solwallEvent: payload }, () => void chrome.runtime.lastError);
      }
    }
  });
}

// ---- wallet mutations ----

function nextAccountName(pub: PublicState): string {
  const count = pub.wallets.reduce((n, w) => n + w.accounts.length, 0);
  return `Account ${count + 1}`;
}

async function addMnemonicWalletInner(mnemonic: string, name: string, scheme?: SchemeId): Promise<void> {
  if (!isValidMnemonic(mnemonic)) throw new Error("Invalid recovery phrase");
  const session = await requireSession();
  const pub = await getPub();
  const normalized = normalizeMnemonic(mnemonic);
  if (session.secrets.wallets.some((w) => w.mnemonic === normalized)) {
    throw new Error("This recovery phrase is already imported");
  }
  const id = uid();
  const { vw, mw, active } = await buildMnemonicWallet(id, normalized, name, scheme);
  session.secrets.wallets.push(vw);
  pub.wallets.push(mw);
  pub.active = { walletId: id, pubkey: active };
  await saveSession(session.secrets, session.keyB64);
  await setPub(pub);
}

// ---- main dispatcher ----

export async function handleMessage(
  msg: BgRequest,
  sender: { origin?: string; trusted?: boolean } = {},
): Promise<BgResponse> {
  try {
    // Only first-party (popup / approval-window) activity keeps the wallet
    // awake; a connected dApp polling getNetwork must NOT defeat auto-lock.
    if (sender.trusted) {
      const pubState = await getPub();
      resetAutoLock(pubState.autoLockMinutes);
    }

    switch (msg.type) {
      case "getSnapshot":
        return ok(await snapshot());

      case "createVault": {
        if (msg.password.length < 8) throw new Error("Password must be at least 8 characters");
        const existing = await localGet<EncryptedVault>(STORAGE_KEYS.vault);
        if (existing) throw new Error("A wallet already exists");
        const id = uid();
        let vw: VaultWallet;
        let mw: WalletMeta;
        let active: string;
        if (msg.secretKey) {
          const kp = keypairFromSecretInput(msg.secretKey);
          active = kp.publicKey.toBase58();
          vw = { id, type: "privateKey", accounts: [{ index: -1, secretKey: secretKeyToBase58(kp) }] };
          mw = { id, name: msg.walletName, type: "privateKey", accounts: [{ index: -1, name: "Account 1", pubkey: active }] };
        } else {
          if (!msg.mnemonic || !isValidMnemonic(msg.mnemonic)) throw new Error("Invalid recovery phrase");
          ({ vw, mw, active } = await buildMnemonicWallet(id, msg.mnemonic, msg.walletName, msg.scheme));
        }
        const secrets: VaultSecrets = { wallets: [vw] };
        const pub: PublicState = { ...DEFAULT_PUB, wallets: [mw], active: { walletId: id, pubkey: active } };
        const { vault: blob, key } = await createEncryptedVault(msg.password, JSON.stringify(secrets));
        await localSet(STORAGE_KEYS.vault, blob);
        await sessionSet(STORAGE_KEYS.session, { secrets, keyB64: await exportSessionKey(key) } satisfies SessionData);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "unlock": {
        const vault = await localGet<EncryptedVault>(STORAGE_KEYS.vault);
        if (!vault) throw new Error("No wallet found");
        let opened: { plaintext: string; key: CryptoKey };
        try {
          opened = await openVault(msg.password, vault);
        } catch {
          throw new Error("Incorrect password");
        }
        await sessionSet(STORAGE_KEYS.session, {
          secrets: JSON.parse(opened.plaintext),
          keyB64: await exportSessionKey(opened.key),
        } satisfies SessionData);
        return ok(await snapshot());
      }

      case "lock":
        await lockNow();
        return ok(await snapshot());

      case "addMnemonicWallet":
        await addMnemonicWalletInner(msg.mnemonic, msg.name, msg.scheme);
        return ok(await snapshot());

      case "importPrivateKey": {
        const session = await requireSession();
        const pub = await getPub();
        const kp = keypairFromSecretInput(msg.secretKey);
        const pubkey = kp.publicKey.toBase58();
        if (pub.wallets.some((w) => w.accounts.some((a) => a.pubkey === pubkey))) {
          throw new Error("This account is already in your wallet");
        }
        const id = uid();
        session.secrets.wallets.push({
          id,
          type: "privateKey",
          accounts: [{ index: -1, secretKey: secretKeyToBase58(kp) }],
        });
        pub.wallets.push({ id, name: msg.name, type: "privateKey", accounts: [{ index: -1, name: nextAccountName(pub), pubkey }] });
        pub.active = { walletId: id, pubkey };
        await saveSession(session.secrets, session.keyB64);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "addAccount": {
        const session = await requireSession();
        const pub = await getPub();
        const wallet = session.secrets.wallets.find((w) => w.id === msg.walletId);
        const metaWallet = pub.wallets.find((w) => w.id === msg.walletId);
        if (!wallet || !metaWallet) throw new Error("Wallet not found");
        if (wallet.type !== "mnemonic" || !wallet.mnemonic) throw new Error("Only seed-phrase wallets can add accounts");
        const scheme = wallet.scheme ?? "bip44-change";
        if (scheme === "bip44-root") throw new Error("This wallet uses a single-account derivation");
        const nextIndex = Math.max(...wallet.accounts.map((a) => a.index)) + 1;
        const kp = deriveForScheme(wallet.mnemonic, scheme, nextIndex);
        wallet.accounts.push({ index: nextIndex });
        metaWallet.accounts.push({ index: nextIndex, name: nextAccountName(pub), pubkey: kp.publicKey.toBase58() });
        pub.active = { walletId: msg.walletId, pubkey: kp.publicKey.toBase58() };
        await saveSession(session.secrets, session.keyB64);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "renameAccount": {
        const pub = await getPub();
        const acc = pub.wallets.find((w) => w.id === msg.walletId)?.accounts.find((a) => a.pubkey === msg.pubkey);
        if (!acc) throw new Error("Account not found");
        acc.name = msg.name.trim() || acc.name;
        await setPub(pub);
        return ok(await snapshot());
      }

      case "renameWallet": {
        const pub = await getPub();
        const w = pub.wallets.find((w) => w.id === msg.walletId);
        if (!w) throw new Error("Wallet not found");
        w.name = msg.name.trim() || w.name;
        await setPub(pub);
        return ok(await snapshot());
      }

      case "removeWallet": {
        await verifyPassword(msg.password);
        const session = await requireSession();
        const pub = await getPub();
        if (pub.wallets.length <= 1) throw new Error("Cannot remove your only wallet");
        session.secrets.wallets = session.secrets.wallets.filter((w) => w.id !== msg.walletId);
        const removed = pub.wallets.find((w) => w.id === msg.walletId);
        pub.wallets = pub.wallets.filter((w) => w.id !== msg.walletId);
        if (pub.active?.walletId === msg.walletId) {
          const first = pub.wallets[0];
          pub.active = { walletId: first.id, pubkey: first.accounts[0].pubkey };
        }
        for (const [origin, site] of Object.entries(pub.connectedSites)) {
          if (removed?.accounts.some((a) => a.pubkey === site.pubkey)) delete pub.connectedSites[origin];
        }
        await saveSession(session.secrets, session.keyB64);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "setActive": {
        const pub = await getPub();
        const exists = pub.wallets.find((w) => w.id === msg.walletId)?.accounts.some((a) => a.pubkey === msg.pubkey);
        if (!exists) throw new Error("Account not found");
        pub.active = { walletId: msg.walletId, pubkey: msg.pubkey };
        await setPub(pub);
        broadcastEvent({ event: "accountChanged", data: { publicKey: msg.pubkey } });
        return ok(await snapshot());
      }

      case "setNetwork": {
        const pub = await getPub();
        pub.network = msg.network;
        if (msg.customRpcUrl !== undefined) pub.customRpcUrl = msg.customRpcUrl;
        await setPub(pub);
        return ok(await snapshot());
      }

      case "setAutoLock": {
        const pub = await getPub();
        pub.autoLockMinutes = msg.minutes;
        await setPub(pub);
        resetAutoLock(msg.minutes);
        return ok(await snapshot());
      }

      case "setFiat": {
        const pub = await getPub();
        pub.fiat = msg.fiat.toUpperCase().slice(0, 8);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "changePassword": {
        if (msg.newPassword.length < 8) throw new Error("New password must be at least 8 characters");
        await verifyPassword(msg.oldPassword); // throws "Incorrect password"
        const session = await requireSession();
        // Re-encrypt the whole vault under a brand-new salt+key derived from the new password.
        const { vault: blob, key } = await createEncryptedVault(msg.newPassword, JSON.stringify(session.secrets));
        await localSet(STORAGE_KEYS.vault, blob);
        await sessionSet(STORAGE_KEYS.session, { secrets: session.secrets, keyB64: await exportSessionKey(key) } satisfies SessionData);
        return ok(await snapshot());
      }

      case "addAddress": {
        const pub = await getPub();
        const address = msg.address.trim();
        const name = msg.name.trim() || `${address.slice(0, 4)}…${address.slice(-4)}`;
        const existing = pub.addressBook.find((e) => e.address === address);
        if (existing) existing.name = name;
        else pub.addressBook.push({ address, name });
        await setPub(pub);
        return ok(await snapshot());
      }

      case "removeAddress": {
        const pub = await getPub();
        pub.addressBook = pub.addressBook.filter((e) => e.address !== msg.address);
        await setPub(pub);
        return ok(await snapshot());
      }

      case "revealMnemonic": {
        await verifyPassword(msg.password);
        const session = await requireSession();
        const w = session.secrets.wallets.find((w) => w.id === msg.walletId);
        if (!w?.mnemonic) throw new Error("No recovery phrase for this wallet");
        return ok({ mnemonic: w.mnemonic });
      }

      case "revealPrivateKey": {
        await verifyPassword(msg.password);
        const session = await requireSession();
        const pub = await getPub();
        const kp = keypairFor(session.secrets, pub, msg.pubkey);
        return ok({ secretKey: secretKeyToBase58(kp) });
      }

      case "signAndSend": {
        const session = await requireSession();
        const pub = await getPub();
        if (!pub.active) throw new Error("No active account");
        const kp = keypairFor(session.secrets, pub, pub.active.pubkey);
        const signed = signTxBytes(kp, bytesFromB64(msg.txB64));
        const conn = await activeConnection();
        const sig = await conn.sendRawTransaction(signed, { skipPreflight: false, maxRetries: 3 });
        return ok({ signature: sig });
      }

      case "signMessageLocal": {
        const session = await requireSession();
        const pub = await getPub();
        if (!pub.active) throw new Error("No active account");
        const kp = keypairFor(session.secrets, pub, pub.active.pubkey);
        const sig = nacl.sign.detached(bytesFromB64(msg.messageB64), kp.secretKey);
        return ok({ signatureB58: bs58.encode(sig) });
      }

      case "revokeSite": {
        const pub = await getPub();
        delete pub.connectedSites[msg.origin];
        await setPub(pub);
        broadcastEvent({ event: "disconnect", data: { origin: msg.origin } });
        return ok(await snapshot());
      }

      case "getApproval": {
        const pending = pendingApprovals.get(msg.id);
        if (!pending) throw new Error("Request expired or already handled");
        return ok(pending.request);
      }

      case "resolveApproval":
        return resolveApproval(msg.id, msg.approved, msg.pubkey);

      case "resetWallet": {
        await clearAll();
        return ok(await snapshot());
      }

      case "dapp": {
        // Origin comes ONLY from the verified sender, never from message content.
        const origin = sender.origin;
        if (!origin || !/^https?:/.test(origin)) throw new Error("Invalid origin");
        return handleDapp(origin, msg.method, msg.params ?? {});
      }

      case "heartbeat": {
        const pub = await getPub();
        resetAutoLock(pub.autoLockMinutes);
        return ok(await snapshot());
      }

      default:
        throw new Error(`Unknown message: ${(msg as { type?: string }).type}`);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function ok<T>(data: T): BgResponse<T> {
  return { ok: true, data };
}

async function verifyPassword(password: string): Promise<void> {
  const vault = await localGet<EncryptedVault>(STORAGE_KEYS.vault);
  if (!vault) throw new Error("No wallet found");
  try {
    await cryptoVerifyPassword(password, vault);
  } catch {
    throw new Error("Incorrect password");
  }
}

// ---- dApp requests ----

async function handleDapp(origin: string, method: DappMethod, params: DappParams): Promise<BgResponse> {
  const pub = await getPub();
  const site = pub.connectedSites[origin];

  switch (method) {
    case "getNetwork":
      return ok({ network: pub.network });

    case "connectIfTrusted": {
      const session = await getSession();
      if (site && session) return ok({ publicKey: site.pubkey });
      return { ok: false, error: "Not trusted" };
    }

    case "connect": {
      const session = await getSession();
      if (site && session) return ok({ publicKey: site.pubkey });
      const result = await awaitApproval(origin, { kind: "connect" });
      return result;
    }

    case "disconnect": {
      delete pub.connectedSites[origin];
      await setPub(pub);
      return ok({});
    }

    case "signMessage": {
      if (!site) return { ok: false, error: "Not connected — call connect() first" };
      if (!params.messageB64) return { ok: false, error: "Missing message" };
      return awaitApproval(origin, { kind: "signMessage", messageB64: params.messageB64 });
    }

    case "signTransaction":
    case "signAllTransactions": {
      if (!site) return { ok: false, error: "Not connected — call connect() first" };
      if (!params.txsB64?.length) return { ok: false, error: "Missing transaction" };
      return awaitApproval(origin, { kind: "signTransaction", txsB64: params.txsB64, send: false });
    }

    case "signAndSendTransaction": {
      if (!site) return { ok: false, error: "Not connected — call connect() first" };
      if (!params.txsB64?.length) return { ok: false, error: "Missing transaction" };
      return awaitApproval(origin, { kind: "signTransaction", txsB64: params.txsB64, send: true });
    }

    default:
      return { ok: false, error: `Unsupported method: ${method}` };
  }
}

async function resolveApproval(id: string, approved: boolean, chosenPubkey?: string): Promise<BgResponse> {
  const pending = pendingApprovals.get(id);
  if (!pending) return { ok: false, error: "Request expired or already handled" };
  pendingApprovals.delete(id);
  const { request, resolve } = pending;

  if (!approved) {
    resolve({ ok: false, error: "User rejected the request" });
    return ok({ done: true });
  }

  try {
    const session = await requireSession();
    const pub = await getPub();

    if (request.payload.kind === "connect") {
      const pubkey = chosenPubkey ?? pub.active?.pubkey;
      if (!pubkey) throw new Error("No account available");
      
      const exists = pub.wallets.some((w) => w.accounts.some((a) => a.pubkey === pubkey));
      if (!exists) throw new Error("Account not found");

      pub.connectedSites[request.origin] = { pubkey, connectedAt: Date.now() };
      await setPub(pub);
      resolve({ ok: true, data: { publicKey: pubkey } });
      return ok({ done: true });
    }

    const site = pub.connectedSites[request.origin];
    if (!site) throw new Error("Site is no longer connected");
    const kp = keypairFor(session.secrets, pub, site.pubkey);

    if (request.payload.kind === "signMessage") {
      const sig = nacl.sign.detached(bytesFromB64(request.payload.messageB64), kp.secretKey);
      resolve({ ok: true, data: { signatureB58: bs58.encode(sig), publicKey: site.pubkey } });
      return ok({ done: true });
    }

    // signTransaction / signAndSendTransaction
    const signed = request.payload.txsB64.map((b64) => signTxBytes(kp, bytesFromB64(b64)));
    if (request.payload.send) {
      const conn = await activeConnection();
      const sig = await conn.sendRawTransaction(signed[0], { skipPreflight: false, maxRetries: 3 });
      resolve({ ok: true, data: { signature: sig, publicKey: site.pubkey } });
    } else {
      resolve({ ok: true, data: { signedTxsB64: signed.map(b64FromBytes), publicKey: site.pubkey } });
    }
    return ok({ done: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    resolve({ ok: false, error });
    return { ok: false, error };
  }
}
