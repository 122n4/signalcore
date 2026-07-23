import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const INVESTING_SHARED_BROKER_SYNC_BLOCKED = "investing_shared_broker_sync_blocked" as const;

export class InvestingSharedBrokerSyncBlockedError extends Error {
  readonly code = INVESTING_SHARED_BROKER_SYNC_BLOCKED;

  constructor() {
    super(INVESTING_SHARED_BROKER_SYNC_BLOCKED);
    this.name = "InvestingSharedBrokerSyncBlockedError";
  }
}

export type EffectiveSharedBrokerMode = {
  mode: AutopilotMode;
  requestedMode: AutopilotMode | null;
  storedMode: AutopilotMode | null;
  spoofed: boolean;
  failClosed: boolean;
};

function requestedModeOrNull(value: unknown): AutopilotMode | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return normalizeMode(value);
}

export function isInvestingSharedBrokerBlocked(mode: unknown) {
  return normalizeMode(mode) === "investing";
}

export function assertSharedBrokerSyncAllowed(mode: unknown): asserts mode is "trading" {
  if (isInvestingSharedBrokerBlocked(mode)) {
    throw new InvestingSharedBrokerSyncBlockedError();
  }
}

export async function resolveEffectiveSharedBrokerMode(args: {
  userId: string;
  requestedMode?: unknown;
  supabase?: any;
}): Promise<EffectiveSharedBrokerMode> {
  const requestedMode = requestedModeOrNull(args.requestedMode);
  const supabase = args.supabase ?? getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("active_mode")
      .eq("user_id", args.userId)
      .maybeSingle();

    if (error) {
      return {
        mode: "investing",
        requestedMode,
        storedMode: null,
        spoofed: requestedMode === "trading",
        failClosed: true,
      };
    }

    const storedMode = data?.active_mode == null ? null : normalizeMode(data.active_mode);
    const spoofed = requestedMode !== null && storedMode !== null && requestedMode !== storedMode;

    // There are only two modes. Any mismatch necessarily attempts to cross the
    // Investing/Trading boundary, so it must fail closed as Investing.
    const mode = spoofed ? "investing" : storedMode ?? requestedMode ?? "investing";
    return { mode, requestedMode, storedMode, spoofed, failClosed: false };
  } catch {
    return {
      mode: "investing",
      requestedMode,
      storedMode: null,
      spoofed: requestedMode === "trading",
      failClosed: true,
    };
  }
}
