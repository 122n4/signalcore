"use client";

import { useCallback, useEffect, useState } from "react";

type DriftState = {
  status: "stable" | "improving" | "drifting" | "no_baseline" | "signed_out";
  delta: number | null;
  latest: any | null;
  prev: any | null;
};

const FALLBACK: DriftState = {
  status: "no_baseline",
  delta: null,
  latest: null,
  prev: null,
};

export function useDriftMonitor() {
  const [data, setData] = useState<DriftState>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drift", { cache: "no-store" });
      const json = await res.json();
      setData({
        status: json?.status ?? "no_baseline",
        delta: typeof json?.delta === "number" ? json.delta : null,
        latest: json?.latest ?? null,
        prev: json?.prev ?? null,
      });
    } catch {
      setData(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  const record = useCallback(async (snapshot: any) => {
    try {
      await fetch("/api/drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      // depois de gravar, refresca
      await refresh();
    } catch {
      // ignora
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { drift: data, loadingDrift: loading, refreshDrift: refresh, recordSnapshot: record };
}