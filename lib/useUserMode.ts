"use client";

import { useEffect, useState } from "react";

type Mode = "investing" | "trading";

export function useUserMode() {
  const [mode, setMode] = useState<Mode>("investing");
  const [loadingMode, setLoadingMode] = useState(true);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sc:userMode");
      if (v === "trading" || v === "investing") setMode(v);
    } catch {}
    setLoadingMode(false);
  }, []);

  async function saveMode(next: Mode) {
    setMode(next);
    try {
      window.localStorage.setItem("sc:userMode", next);
    } catch {}
    // Optional: persist to user_settings later
  }

  return { mode, loadingMode, saveMode };
}