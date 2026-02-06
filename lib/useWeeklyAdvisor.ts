"use client";

import { useEffect, useState } from "react";

export type WeeklyAdvisorData = {
  title: string;
  updatedAt: string;
  posture: "Risk-on" | "Risk-off" | "Neutral";
  regime: "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
  summary: string;
  bullets: string[];
  watchlist: Array<{ label: string; note: string }>;
};

export function useWeeklyAdvisor() {
  const [data, setData] = useState<WeeklyAdvisorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/weekly-advisor", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;

        setData(res.ok ? (json as WeeklyAdvisorData) : null);
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
  }, []);

  return { data, loading };
}