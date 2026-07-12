// chrome.storage wrappers. `local` persists to disk; `session` is memory-only
// (cleared when the browser closes) — decrypted secrets live ONLY in session.

export async function localGet<T>(key: string): Promise<T | undefined> {
  const out = await chrome.storage.local.get(key);
  return out[key] as T | undefined;
}

export async function localSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function localRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

export async function sessionGet<T>(key: string): Promise<T | undefined> {
  const out = await chrome.storage.session.get(key);
  return out[key] as T | undefined;
}

export async function sessionSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.session.set({ [key]: value });
}

export async function sessionRemove(key: string): Promise<void> {
  await chrome.storage.session.remove(key);
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
}
