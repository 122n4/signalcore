"use client";

import { useEffect, useState } from "react";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import {
  EMPTY_ACCESS_TRIAL,
  type AccessTrialState,
  loadAccessClientState,
} from "@/lib/signalcore/accessClientShared";
import {
  getEntitlementsForTier,
  type AccessTier,
} from "@/lib/signalcore/entitlements";

export function useAccess() {
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [billingPaid, setBillingPaid] = useState(false);
  const [trial, setTrial] = useState<AccessTrialState>(EMPTY_ACCESS_TRIAL);
  const [tier, setTier] = useState<AccessTier>("free");
  const [storedMode, setStoredMode] = useState<AutopilotMode>("trading");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const state = await loadAccessClientState();

        if (!alive) return;
        setIsPaid(state.hasProAccess);
        setBillingPaid(state.billingPaid);
        setTrial(state.trial);
        setTier(state.tier);
        setStoredMode(state.storedMode);
      } catch {
        if (!alive) return;
        setIsPaid(false);
        setBillingPaid(false);
        setTrial(EMPTY_ACCESS_TRIAL);
        setTier("free");
        setStoredMode("trading");
      } finally {
        if (!alive) return;
        setLoadingAccess(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return {
    isPaid: billingPaid,
    hasProAccess: isPaid,
    billingPaid,
    trial,
    tier,
    entitlements: getEntitlementsForTier(tier),
    storedMode,
    loadingAccess,
  };
}
