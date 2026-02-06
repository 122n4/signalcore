"use client";

import { useCallback, useEffect, useState } from "react";

export type Horizon = "Short" | "Medium" | "Long";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type UserSettings = {
  goal_amount: number | null;
  goal_currency: "EUR" | "USD" | null;
  goal_timeframe_months: number | null;
  risk_profile: RiskProfile | null;
  horizon: Horizon | null;
};

export function useUserSettings() {
  const [data, setData] = useState<UserSettings>({
    goal_amount: null,
    goal_currency: "EUR",
    goal_timeframe_months: null,
    risk_profile: "Balanced",
    horizon: "Long",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/user-settings", { cache: "no-store" });
      const json = await res.json();

      // API pode devolver nulls — mantemos defaults quando vier undefined
      setData((prev) => ({
        ...prev,
        ...json,
      }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (patch: Partial<UserSettings>) => {
    try {
      setSaving(true);
      setError(null);

      // otimista (UI instantânea)
      setData((prev) => ({ ...prev, ...patch }));

      // manda patch (não manda o objeto todo)
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? "Failed to save");
      }

      // opcional: refrescar a fonte de verdade
      const updated = await res.json().catch(() => null);
      if (updated && typeof updated === "object") {
        setData((prev) => ({ ...prev, ...updated }));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, save, loading, saving, error, reload: load };
}