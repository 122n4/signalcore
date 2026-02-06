// lib/planning/store.ts
import { Plan, PlanVersion } from "@/lib/planning/types";

const KEY_ACTIVE = "signalcore_plan_active_v1";
const KEY_DRAFT = "signalcore_plan_draft_v1";
const KEY_VERSIONS = "signalcore_plan_versions_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsGet<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return safeParse<T>(localStorage.getItem(k), fallback);
}
function lsSet(k: string, v: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

export const planningStore = {
  getActive(): Plan | null {
    return lsGet<Plan | null>(KEY_ACTIVE, null);
  },
  setActive(plan: Plan | null) {
    lsSet(KEY_ACTIVE, plan);
  },

  getDraft(): Plan | null {
    return lsGet<Plan | null>(KEY_DRAFT, null);
  },
  setDraft(plan: Plan | null) {
    lsSet(KEY_DRAFT, plan);
  },

  listVersions(): PlanVersion[] {
    const v = lsGet<PlanVersion[]>(KEY_VERSIONS, []);
    return v.sort((a, b) => b.activatedAt - a.activatedAt).slice(0, 100);
  },
  pushVersion(ver: PlanVersion) {
    const v = lsGet<PlanVersion[]>(KEY_VERSIONS, []);
    lsSet(KEY_VERSIONS, [ver, ...v].slice(0, 100));
  },

  clearAll() {
    lsSet(KEY_ACTIVE, null);
    lsSet(KEY_DRAFT, null);
    lsSet(KEY_VERSIONS, []);
  },
};