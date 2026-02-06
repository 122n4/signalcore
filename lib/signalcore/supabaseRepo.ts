// lib/signalcore/supabaseRepo.ts

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlanLike, PortfolioSnapshot, RiskPosture } from "@/lib/signalcore/types";

function asRiskPosture(x: any): RiskPosture {
  if (x === "conservative" || x === "balanced" || x === "growth") return x;
  return "balanced";
}

export type UserSettingsRow = {
  user_id: string;
  goal_amount: number | null;
  goal_currency: string | null;
  goal_timeframe_months: number | null;
  risk_profile: string | null;
  monthly_contribution: number | null;
  language: string | null;
  updated_at?: string | null;
};

export async function readUserSettings(userId: string): Promise<UserSettingsRow | null> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any) ?? null;
}

export async function upsertUserSettings(userId: string, patch: Partial<UserSettingsRow>) {
  const sb = supabaseAdmin();

  const row = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("user_settings")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as any;
}

export async function readPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot | null> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("portfolios")
    .select("snapshot")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.snapshot) return null;

  return data.snapshot as PortfolioSnapshot;
}

export async function upsertPortfolioSnapshot(userId: string, snapshot: PortfolioSnapshot) {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("portfolios")
    .upsert(
      {
        user_id: userId,
        snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("user_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export function planFromSettings(settings: UserSettingsRow | null): PlanLike {
  return {
    id: `plan_${settings?.user_id ?? "anon"}`,
    name: "SignalCore Plan",
    targetValue: settings?.goal_amount ?? 50000,
    monthlyContribution: settings?.monthly_contribution ?? 0,
    riskPosture: asRiskPosture(settings?.risk_profile),
    buckets: [
      { id: "core", name: "Core", targetPct: 65 },
      { id: "satellite", name: "Satellite", targetPct: 20 },
      { id: "hedge", name: "Hedge", targetPct: 10 },
      { id: "cash", name: "Cash", targetPct: 5 },
    ],
  };
}