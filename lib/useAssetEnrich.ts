"use client";

import { useEffect, useState } from "react";

export type AssetEnrich = {
  symbol: string;
  name: string | null;
  country: string | null;
  currency: string | null;
  exchange: string | null;
  industry: string | null;
  sector: string | null;
  marketCap: number | null;
  price: number | null;
  updatedAt: string;
  source: "finnhub";
};

export function useAssetEnrich(symbol: string | null) {
  const [data, setData] = useState<AssetEnrich | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const s = (symbol ?? "").trim();
    if (!s) {
      setData(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/assets/enrich?symbol=${encodeURIComponent(s)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        setData(res.ok ? (json as AssetEnrich) : null);
      } catch {
        if (!alive) return;
        setData(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [symbol]);

  return { data, loading };
}