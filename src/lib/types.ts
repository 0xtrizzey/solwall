// Shared types between popup, background, and content scripts.

import type { SchemeId } from "./keyring";

export type NetworkId = "mainnet-beta" | "devnet" | "testnet" | "custom";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  rpcUrl: string;
}

export const NETWORKS: Record<Exclude<NetworkId, "custom">, NetworkConfig> = {
  // Public api.mainnet-beta.solana.com rejects browser/extension traffic with 403
  // (that's the "RPC busy" you saw — Phantom ships paid RPC). PublicNode is a free,
  // browser-CORS, no-key endpoint that works from an extension context.
  "mainnet-beta": { id: "mainnet-beta", label: "Mainnet", rpcUrl: "https://solana-rpc.publicnode.com" },
  devnet: { id: "devnet", label: "Devnet", rpcUrl: "https://api.devnet.solana.com" },
  testnet: { id: "testnet", label: "Testnet", rpcUrl: "https://api.testnet.solana.com" },
};

// ---- Vault (encrypted at rest) ----

export interface VaultAccountSecret {
  /** derivation index for mnemonic wallets; -1 for imported-key accounts */
  index: number;
  /** base58 64-byte secret key — only present for imported-key accounts */
  secretKey?: string;
}

export interface VaultWallet {
  id: string;
  type: "mnemonic" | "privateKey";
  /** derivation scheme for mnemonic wallets; undefined = bip44-change (default) */
  scheme?: SchemeId;
  mnemonic?: string;
  accounts: VaultAccountSecret[];
}

export interface VaultSecrets {
  wallets: VaultWallet[];
  connectedSites?: Record<string, { pubkey: string; connectedAt: number }>;
}

// ---- Public metadata (unencrypted, drives UI) ----

export interface AccountMeta {
  /** derivation index, or -1 for imported */
  index: number;
  name: string;
  pubkey: string;
}

export interface WalletMeta {
  id: string;
  name: string;
  type: "mnemonic" | "privateKey";
  accounts: AccountMeta[];
}

export interface AddressBookEntry {
  address: string;
  name: string;
}

export interface PublicState {
  wallets: WalletMeta[];
  active: { walletId: string; pubkey: string } | null;
  network: NetworkId;
  customRpcUrl: string;
  autoLockMinutes: number;
  /** ISO 4217 code for value display, e.g. "USD", "EUR". */
  fiat: string;
  addressBook: AddressBookEntry[];
  hideNfts: boolean;
}

export interface Snapshot {
  hasVault: boolean;
  locked: boolean;
  pub: PublicState;
  connectedSites?: Record<string, { pubkey: string; connectedAt: number }>;
}

// ---- dApp approval requests ----

export type ApprovalPayload =
  | { kind: "connect" }
  | { kind: "signMessage"; messageB64: string }
  | { kind: "signTransaction"; txsB64: string[]; send: boolean };

export interface ApprovalRequest {
  id: string;
  origin: string;
  payload: ApprovalPayload;
  createdAt: number;
}

// ---- Background message protocol ----

export type BgRequest =
  | { type: "getSnapshot" }
  | { type: "createVault"; password: string; walletName: string; mnemonic?: string; secretKey?: string; scheme?: SchemeId }
  | { type: "unlock"; password: string }
  | { type: "lock" }
  | { type: "addMnemonicWallet"; mnemonic: string; name: string; scheme?: SchemeId }
  | { type: "importPrivateKey"; secretKey: string; name: string }
  | { type: "addAccount"; walletId: string }
  | { type: "renameAccount"; walletId: string; pubkey: string; name: string }
  | { type: "renameWallet"; walletId: string; name: string }
  | { type: "removeWallet"; walletId: string; password: string }
  | { type: "setActive"; walletId: string; pubkey: string }
  | { type: "setNetwork"; network: NetworkId; customRpcUrl?: string }
  | { type: "setAutoLock"; minutes: number }
  | { type: "setFiat"; fiat: string }
  | { type: "setHideNfts"; hidden: boolean }
  | { type: "changePassword"; oldPassword: string; newPassword: string }
  | { type: "addAddress"; address: string; name: string }
  | { type: "removeAddress"; address: string }
  | { type: "revealMnemonic"; walletId: string; password: string }
  | { type: "revealPrivateKey"; walletId: string; pubkey: string; password: string }
  | { type: "signAndSend"; txB64: string }
  | { type: "signMessageLocal"; messageB64: string }
  | { type: "revokeSite"; origin: string }
  | { type: "getApproval"; id: string }
  | { type: "resolveApproval"; id: string; approved: boolean; pubkey?: string }
  | { type: "resetWallet" }
  | { type: "heartbeat" }
  // relayed from content script (dApp provider); origin is taken from the
  // verified message sender, never from the message body.
  | { type: "dapp"; method: DappMethod; params?: DappParams };

export type DappMethod =
  | "connect"
  | "connectIfTrusted"
  | "disconnect"
  | "signMessage"
  | "signTransaction"
  | "signAllTransactions"
  | "signAndSendTransaction"
  | "getNetwork";

export interface DappParams {
  messageB64?: string;
  txsB64?: string[];
}

export type BgResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export const STORAGE_KEYS = {
  vault: "solwall.vault",
  pub: "solwall.pub",
  session: "solwall.session",
} as const;
