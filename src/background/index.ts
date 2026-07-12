// MV3 service worker entry — wires chrome events to the pure handler module and
// enforces the sender-trust boundary (defense-in-depth): privileged wallet
// operations only from our own extension pages; dApp operations only from web
// content scripts. A compromised content script cannot reach the vault.

import { handleMessage, lockNow } from "./handlers";

const EXT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, ""); // chrome-extension://<id>

// Every message type that touches secrets, settings, or the vault. These are
// only ever sent by the popup or the approval window.
const PRIVILEGED = new Set<string>([
  "getSnapshot", "createVault", "unlock", "lock", "addMnemonicWallet", "importPrivateKey",
  "addAccount", "renameAccount", "renameWallet", "removeWallet", "setActive", "setNetwork",
  "setAutoLock", "setFiat", "changePassword", "addAddress", "removeAddress",
  "revealMnemonic", "revealPrivateKey", "signAndSend", "signMessageLocal",
  "revokeSite", "getApproval", "resolveApproval", "resetWallet",
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const senderOrigin = sender.origin ?? (sender.url ? safeOrigin(sender.url) : undefined);
  const fromExtension = senderOrigin === EXT_ORIGIN;
  const type = (msg as { type?: string } | null)?.type;

  if (PRIVILEGED.has(type ?? "") && !fromExtension) {
    sendResponse({ ok: false, error: "unauthorized" });
    return false;
  }
  if (type === "dapp" && fromExtension) {
    sendResponse({ ok: false, error: "bad channel" });
    return false;
  }

  const origin = type === "dapp" ? senderOrigin : EXT_ORIGIN;
  handleMessage(msg, { origin, trusted: fromExtension })
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true; // keep the channel open for the async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "solwall-autolock") void lockNow();
});

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
