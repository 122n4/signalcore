"use client";

import { useEffect, useState } from "react";

export function usePaid() {
  const [isPaid, setIsPaid] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setIsPaid(Boolean(data?.isPaid));
      } catch {
        if (!alive) return;
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

  return { isPaid, loadingPaid };
}