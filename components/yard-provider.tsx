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
import type { YardState } from "@/lib/yard/state";

type YardContextValue = {
  state: YardState | null;
  asOf: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (url: string, body?: unknown) => Promise<Record<string, unknown>>;
};

const YardContext = createContext<YardContextValue | null>(null);

export function YardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<YardState | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef(0);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const body = (await response.json()) as YardState & { error?: string };
    if (!response.ok) throw new Error(body.error || "Could not load the yard");
    setState(body);
    setAsOf(body.clock.asOf);
    countRef.current = body.eventCount;
    setError(null);
  }, []);

  const mutate = useCallback(
    async (url: string, payload?: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Request failed");
      }
      await refresh();
      return body;
    },
    [refresh],
  );

  useEffect(() => {
    let stop = false;
    refresh()
      .catch((reason: unknown) => {
        if (!stop) setError(reason instanceof Error ? reason.message : "Could not load the yard");
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });

    const source = new EventSource("/api/stream");
    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { asOf?: string; eventCount?: number };
        if (message.asOf) setAsOf(message.asOf);
        if (typeof message.eventCount === "number" && message.eventCount !== countRef.current) {
          countRef.current = message.eventCount;
          void refresh().catch(() => undefined);
        }
      } catch {
        /* ignore a bad pulse */
      }
    };
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 8000);
    return () => {
      stop = true;
      source.close();
      window.clearInterval(poll);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ state, asOf, loading, error, refresh, mutate }),
    [state, asOf, loading, error, refresh, mutate],
  );

  return <YardContext.Provider value={value}>{children}</YardContext.Provider>;
}

export function useYard() {
  const value = useContext(YardContext);
  if (!value) throw new Error("useYard must be used inside YardProvider");
  return value;
}
