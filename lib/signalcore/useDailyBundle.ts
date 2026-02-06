// lib/signalcore/useDailyBundle.ts

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyBundle } from "@/lib/signalcore/types";

type Status = "idle" | "loading" | "ready" | "error";

export function useDailyBundle() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<DailyBundle | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/daily-bundle", { method: "GET" });
      const txt = await res.text().catch(() => "");
      if (!res.ok) {
        setStatus("error");
        setError(txt || `HTTP ${res.status}`);
        return;
      }

      const data = JSON.parse(txt) as DailyBundle;
      setBundle(data);
      setStatus("ready");
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Unknown error");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const derived = useMemo(() => bundle?.derived ?? null, [bundle]);
  const portfolio = useMemo(() => bundle?.portfolio ?? null, [bundle]);
  const plan = useMemo(() => bundle?.plan ?? null, [bundle]);

  return {
    status,
    error,
    bundle,
    derived,
    portfolio,
    plan,
    refresh,
  };
}