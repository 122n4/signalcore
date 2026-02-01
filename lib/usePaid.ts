"use client";

import { useEffect, useState } from "react";

type PaidState = {
  isPaid: boolean;
  loadingPaid: boolean;
  isAuthenticated: boolean;
};

export function usePaid(): PaidState {
  const [isPaid, setIsPaid] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const data = await res.json();

        if (!alive) return;

        setIsAuthenticated(Boolean(data?.isAuthenticated));
        setIsPaid(Boolean(data?.isPaid));
      } catch {
        if (!alive) return;
        setIsAuthenticated(false);
        setIsPaid(false);
      } finally {
        if (!alive) return;
        setLoadingPaid(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { isPaid, loadingPaid, isAuthenticated };
}