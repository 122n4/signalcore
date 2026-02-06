"use client";

import { useEffect, useState } from "react";
import type { MarketRegime } from "./types";

const FALLBACK: MarketRegime = "Neutral / Range-bound";

function normalizeRegime(input: unknown): MarketRegime {
  const v = String(input ?? "").trim();
  if (v === "Risk-on" || v === "Risk-off" || v === "Transitional" || v === "Neutral / Range-bound") return v;
  const lower = v.toLowerCase();
  if (lower.includes("risk on")) return "Risk-on";
  if (lower.includes("risk off")) return "Risk-off";
  if (lower.includes("transition")) return "Transitional";
  return FALLBACK;
}

export function useMarketRegime() {
  const [regime, setRegime] = useState<MarketRegime>(FALLBACK);
  const [loadingRegime, setLoadingRegime] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/market-regime", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setRegime(normalizeRegime(data?.regime));
      } catch {
        if (!alive) return;
        setRegime(FALLBACK);
      } finally {
        if (!alive) return;
        setLoadingRegime(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { regime, loadingRegime };
}