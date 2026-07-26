import type {
  InvestingOpsCheckStateV1,
  InvestingOpsMetricV1,
  InvestingOpsRunV1,
  InvestingOpsSnapshotV1,
} from "@/lib/investing/ops";
import type {
  InvestingUiCheckV1,
  InvestingUiDashboardV1,
  InvestingUiMetricV1,
  InvestingUiRunV1,
} from "@/lib/investing/ui/contracts";

const UNAVAILABLE = "Indisponível";
const CHECKS = new Set<InvestingUiCheckV1>(["pass", "failed", "blocked", "incomplete"]);
const UNAVAILABLE_METRICS = [
  ["totalRequests", "Pedidos totais"],
  ["created", "Pedidos criados"],
  ["existing", "Pedidos existentes"],
  ["recovered", "Pedidos recuperados"],
  ["failed", "Pedidos falhados"],
  ["blocked", "Pedidos bloqueados"],
  ["idempotencyConflicts", "Conflitos de idempotência"],
  ["identityFailures", "Falhas de identidade"],
  ["authorizationFailures", "Falhas de autorização"],
  ["integrityFailures", "Falhas de integridade"],
  ["persistenceFailures", "Falhas de persistência"],
] as const;

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && Number.isFinite(Date.parse(value));
}

function safeText(value: unknown, fallback = UNAVAILABLE): string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/u.test(value)
    ? value
    : fallback;
}

function check(value: InvestingOpsCheckStateV1): InvestingUiCheckV1 {
  return CHECKS.has(value) ? value : "incomplete";
}

function formatDate(value: unknown): string {
  if (!validDate(value)) return UNAVAILABLE;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function duration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)} min`;
  return `${Math.round(value / 3_600_000)} h`;
}

function metric(
  key: string,
  label: string,
  source: InvestingOpsMetricV1,
  format: (value: number) => string = String,
): InvestingUiMetricV1 {
  const available = source.available === true && validNumber(source.value);
  return {
    key,
    label,
    available,
    displayValue: available ? format(source.value) : UNAVAILABLE,
  };
}

function unavailableMetric(key: string, label: string): InvestingUiMetricV1 {
  return { key, label, available: false, displayValue: UNAVAILABLE };
}

export function presentInvestingRun(run: InvestingOpsRunV1): InvestingUiRunV1 {
  const suffix = run.runId.length > 8 ? run.runId.slice(-8) : run.runId;
  return {
    runId: run.runId,
    label: `Run •••${suffix}`,
    occurredAt: formatDate(run.asOf),
    state: safeText(run.state),
    quality: safeText(run.quality),
    outcome: safeText(run.requestOutcome, "Não determinado"),
    integrity: check(run.integrity),
    verifier: check(run.verifier),
    replay: check(run.replay),
  };
}

export function presentInvestingDashboard(
  snapshot: InvestingOpsSnapshotV1,
): InvestingUiDashboardV1 {
  const copy = {
    healthy: ["Operação normal", "Os checks oficiais estão completos."],
    degraded: ["Informação parcial", "Existem dados reais, mas nem todos os checks estão completos."],
    blocked: ["Operação bloqueada", "Um check oficial bloqueou a leitura operacional."],
    empty: ["Sem runs", "Ainda não existem runs neste âmbito Investing."],
    unknown: ["Estado não determinado", "A informação oficial disponível não permite determinar o estado."],
  } as const;
  const state = snapshot.state in copy ? snapshot.state : "unknown";
  return {
    kind: "ready",
    generatedAt: formatDate(snapshot.generatedAt),
    state,
    title: copy[state][0],
    description: copy[state][1],
    metrics: [
      metric("totalRuns", "Runs conhecidos", snapshot.metrics.totalRuns),
      metric("runsInPeriod", "Runs nas últimas 24 h", snapshot.metrics.runsInPeriod),
      metric("latestRunAgeMs", "Idade do último run", snapshot.metrics.latestRunAgeMs, duration),
      metric(
        "generationDurationMs",
        "Duração do snapshot",
        snapshot.metrics.generationDurationMs,
        duration,
      ),
      ...UNAVAILABLE_METRICS.map(([key, label]) => unavailableMetric(key, label)),
    ],
    latestRun: snapshot.latestRun ? presentInvestingRun(snapshot.latestRun) : null,
    integrity: check(snapshot.integrity),
    verifier: check(snapshot.verifier),
    replay: check(snapshot.replay),
  };
}

export const investingUiPresentation = {
  formatDate,
  validNumber,
};
