import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InvestingDashboard,
  InvestingFailurePanel,
  InvestingRunCard,
} from "@/components/investing/InvestingRuntimeUi";
import {
  presentInvestingDashboard,
  presentInvestingRun,
} from "@/lib/investing/ui/presenter";

function run(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-private-12345678",
    asOf: "2026-07-26T10:00:00.000Z",
    state: "complete",
    quality: "canonical",
    requestOutcome: "created",
    reasonCode: "internal_reason",
    integrity: "pass",
    verifier: "pass",
    replay: "pass",
    idempotencyConflict: false,
    ambiguousCommitRecovery: false,
    ...overrides,
  } as never;
}

function snapshot(metricOverrides: Record<string, unknown> = {}) {
  const available = (value: unknown) => ({ available: true, value });
  return {
    contractVersion: "investing-ops-snapshot/v1",
    generatedAt: "2026-07-26T10:01:00.000Z",
    scope: {
      ownerId: "owner-secret",
      tenantId: "tenant-secret",
      portfolioId: "portfolio-secret",
      accountId: "account-secret",
    },
    state: "healthy",
    reasonCode: "ops_healthy",
    metrics: {
      totalRuns: available(2),
      runsInPeriod: available(1),
      latestRunAgeMs: available(60_000),
      generationDurationMs: available(125),
      totalRequests: available(999),
      created: available(999),
      existing: available(999),
      recovered: available(999),
      failed: available(999),
      blocked: available(999),
      idempotencyConflicts: available(999),
      identityFailures: available(999),
      authorizationFailures: available(999),
      integrityFailures: available(999),
      persistenceFailures: available(999),
      ...metricOverrides,
    },
    latestRun: run(),
    latestActivityAt: "2026-07-26T10:00:00.000Z",
    latestFailureReason: null,
    integrity: "pass",
    verifier: "pass",
    replay: "pass",
  } as never;
}

describe("FASE 5E-R defensive presenters", () => {
  it("shows only four sourced metrics and eleven honest unavailable metrics", () => {
    const result = presentInvestingDashboard(snapshot());
    expect(result.metrics).toHaveLength(15);
    expect(result.metrics.filter((metric) => !metric.available)).toHaveLength(11);
    expect(result.metrics.filter((metric) => !metric.available)
      .every((metric) => metric.displayValue === "Indisponível")).toBe(true);
    expect(result.metrics.find((metric) => metric.key === "created")?.displayValue)
      .toBe("Indisponível");
  });

  it.each([NaN, Infinity, -Infinity, -1, "4", null])(
    "degrades invalid numeric value %s without converting it to zero",
    (value) => {
      const result = presentInvestingDashboard(snapshot({ totalRuns: {
        available: true,
        value,
      } }));
      expect(result.metrics[0]).toMatchObject({
        available: false,
        displayValue: "Indisponível",
      });
    },
  );

  it("degrades invalid dates and unexpected strings safely", () => {
    expect(presentInvestingRun(run({
      asOf: "not-a-date",
      state: "<script>secret</script>",
      quality: "",
    }))).toMatchObject({
      occurredAt: "Indisponível",
      state: "Indisponível",
      quality: "Indisponível",
    });
  });

  it("renders minimized HTML without scope, canonical payload or internal reason codes", () => {
    const data = presentInvestingDashboard(snapshot());
    const html = renderToStaticMarkup(<InvestingDashboard data={data} />);
    expect(html).not.toMatch(/owner-secret|tenant-secret|portfolio-secret|account-secret/u);
    expect(html).not.toContain("internal_reason");
    expect(html).not.toContain("999");
    expect(html).toContain("Indisponível");
  });

  it("renders a run label and authorized link without canonical fields", () => {
    const data = presentInvestingRun(run({ canonicalPayload: "CANONICAL_SECRET" }));
    const html = renderToStaticMarkup(<InvestingRunCard run={data} />);
    expect(html).toContain("Run •••12345678");
    expect(html).toContain("/investing/runs/run-private-12345678");
    expect(html).not.toContain("CANONICAL_SECRET");
  });

  it("renders public failures without technical codes or enumerable identifiers", () => {
    const html = renderToStaticMarkup(<InvestingFailurePanel failure={{
      kind: "not_found",
      title: "Run não disponível",
      description: "O run não existe ou não está acessível.",
    }} />);
    expect(html).not.toMatch(/ops_|identity_|ownerId|tenantId|run-private/u);
  });
});
