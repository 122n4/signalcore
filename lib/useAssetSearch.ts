"use client";

import { useEffect, useState } from "react";

export type AssetSearchRow = {
  symbol: string;
  description: string;
  type: string;
};

export function useAssetSearch(query: string) {
  const [results, setResults] = useState<AssetSearchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = query.trim();

    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/assets/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        setResults(Array.isArray(json?.results) ? json.results : []);
      } catch {
        if (!alive) return;
        setResults([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  return { results, loading };
}