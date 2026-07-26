export type InvestingUiPublicStateV1 =
  | "healthy"
  | "degraded"
  | "blocked"
  | "empty"
  | "unknown";

export type InvestingUiCheckV1 = "pass" | "failed" | "blocked" | "incomplete";

export type InvestingUiMetricV1 = Readonly<{
  key: string;
  label: string;
  available: boolean;
  displayValue: string;
}>;

export type InvestingUiRunV1 = Readonly<{
  runId: string;
  label: string;
  occurredAt: string;
  state: string;
  quality: string;
  outcome: string;
  integrity: InvestingUiCheckV1;
  verifier: InvestingUiCheckV1;
  replay: InvestingUiCheckV1;
}>;

export type InvestingUiDashboardV1 = Readonly<{
  kind: "ready";
  generatedAt: string;
  state: InvestingUiPublicStateV1;
  title: string;
  description: string;
  metrics: readonly InvestingUiMetricV1[];
  latestRun: InvestingUiRunV1 | null;
  integrity: InvestingUiCheckV1;
  verifier: InvestingUiCheckV1;
  replay: InvestingUiCheckV1;
}>;

export type InvestingUiRunsV1 = Readonly<{
  kind: "ready";
  generatedAt: string;
  runs: readonly InvestingUiRunV1[];
}>;

export type InvestingUiRunDetailV1 = Readonly<{
  kind: "ready";
  generatedAt: string;
  run: InvestingUiRunV1;
}>;

export type InvestingUiFailureKindV1 =
  | "unauthorized"
  | "not_found"
  | "invalid"
  | "unavailable";

export type InvestingUiFailureV1 = Readonly<{
  kind: InvestingUiFailureKindV1;
  title: string;
  description: string;
}>;

export type InvestingUiResultV1<T> = T | InvestingUiFailureV1;
