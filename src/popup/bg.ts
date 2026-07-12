// Typed request helper: popup -> background service worker.

import type { BgRequest, BgResponse } from "../lib/types";

export async function bg<T = unknown>(msg: BgRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(msg)) as BgResponse<T> | undefined;
  if (!res) throw new Error(chrome.runtime.lastError?.message ?? "No response from wallet");
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
