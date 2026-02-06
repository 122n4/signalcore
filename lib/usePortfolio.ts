"use client";

import { useEffect, useState, useCallback } from "react";

export type PortfolioItem = {
  name: string;
  type:
    | "stock"
    | "etf"
    | "crypto"
    | "bond"
    | "cash"
    | "commodity"
    | "real_estate"
    | "forex"
    | "other";
  ticker?: string;
  weight?: number;
};

export function usePortfolio() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}