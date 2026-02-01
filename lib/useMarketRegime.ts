"use client";

import { useEffect, useState } from "react";

export type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";

const FALLBACK: Regime = "Neutral / Range-bound";

function normalizeRegime(input: unknown): Regime {
  const v = String(input ?? "").trim();

  if (v === "Risk-on") return "Risk-on";
  if (v === "Risk-off") return "Risk-off";
  if (v === "Transitional") return "Transitional";
  if (v === "Neutral / Range-bound") return "Neutral / Range-bound";

  // tolerância se API devolver outros nomes
  const lower = v.toLowerCase();
  if (lower.includes("risk on")) return "Risk-on";
  if (lower.includes("risk off")) return "Risk-off";
  if (lower.includes("transition")) return "Transitional";
  if (lower.includes("neutral") || lower.includes("range")) return "Neutral / Range-bound";

  return FALLBACK;
}

export function useMarketRegime() {
  const [regime, setRegime] = useState<Regime>(FALLBACK);
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