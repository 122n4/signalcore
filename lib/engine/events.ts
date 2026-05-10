import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

export type EngineEventName =
  | "signal_generated"
  | "risk_blocked"
  | "order_sent"
  | "order_filled"
  | "order_failed"
  | "daily_receipt_created"
  | "daily_opened"
  | "action_rendered"
  | "day_closed"
  | "engine_loop_tick";

export type EngineEventStatus = "ok" | "warn" | "error";

type WriteEngineEventArgs = {
  userId: string;
  mode: AutopilotMode | string;
  event: EngineEventName;
  status?: EngineEventStatus;
  source?: string;
  executionId?: string;
  title?: string;
  details?: Record<string, unknown>;
};

function buildDefaultTitle(event: EngineEventName, status: EngineEventStatus) {
  if (event === "daily_receipt_created") return status === "ok" ? "Daily receipt created" : "Daily receipt failed";
  if (event === "daily_opened") return "Daily opened";
  if (event === "action_rendered") return "Action rendered";
  if (event === "day_closed") return status === "ok" ? "Day closed" : "Day close issue";
  if (event === "risk_blocked") return "Risk blocked execution";
  if (event === "signal_generated") return "Signal generated";
  if (event === "order_sent") return "Order sent";
  if (event === "order_filled") return "Order filled";
  if (event === "order_failed") return "Order failed";
  return status === "ok" ? "Engine loop tick" : "Engine loop issue";
}

export async function writeEngineEvent(args: WriteEngineEventArgs) {
  try {
    const nowIso = new Date().toISOString();
    const mode = normalizeMode(args.mode);
    const status: EngineEventStatus = args.status || "ok";
    const sb = getSupabaseAdmin();

    await sb.from("journal_entries").insert({
      user_id: args.userId,
      mode,
      type: "engine_event",
      title: args.title || buildDefaultTitle(args.event, status),
      details: {
        event: args.event,
        status,
        source: args.source || "engine",
        execution_id: args.executionId || null,
        ...(args.details || {}),
      },
      created_at: nowIso,
    } as Record<string, unknown>);
  } catch {
    // best-effort instrumentation
  }
}

export function createExecutionId(prefix = "exec") {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${r}`;
}
