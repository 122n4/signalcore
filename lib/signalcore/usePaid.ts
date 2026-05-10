"use client";

import { useEffect, useState } from "react";
import { EMPTY_ACCESS_TRIAL, type AccessTrialState, loadAccessClientState } from "@/lib/signalcore/accessClientShared";
export type { AccessTrialState } from "@/lib/signalcore/accessClientShared";

export function usePaid() {
  const [isPaid, setIsPaid] = useState(false);
  const [isBillingActive, setIsBillingActive] = useState(false);
  const [trial, setTrial] = useState<AccessTrialState>(EMPTY_ACCESS_TRIAL);
  const [loadingPaid, setLoadingPaid] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const state = await loadAccessClientState();
        if (!alive) return;
        setIsBillingActive(state.billingPaid);
        setIsPaid(state.hasProAccess);
        setTrial(state.trial);
      } catch {
        if (!alive) return;
        setIsPaid(false);
        setIsBillingActive(false);
        setTrial(EMPTY_ACCESS_TRIAL);
      } finally {
        if (!alive) return;
        setLoadingPaid(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return {
    isPaid,
    hasProAccess: isPaid,
    isBillingActive,
    trial,
    loadingPaid,
  };
}
