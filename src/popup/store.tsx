import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Snapshot } from "../lib/types";
import { bg } from "./bg";

// ---- hash router ----

export function useRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const nav = useCallback((r: string) => {
    location.hash = r;
  }, []);
  return [route, nav];
}

// ---- toasts ----

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

// ---- wallet store ----

interface Store {
  snap: Snapshot | null;
  refresh: () => Promise<Snapshot | null>;
  toasts: Toast[];
  toast: (message: string, kind?: Toast["kind"]) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const s = await bg<Snapshot>({ type: "getSnapshot" });
      setSnap(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const value = useMemo(() => ({ snap, refresh, toasts, toast }), [snap, refresh, toasts, toast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

/** Copy text + toast feedback. */
export function useCopy() {
  const { toast } = useStore();
  return useCallback(
    async (text: string, label = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        toast(label, "success");
      } catch {
        toast("Copy failed", "error");
      }
    },
    [toast],
  );
}
