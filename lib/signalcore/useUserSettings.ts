"use client";

import { useEffect, useState } from "react";

type Settings = Record<string, any>;

export function useUserSettings() {
  const [data, setData] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/user-settings", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      setData(json ?? {});
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return {
    data,
    loading,
    refresh,
  };
}