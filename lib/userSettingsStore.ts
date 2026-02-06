import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UserSettingsRow = {
  user_id: string;
  goal_amount: number | null;
  goal_currency: string | null;
  goal_timeframe_months: number | null;
  risk_profile: string | null;
  horizon: string | null;
  monthly_contribution: number | null;
  language: string | null;
  updated_at: string | null;
};

const DEFAULTS = {
  goal_amount: null,
  goal_currency: "EUR",
  goal_timeframe_months: null,
  risk_profile: "Balanced",
  horizon: "Long",
  monthly_contribution: null,
  language: "en",
};

export async function getUserSettings(userId: string) {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("user_settings")
    .select(
      "user_id,goal_amount,goal_currency,goal_timeframe_months,risk_profile,horizon,monthly_contribution,language,updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    ...(DEFAULTS as any),
    ...(data ?? {}),
  } as Omit<UserSettingsRow, "user_id"> & { user_id?: string };
}

export async function saveUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsRow, "user_id" | "updated_at">>
) {
  // Merge with existing so PATCH-like behavior is safe
  const current = await getUserSettings(userId);

  const merged = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        ...merged,
      },
      { onConflict: "user_id" }
    )
    .select(
      "user_id,goal_amount,goal_currency,goal_timeframe_months,risk_profile,horizon,monthly_contribution,language,updated_at"
    )
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    ...(DEFAULTS as any),
    ...(data ?? merged),
  };
}