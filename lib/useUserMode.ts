"use client";

import { useEffect, useState } from "react";

export type UserMode = "investing" | "trading";

export function useUserMode() {
  const [mode, setMode] = useState<UserMode>("investing");
  const [loadingMode, setLoadingMode] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/user-mode", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setMode(data?.mode === "trading" ? "trading" : "investing");
      } catch {
        if (!alive) return;
        setMode("investing");
      } finally {
        if (!alive) return;
        setLoadingMode(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function saveMode(next: UserMode) {
    setMode(next);
    await fetch("/api/user-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    }).catch(() => null);
  }

  return { mode, loadingMode, saveMode };
}