// Browser dev harness: mocks just enough of the chrome.* API that the popup
// runs as a normal web page, calling the real background handlers in-process.
// NEVER shipped in the extension build — dev.html only.

type Store = Record<string, unknown>;

function makeStorage(read: () => Store, write: (s: Store) => void) {
  return {
    async get(key?: string | string[]) {
      const all = read();
      if (key == null) return { ...all };
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]]));
    },
    async set(items: Store) {
      write({ ...read(), ...items });
    },
    async remove(key: string | string[]) {
      const all = { ...read() };
      for (const k of Array.isArray(key) ? key : [key]) delete all[k];
      write(all);
    },
    async clear() {
      write({});
    },
  };
}

const LS_KEY = "solwall-dev-local";
let sessionMem: Store = {};

const local = makeStorage(
  () => JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"),
  (s) => localStorage.setItem(LS_KEY, JSON.stringify(s)),
);
const session = makeStorage(
  () => sessionMem,
  (s) => {
    sessionMem = s;
  },
);

export function installChromeShim(handle: (msg: unknown, sender: { origin?: string; trusted?: boolean }) => Promise<unknown>) {
  (globalThis as any).chrome = {
    storage: { local, session },
    runtime: {
      id: "solwall-dev",
      lastError: undefined,
      getURL: (p: string) => p,
      // Dev harness has no content scripts; all popup calls are first-party.
      sendMessage: (msg: unknown) => handle(msg, { origin: location.origin, trusted: true }),
      onMessage: { addListener() {} },
    },
    alarms: {
      create() {},
      clear() {},
      onAlarm: { addListener() {} },
    },
    tabs: {
      query(_q: unknown, cb: (tabs: unknown[]) => void) {
        cb([]);
      },
      sendMessage() {},
    },
    windows: {
      create({ url }: { url: string }) {
        const hash = url.split("#")[1];
        if (hash) location.hash = hash;
      },
    },
  };
  console.info(`%cSOLWALL dev harness — storage key "${LS_KEY}", session in memory (reload = locked)`, "color:#f5b843");
}
