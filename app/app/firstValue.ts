export type FirstValueSetupKey =
  | "risk_profile"
  | "horizon"
  | "goal_type"
  | "goal_target_value";

export type FirstValueRailState =
  | { kind: "hidden" }
  | {
      kind: "setup";
      progressDone: number;
      progressTotal: number;
      missingKeys: FirstValueSetupKey[];
    }
  | {
      kind: "trading_discovery";
    };

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function hasGoalTargetValue(settings: Record<string, any>) {
  const direct = Number(settings?.goal_target_value);
  if (Number.isFinite(direct) && direct > 0) return true;
  const legacy = Number(settings?.goal_amount);
  return Number.isFinite(legacy) && legacy > 0;
}

export function deriveSetupProgress(settings: Record<string, any> | null | undefined) {
  const src = settings && typeof settings === "object" ? settings : {};

  const steps: Array<{ key: FirstValueSetupKey; done: boolean }> = [
    { key: "risk_profile", done: hasText(src.risk_profile) },
    { key: "horizon", done: hasText(src.horizon) },
    { key: "goal_type", done: hasText(src.goal_type) },
    { key: "goal_target_value", done: hasGoalTargetValue(src) },
  ];

  const missingKeys = steps.filter((step) => !step.done).map((step) => step.key);
  const progressDone = steps.length - missingKeys.length;
  const progressTotal = steps.length;
  const setupStatus = String(src.setup_status ?? "").trim().toLowerCase();
  const complete = setupStatus === "complete" || missingKeys.length === 0;

  return {
    complete,
    progressDone,
    progressTotal,
    missingKeys,
  };
}

export function deriveFirstValueRailState(args: {
  mode: "investing" | "trading";
  tier: "free" | "trial" | "pro";
  settings: Record<string, any> | null | undefined;
  view: string;
  welcomeSetupRequested: boolean;
  offlineSetupRequested: boolean;
}) {
  if (args.welcomeSetupRequested || args.offlineSetupRequested || args.view === "planning") {
    return { kind: "hidden" } satisfies FirstValueRailState;
  }

  const progress = deriveSetupProgress(args.settings);
  if (args.mode === "trading" && args.tier !== "free" && !progress.complete) {
    return { kind: "hidden" } satisfies FirstValueRailState;
  }

  if (!progress.complete) {
    return {
      kind: "setup",
      progressDone: progress.progressDone,
      progressTotal: progress.progressTotal,
      missingKeys: progress.missingKeys,
    } satisfies FirstValueRailState;
  }

  return { kind: "hidden" } satisfies FirstValueRailState;
}
