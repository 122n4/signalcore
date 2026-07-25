import type {
  InvestingOpsCheckStateV1,
  InvestingOpsMetricV1,
  InvestingOpsMetricsV1,
  InvestingOpsOverallStateV1,
  InvestingOpsReasonCodeV1,
  InvestingOpsRunV1,
} from "@/lib/investing/ops/contracts";
import type {
  InvestingOpsReadDatasetV1,
} from "@/lib/investing/ops/ports";

const available = (value: number): InvestingOpsMetricV1 => ({ available: true, value });
const unavailable = (): InvestingOpsMetricV1 => ({ available: false, value: null });
const OFFICIAL_REQUEST_TELEMETRY_AVAILABLE = false;

export function aggregateCheck(
  values: readonly InvestingOpsCheckStateV1[],
): InvestingOpsCheckStateV1 {
  if (values.includes("blocked")) return "blocked";
  if (values.includes("failed")) return "failed";
  if (values.includes("incomplete") || values.length === 0) return "incomplete";
  return "pass";
}

export function operationalState(args: Readonly<{
  runs: readonly InvestingOpsRunV1[];
  integrity: InvestingOpsCheckStateV1;
  verifier: InvestingOpsCheckStateV1;
  replay: InvestingOpsCheckStateV1;
  telemetryComplete: boolean;
}>): Readonly<{ state: InvestingOpsOverallStateV1; reasonCode: InvestingOpsReasonCodeV1 }> {
  if (args.integrity === "blocked" || args.integrity === "failed") {
    return { state: "blocked", reasonCode: "ops_integrity_blocked" };
  }
  if (args.verifier === "failed" || args.verifier === "blocked") {
    return { state: "blocked", reasonCode: "ops_verifier_failed" };
  }
  if (args.replay === "failed" || args.replay === "blocked") {
    return { state: "blocked", reasonCode: "ops_replay_failed" };
  }
  if (args.runs.some((run) => run.state === "blocked" || run.requestOutcome === "blocked")) {
    return { state: "blocked", reasonCode: "ops_blocked" };
  }
  if (args.runs.length === 0) {
    return args.integrity === "pass" && OFFICIAL_REQUEST_TELEMETRY_AVAILABLE
      ? { state: "empty", reasonCode: "ops_empty" }
      : { state: "unknown", reasonCode: "ops_unknown" };
  }
  if (
    !OFFICIAL_REQUEST_TELEMETRY_AVAILABLE
    || [args.integrity, args.verifier, args.replay].some((check) => check !== "pass")
  ) {
    return { state: "degraded", reasonCode: "ops_check_incomplete" };
  }
  if (
    args.runs.some((run) =>
      run.state === "degraded"
      || run.quality === "degraded"
      || run.quality === "insufficient"
      || run.requestOutcome === "failed")
  ) {
    return { state: "degraded", reasonCode: "ops_degraded" };
  }
  return { state: "healthy", reasonCode: "ops_healthy" };
}

export function metrics(args: Readonly<{
  dataset: InvestingOpsReadDatasetV1;
  runs: readonly InvestingOpsRunV1[];
  generatedAtMs: number;
  generationDurationMs: number;
  periodStartMs: number;
}>): InvestingOpsMetricsV1 {
  const latestMs = args.runs.length > 0 ? Date.parse(args.runs[0].asOf) : Number.NaN;
  return {
    totalRuns: available(args.runs.length),
    totalRequests: unavailable(),
    created: unavailable(),
    existing: unavailable(),
    recovered: unavailable(),
    blocked: unavailable(),
    failed: unavailable(),
    idempotencyConflicts: unavailable(),
    identityFailures: unavailable(),
    authorizationFailures: unavailable(),
    integrityFailures: unavailable(),
    persistenceFailures: unavailable(),
    runsInPeriod: available(args.runs.filter((run) => Date.parse(run.asOf) >= args.periodStartMs).length),
    latestRunAgeMs: Number.isFinite(latestMs)
      ? available(Math.max(0, args.generatedAtMs - latestMs))
      : unavailable(),
    generationDurationMs: available(Math.max(0, args.generationDurationMs)),
  };
}
