// lib/signalcore/usePortfolioItems.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AutopilotMode } from "@/lib/signalcore/modes";

type ApiResp = {
  ok: boolean;
  mode: AutopilotMode;
  items: any[];
  snapshot: any | null;
  updatedAt: string | null;
  error?: string;
  message?: string;
};

export function usePortfolioItems(mode: AutopilotMode) {
  const [items, setItems] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const endpoint = useMemo(
    () => `/api/portfolio-items?mode=${encodeURIComponent(String(mode))}`,
    [mode]
  );

  const fetchNow = useCallback(async () => {
    reqIdRef.current += 1;
    const myId = reqIdRef.current;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(endpoint, { cache: "no-store", signal: ac.signal });
      const data: ApiResp = await res.json().catch(() => ({} as any));
      if (myId !== reqIdRef.current) return;

      if (!data?.ok) throw new Error(data?.message ?? data?.error ?? "Failed to load portfolio");

      setItems(Array.isArray(data.items) ? data.items : []);
      setSnapshot(data.snapshot ?? null);
      setUpdatedAt(data.updatedAt ?? null);
      setLoading(false);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setItems([]);
      setSnapshot(null);
      setUpdatedAt(null);
      setLoading(false);
      setError(e?.message ?? "Failed to load portfolio");
    }
  }, [endpoint]);

  useEffect(() => {
    fetchNow();
    return () => abortRef.current?.abort();
  }, [fetchNow, mode]);

  return { items, snapshot, updatedAt, loading, error, refresh: fetchNow };
}