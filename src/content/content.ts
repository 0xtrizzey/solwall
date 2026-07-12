// Content script: injects the in-page provider and relays messages between
// the page (window.postMessage) and the background service worker.

export {}; // module scope — avoids global collisions with inpage.ts

const CHANNEL_REQ = "solwall#request";
const CHANNEL_RES = "solwall#response";
const CHANNEL_EVT = "solwall#event";

// Inject the provider as early as possible.
(function inject() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inpage.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn("SOLWALL: provider injection failed", e);
  }
})();

// Page -> background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL_REQ) return;
  chrome.runtime.sendMessage(
    { type: "dapp", method: data.method, params: data.params },
    (response) => {
      const payload = chrome.runtime.lastError
        ? { ok: false, error: chrome.runtime.lastError.message ?? "Extension unavailable" }
        : response;
      window.postMessage({ channel: CHANNEL_RES, id: data.id, payload }, window.location.origin);
    },
  );
});

// Background -> page (events: accountChanged, disconnect)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.solwallEvent) {
    window.postMessage({ channel: CHANNEL_EVT, payload: msg.solwallEvent }, window.location.origin);
  }
});
