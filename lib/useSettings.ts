"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Horizon = "Short" | "Medium" | "Long";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type UserSettings = {
  goal_amount: number | null;
  goal_currency: "EUR" | "USD" | null;
  goal_timeframe_months: number | null;
  risk_profile: RiskProfile | null;
  horizon: Horizon | null;
};

const DEFAULTS: UserSettings = {
  goal_amount: null,
  goal_currency: "EUR",
  goal_timeframe_months: null,
  risk_profile: null,
  horizon: null,
};

function normalizeCurrency(v: any): "EUR" | "USD" {
  return v === "USD" ? "USD" : "EUR";
}

function normalizeHorizon(v: any): Horizon | null {
  return v === "Short" || v === "Medium" || v === "Long" ? v : null;
}

function normalizeRisk(v: any): RiskProfile | null {
  return v === "Conservative" || v === "Balanced" || v === "Aggressive" ? v : null;
}

function normalizeNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePayload(json: any): UserSettings {
  return {
    goal_amount: normalizeNumber(json?.goal_amount),
    goal_currency: normalizeCurrency(json?.goal_currency),
    goal_timeframe_months: normalizeNumber(json?.goal_timeframe_months),
    risk_profile: normalizeRisk(json?.risk_profile),
    horizon: normalizeHorizon(json?.horizon),
  };
}

export function useUserSettings() {
  const [data, setData] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mantém sempre o "último estado" para evitar stale closures no save()
  const dataRef = useRef<UserSettings>(DEFAULTS);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user-settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/user-settings failed (${res.status})`);

      const json = await res.json();
      const normalized = normalizePayload(json);

      setData((prev) => ({ ...prev, ...normalized }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (patch: Partial<UserSettings>) => {
    setSaving(true);
    setError(null);

    // monta o next a partir do estado mais recente
    const next: UserSettings = {
      ...dataRef.current,
      ...patch,
    };

    // normaliza (evita enviar lixo)
    const normalized: UserSettings = {
      goal_amount: normalizeNumber(next.goal_amount),
      goal_currency: normalizeCurrency(next.goal_currency),
      goal_timeframe_months: normalizeNumber(next.goal_timeframe_months),
      risk_profile: normalizeRisk(next.risk_profile),
      horizon: normalizeHorizon(next.horizon),
    };

    // UI snappy: atualiza já
    setData(normalized);

    try {
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });

      if (!res.ok) throw new Error(`POST /api/user-settings failed (${res.status})`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings");
      // se falhar, não fazemos rollback automático (evita “piscadas”),
      // mas podes chamar load() manualmente se quiseres.
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await load();
    })();

    return () => {
      alive = false;
    };
  }, [load]);

  return useMemo(() => {
    return { data, save, load, loading, saving, error };
  }, [data, loading, saving, error, load, save]);
}