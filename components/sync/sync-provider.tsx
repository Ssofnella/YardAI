"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  browserOutbox,
  enqueue,
  flushOutbox,
  type OutboxKind,
  type OutboxStore,
  type SyncResult,
} from "@/lib/client/outbox";

type SyncValue = {
  online: boolean;
  pending: number;
  failed: number;
  sending: boolean;
  enqueue: (kind: OutboxKind, body: Record<string, unknown>) => Promise<string>;
  flush: () => Promise<void>;
};

const SyncContext = createContext<SyncValue | null>(null);

async function postItem(record: { id: string; kind: OutboxKind; body: Record<string, unknown>; deviceTime: string }): Promise<SyncResult> {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [record] }),
  });
  if (!response.ok) throw new Error("sync failed");
  const body = (await response.json()) as { results?: SyncResult[] };
  return body.results?.[0] ?? { id: record.id, status: "rejected", reason: "Empty sync response" };
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<OutboxStore | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [sending, setSending] = useState(false);

  const store = useCallback(() => {
    if (!storeRef.current) storeRef.current = browserOutbox();
    return storeRef.current;
  }, []);

  const recount = useCallback(async () => {
    const rows = await store().list();
    setPending(rows.filter((row) => row.status === "pending").length);
    setFailed(rows.filter((row) => row.status === "needs_review").length);
  }, [store]);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOnline(false);
      await recount();
      return;
    }
    setSending(true);
    try {
      await flushOutbox(store(), (record) => postItem(record));
    } finally {
      setSending(false);
      await recount();
    }
  }, [recount, store]);

  const enqueueItem = useCallback(
    async (kind: OutboxKind, body: Record<string, unknown>) => {
      const id = typeof body.commandId === "string" ? body.commandId : crypto.randomUUID();
      await enqueue(store(), {
        id,
        kind,
        body: { ...body, commandId: id },
        deviceTime: new Date().toISOString(),
      });
      await recount();
      void flush();
      return id;
    },
    [flush, recount, store],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const persist = navigator.storage?.persist?.();
    if (persist) void persist;
    void recount();
    void flush();
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      void flush();
    }, 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [flush, recount]);

  const value = useMemo(
    () => ({ online, pending, failed, sending, enqueue: enqueueItem, flush }),
    [online, pending, failed, sending, enqueueItem, flush],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside SyncProvider");
  return value;
}
