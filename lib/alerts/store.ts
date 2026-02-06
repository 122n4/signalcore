// lib/alerts/store.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CreateUserAlertInput, UserAlert } from "@/lib/alerts/types";

export async function listAlerts(userId: string, limit = 50) {
  const supa = supabaseAdmin();

  const { data, error } = await supa
    .from("user_alerts")
    .select("*")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as UserAlert[];
}

export async function createAlert(userId: string, input: CreateUserAlertInput) {
  const supa = supabaseAdmin();

  const payload = {
    user_id: userId,
    type: input.type,
    title: input.title,
    message: input.message,
    severity: input.severity ?? "info",
    action: input.action ?? null,
    meta: input.meta ?? null,
    dedupe_key: input.dedupe_key ?? null,
  };

  // DEDUPE: if dedupe_key exists, we try insert and ignore conflicts.
  // Supabase supports upsert with onConflict, but because we used a partial unique index
  // we do a safe "insert then select" fallback.

  if (payload.dedupe_key) {
    const { data, error } = await supa
      .from("user_alerts")
      .upsert(payload, {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("*")
      .maybeSingle();

    // If it ignored, data may be null. Fetch existing.
    if (!data && !error) {
      const { data: existing, error: e2 } = await supa
        .from("user_alerts")
        .select("*")
        .eq("user_id", userId)
        .eq("dedupe_key", payload.dedupe_key)
        .maybeSingle();

      if (e2) throw new Error(e2.message);
      return existing as UserAlert;
    }

    if (error) throw new Error(error.message);
    return data as UserAlert;
  }

  // No dedupe: normal insert
  const { data, error } = await supa
    .from("user_alerts")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as UserAlert;
}

export async function dismissAlert(userId: string, alertId: string) {
  const supa = supabaseAdmin();

  const { data, error } = await supa
    .from("user_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserAlert | null;
}

export async function dismissAllAlerts(userId: string) {
  const supa = supabaseAdmin();

  const { error } = await supa
    .from("user_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("dismissed_at", null);

  if (error) throw new Error(error.message);
  return true;
}