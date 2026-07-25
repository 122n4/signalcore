import "server-only";

import type {
  InvestingIdentityOperationV1,
  ResolvedInvestingIdentityContextV1,
} from "@/lib/investing/identity";
import { identityFailure } from "@/lib/investing/identity/errors";
import type { InvestingIdentityScopeResolverPortV1 } from "@/lib/investing/identity/ports";
import { metrics, operationalState } from "@/lib/investing/ops/aggregation";
import type {
  InvestingOpsDetailV1,
  InvestingOpsListV1,
  InvestingOpsResultV1,
  InvestingOpsSnapshotV1,
} from "@/lib/investing/ops/contracts";
import { INVESTING_OPS_SNAPSHOT_VERSION } from "@/lib/investing/ops/contracts";
import { opsFailure } from "@/lib/investing/ops/errors";
import { investingOpsLogEvent } from "@/lib/investing/ops/logging";
import type {
  InvestingOpsClockPortV1,
  InvestingOpsLogPortV1,
} from "@/lib/investing/ops/ports";
import type {
  InvestingOpsInspectedDatasetV1,
} from "@/lib/investing/ops/adapter.server";
import { InvestingOpsOfficialServicesAdapterV1 } from "@/lib/investing/ops/adapter.server";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;

function strictRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    ? record
    : null;
}

function safeScope(scope: ResolvedInvestingIdentityContextV1) {
  return {
    ownerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    accountId: scope.accountId,
  };
}

export class InvestingOpsServiceV1 {
  constructor(
    private readonly resolver: InvestingIdentityScopeResolverPortV1,
    private readonly adapter: InvestingOpsOfficialServicesAdapterV1,
    private readonly clock: InvestingOpsClockPortV1,
    private readonly logger: InvestingOpsLogPortV1,
  ) {}

  snapshot(rawRequest: unknown = {}): Promise<InvestingOpsResultV1<InvestingOpsSnapshotV1>> {
    return this.execute("snapshot", "get_latest_run", rawRequest, [], (
      scope,
      inspected,
      generated,
      durationMs,
    ) => {
      const aggregate = operationalState({
        runs: inspected.runs,
        integrity: inspected.integrity,
        verifier: inspected.verifier,
        replay: inspected.replay,
        telemetryComplete: inspected.source.telemetryComplete,
      });
      const latestFailure = inspected.source.failures === null
        ? null
        : [...inspected.source.failures]
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null;
      return {
        contractVersion: INVESTING_OPS_SNAPSHOT_VERSION,
        generatedAt: generated.iso,
        scope: safeScope(scope),
        ...aggregate,
        metrics: metrics({
          dataset: inspected.source,
          runs: inspected.runs,
          generatedAtMs: Date.parse(generated.iso),
          generationDurationMs: durationMs,
          periodStartMs: Date.parse(generated.iso) - 86_400_000,
        }),
        latestRun: inspected.runs[0] ?? null,
        latestActivityAt: inspected.runs[0]?.asOf ?? latestFailure?.occurredAt ?? null,
        latestFailureReason: latestFailure?.reasonCode ?? null,
        integrity: inspected.integrity,
        verifier: inspected.verifier,
        replay: inspected.replay,
      };
    });
  }

  listRuns(rawRequest: unknown): Promise<InvestingOpsResultV1<InvestingOpsListV1>> {
    return this.execute("list_runs", "get_latest_run", rawRequest, ["limit"], (
      scope,
      inspected,
      generated,
    ) => {
      const record = rawRequest as Record<string, unknown>;
      const limit = record.limit;
      if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
        throw new Error("ops_invalid_request");
      }
      return {
        contractVersion: INVESTING_OPS_SNAPSHOT_VERSION,
        generatedAt: generated.iso,
        scope: safeScope(scope),
        runs: inspected.runs.slice(0, limit as number),
      };
    });
  }

  getRun(rawRequest: unknown): Promise<InvestingOpsResultV1<InvestingOpsDetailV1>> {
    return this.detail("get_run", rawRequest, false);
  }

  getLatestRun(rawRequest: unknown = {}): Promise<InvestingOpsResultV1<InvestingOpsDetailV1>> {
    return this.detail("get_latest_run", rawRequest, true);
  }

  private detail(
    operation: "get_run" | "get_latest_run",
    rawRequest: unknown,
    latest: boolean,
  ): Promise<InvestingOpsResultV1<InvestingOpsDetailV1>> {
    const keys = latest ? [] : ["runId"];
    return this.execute(operation, operation, rawRequest, keys, (scope, inspected, generated) => {
      const runId = latest
        ? inspected.runs[0]?.runId ?? null
        : (rawRequest as Record<string, unknown>).runId;
      if (!latest && (typeof runId !== "string" || !IDENTIFIER.test(runId))) {
        throw new Error("ops_invalid_request");
      }
      const run = inspected.runs.find((candidate) => candidate.runId === runId);
      if (!run) throw new Error("ops_run_not_found");
      return {
        contractVersion: INVESTING_OPS_SNAPSHOT_VERSION,
        generatedAt: generated.iso,
        scope: safeScope(scope),
        run,
      };
    });
  }

  private async execute<T>(
    logOperation: "snapshot" | "list_runs" | "get_run" | "get_latest_run",
    identityOperation: InvestingIdentityOperationV1,
    rawRequest: unknown,
    keys: readonly string[],
    build: (
      scope: ResolvedInvestingIdentityContextV1,
      inspected: InvestingOpsInspectedDatasetV1,
      generated: ReturnType<InvestingOpsClockPortV1["now"]>,
      durationMs: number,
    ) => T,
  ): Promise<InvestingOpsResultV1<T>> {
    let scope: ResolvedInvestingIdentityContextV1;
    try {
      scope = await this.resolver.resolve(identityOperation);
    } catch {
      return identityFailure();
    }
    const start = this.clock.now();
    if (!strictRecord(rawRequest, keys)) {
      await this.log(scope, logOperation, start, "failure", "ops_invalid_request");
      return opsFailure("ops_invalid_request", scope.requestId);
    }
    try {
      const inspected = await this.adapter.inspect(scope);
      const generated = this.clock.now();
      const value = build(scope, inspected, generated, generated.monotonicMs - start.monotonicMs);
      const reasonCode = value
        && typeof value === "object"
        && "reasonCode" in value
        && typeof value.reasonCode === "string"
        ? value.reasonCode
        : "ops_healthy";
      await this.log(scope, logOperation, start, "success", reasonCode);
      return { ok: true, value };
    } catch (error) {
      const code = error instanceof Error && error.message === "ops_run_not_found"
        ? "ops_run_not_found"
        : error instanceof Error && error.message === "ops_invalid_request"
          ? "ops_invalid_request"
          : "ops_dependency_unavailable";
      await this.log(scope, logOperation, start, "failure", code);
      return opsFailure(code, scope.requestId);
    }
  }

  private async log(
    scope: ResolvedInvestingIdentityContextV1,
    operation: "snapshot" | "list_runs" | "get_run" | "get_latest_run",
    start: ReturnType<InvestingOpsClockPortV1["now"]>,
    resultStatus: "success" | "failure",
    reasonCode: string,
  ): Promise<void> {
    const end = this.clock.now();
    try {
      await this.logger.write(investingOpsLogEvent({
        timestamp: end.iso,
        correlationId: scope.requestId,
        operation,
        resultStatus,
        reasonCode,
        durationMs: end.monotonicMs - start.monotonicMs,
        scope: { tenantId: scope.tenantId, portfolioId: scope.portfolioId },
      }));
    } catch {
      // Observability logging never mutates or changes the read result.
    }
  }
}
