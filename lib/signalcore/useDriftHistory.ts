"use client";

import { useEffect, useState } from "react";

export type DriftItem = {
  id: string;
  created_at: string;
  regime: string | null;
  horizon: string | null;
  risk: string | null;
  coherence_overall: number | null;
  coherence_breakdown: any;
  drift_delta: number | null;
  drift_status: string | null;
  goal: any;
};

export function useDriftHistory(limit = 20) {
  const [items, setItems] = useState<DriftItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/drift/history?limit=${limit}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        setItems(Array.isArray(json?.items) ? json.items : []);
      } catch {
        if (!alive) return;
        setItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [limit]);

  return { items, loading };
}