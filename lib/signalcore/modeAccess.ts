import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import { enforceModeAccess } from "@/lib/signalcore/access";

export type ResolvedModeAccess = {
  ok: boolean;
  mode: AutopilotMode;
  allowedMode: AutopilotMode;
  hasProAccess: boolean;
  status: number;
  error: string | null;
};

export async function resolveModeAccess(args: {
  supabase: any;
  userId: string;
  requestedMode: unknown;
  hasProAccess?: boolean;
}): Promise<ResolvedModeAccess> {
  const mode = normalizeMode(args.requestedMode) as AutopilotMode;
  const access = await enforceModeAccess({
    supabase: args.supabase,
    userId: args.userId,
    requestedMode: mode,
    hasProAccess: args.hasProAccess,
  });

  if (access.ok === false) {
    return {
      ok: false,
      mode,
      allowedMode: access.allowedMode,
      hasProAccess: access.hasProAccess,
      status: access.status,
      error: access.error,
    };
  }

  return {
    ok: true,
    mode,
    allowedMode: access.allowedMode,
    hasProAccess: access.hasProAccess,
    status: 200,
    error: null,
  };
}
