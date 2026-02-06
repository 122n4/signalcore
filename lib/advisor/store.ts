// lib/advisor/store.ts
import { AdvisorState } from "@/lib/advisor/types";

const KEY = "signalcore_advisor_state_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set(value: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(value));
}

export const advisorStore = {
  get(): AdvisorState | null {
    if (typeof window === "undefined") return null;
    return safeParse<AdvisorState | null>(localStorage.getItem(KEY), null);
  },

  set(state: AdvisorState) {
    set(state);
  },

  clear() {
    set(null);
  },
};