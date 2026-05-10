"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";

const LS_KEY = "sc_active_mode_v1";

function readModeFromUrl(): AutopilotMode | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const mode = sp.get("mode");
  if (!mode) return null;
  return normalizeMode(mode);
}

function readModeFromLS(): AutopilotMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return normalizeMode(raw);
  } catch {
    return null;
  }
}

function writeModeToLS(mode: AutopilotMode) {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    // ignore
  }
}

function writeModeToUrl(mode: AutopilotMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("mode", mode);
  window.history.replaceState({}, "", url.toString());
}

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function useAutopilotMode() {
  const [loading, setLoading] = useState(true);
  const boot = useMemo<AutopilotMode>(() => readModeFromUrl() || readModeFromLS() || "investing", []);
  const [mode, setMode] = useState<AutopilotMode>(boot);

  useEffect(() => {
    const local = readModeFromUrl() || readModeFromLS() || mode || "investing";
    setMode(local);
    writeModeToLS(local);
    writeModeToUrl(local);

    (async () => {
      try {
        const [me, us] = await Promise.all([fetchJSON("/api/me"), fetchJSON("/api/user-settings")]);
        const hasProAccess = Boolean(me.data?.hasProAccess ?? me.data?.isPaid);
        const serverMode = us.ok ? normalizeMode(us.data?.settings?.active_mode) : null;
        const forced = readModeFromUrl();

        // Investing is free forever and trading is open in discovery mode,
        // so we can honor either the forced mode or the last stored mode.
        const finalMode = ((forced || serverMode || local || (hasProAccess ? "trading" : "investing")) as AutopilotMode);

        setMode(finalMode);
        writeModeToLS(finalMode);
        writeModeToUrl(finalMode);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveMode = useCallback(async (nextRaw: unknown) => {
    const next = normalizeMode(nextRaw);

    setMode(next);
    writeModeToLS(next);
    writeModeToUrl(next);

    try {
      const response = await fetchJSON("/api/user-settings", {
        method: "POST",
        body: JSON.stringify({ active_mode: next }),
      });

      if (!response.ok && response.status === 402 && response.data?.allowedMode) {
        const allowed = normalizeMode(response.data.allowedMode) as AutopilotMode;
        setMode(allowed);
        writeModeToLS(allowed);
        writeModeToUrl(allowed);
        return { ok: false, upgradeRequired: true, allowedMode: allowed } as const;
      }

      return { ok: true } as const;
    } catch {
      return { ok: false } as const;
    }
  }, []);

  return { loading, mode, setActiveMode };
}
