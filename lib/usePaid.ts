"use client";

import { useCallback, useEffect, useState } from "react";

type MePayload = {
  isAuthenticated?: boolean;
  isPaid?: boolean;
};

export function usePaid() {
  const [isPaid, setIsPaid] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

  const refresh = useCallback(async () => {
    setLoadingPaid(true);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data: MePayload = await res.json();
      setIsAuthenticated(Boolean(data?.isAuthenticated));
      setIsPaid(Boolean(data?.isPaid));
    } catch {
      setIsAuthenticated(false);
      setIsPaid(false);
    } finally {
      setLoadingPaid(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isPaid, isAuthenticated, loadingPaid, refresh };
}