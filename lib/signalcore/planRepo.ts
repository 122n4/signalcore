import type { AutopilotMode } from "@/lib/signalcore/modes";

export type PlanRow = Record<string, unknown>;

export const ACTIVE_PLAN_LOOKBACK_LIMIT = 25;

export function isPlanActiveRecord(plan: PlanRow | null | undefined) {
  if (!plan || typeof plan !== "object") return false;
  const status = String(plan.status ?? "").toLowerCase().trim();
  if (status) return status === "active";
  if (typeof plan.is_active === "boolean") return Boolean(plan.is_active);
  if (typeof plan.active === "boolean") return Boolean(plan.active);
  return Boolean(plan.id);
}

export function pickActivePlan(rows: Array<PlanRow | null | undefined> | null | undefined): PlanRow | null {
  const list = Array.isArray(rows) ? rows.filter((r): r is PlanRow => Boolean(r && typeof r === "object")) : [];
  return list.find((row) => isPlanActiveRecord(row)) ?? list[0] ?? null;
}

export async function loadActivePlanRows(args: {
  supabase: any;
  userId: string;
  mode: AutopilotMode | string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.round(Number(args.limit ?? ACTIVE_PLAN_LOOKBACK_LIMIT)) || ACTIVE_PLAN_LOOKBACK_LIMIT));
  const { data, error } = await args.supabase
    .from("plans")
    .select("*")
    .eq("user_id", args.userId)
    .eq("mode", args.mode)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as PlanRow[];
  return {
    rows,
    plan: pickActivePlan(rows),
    error: error ?? null,
  };
}

