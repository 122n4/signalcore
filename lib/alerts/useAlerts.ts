// lib/alerts/useAlerts.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateUserAlertInput, UserAlert } from "@/lib/alerts/types";

export function useAlerts() {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?limit=50", { cache: "no-store" });
      const data = await res.json().catch(() => []);
      setAlerts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (input: CreateUserAlertInput) => {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) return null;

    const created = (await res.json().catch(() => null)) as UserAlert | null;
    await refresh();
    return created;
  }, [refresh]);

  const dismiss = useCallback(async (id: string) => {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);

    await refresh();
  }, [refresh]);

  const dismissAll = useCallback(async () => {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ALL" }),
    }).catch(() => null);

    await refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    return { total: alerts.length, bySeverity };
  }, [alerts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    alerts,
    loading,
    counts,
    refresh,
    create,
    dismiss,
    dismissAll,
  };
}