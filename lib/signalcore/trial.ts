const DAY_MS = 24 * 60 * 60 * 1000;

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseIso(v: unknown) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

export function getTrialDaysConfig() {
  return clampInt(process.env.SC_TRIAL_DAYS, 1, 30, 7);
}

export type TrialState = {
  hasStarted: boolean;
  isActive: boolean;
  isExpired: boolean;
  days: number;
  startedAt: string | null;
  endsAt: string | null;
  remainingMs: number;
  remainingDays: number;
};

export function resolveTrialState(
  metadata: Record<string, unknown> | null | undefined,
  nowMs = Date.now()
): TrialState {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const days = clampInt((meta as any).trialDays, 1, 30, getTrialDaysConfig());
  const startedAt = parseIso((meta as any).trialStartedAt);
  const explicitEndsAt = parseIso((meta as any).trialEndsAt);
  const inferredEndsAt =
    startedAt && !explicitEndsAt ? new Date(new Date(startedAt).getTime() + days * DAY_MS).toISOString() : null;
  const endsAt = explicitEndsAt || inferredEndsAt;

  const hasStarted = Boolean(startedAt);
  const endMs = endsAt ? new Date(endsAt).getTime() : null;
  const isActive = Boolean(hasStarted && endMs != null && nowMs < endMs);
  const isExpired = Boolean(hasStarted && endMs != null && nowMs >= endMs);
  const remainingMs = isActive && endMs != null ? Math.max(0, endMs - nowMs) : 0;
  const remainingDays = remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0;

  return {
    hasStarted,
    isActive,
    isExpired,
    days,
    startedAt,
    endsAt,
    remainingMs,
    remainingDays,
  };
}

export function hasProAccessFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const isPaid = Boolean((meta as any).isPaid);
  const rawTrial = resolveTrialState(meta);
  const trial = isPaid
    ? {
        ...rawTrial,
        isActive: false,
        remainingMs: 0,
        remainingDays: 0,
      }
    : rawTrial;
  return {
    isPaid,
    trial,
    hasProAccess: isPaid || trial.isActive,
  };
}
