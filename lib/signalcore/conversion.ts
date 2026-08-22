import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

type ConversionEventInput = {
  userId: string;
  event: string;
  mode?: string | null;
  source?: string | null;
  details?: Record<string, unknown> | null;
};

function cleanEvent(v: unknown) {
  return String(v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 64);
}

function cleanSource(v: unknown) {
  const s = String(v || "").trim().slice(0, 80);
  return s || null;
}

function safeDetails(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

export async function logConversionEvent(input: ConversionEventInput) {
  try {
    const userId = String(input.userId || "").trim();
    const event = cleanEvent(input.event);
    if (!userId || !event) return { ok: false as const, reason: "invalid_input" as const };

    const mode = normalizeMode(input.mode || "trading") as AutopilotMode;
    const source = cleanSource(input.source);
    const details = safeDetails(input.details);

    const row = {
      user_id: userId,
      mode,
      type: "conversion_event",
      title: `Conversion: ${event}`,
      details: {
        event,
        source,
        ...details,
      },
      created_at: new Date().toISOString(),
    };

    const sb = getSupabaseAdmin();
    const { error } = await sb.from("journal_entries").insert(row as any);
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, reason: e?.message || "conversion_event_failed" };
  }
}
