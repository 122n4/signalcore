import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PostgresDatasetCatalogRepository, type ScopedSqlClient } from "@/lib/investing/research/dataset-catalog/postgresRepository.server";
import { requirement6e, scope6e } from "./investingPhase6EDatasetContracts.test";
import { deriveDatasetRequirementIdentity } from "@/lib/investing/research/datasets/identity.server";

describe("Phase 6E PostgreSQL repository statements", () => {
  it("uses transactions, scoped idempotency and compare-and-set", async () => {
    const statements: string[] = [];
    const identity = deriveDatasetRequirementIdentity(requirement6e());
    expect(identity.ok).toBe(true);
    const envelope = { requirementId: identity.ok ? identity.value.requirementId : "", material: requirement6e(), createdAt: "2026-01-01T00:00:00.000Z", correlationId: "corr-a" };
    const client: ScopedSqlClient = {
      async query(text) {
        statements.push(text.replace(/\s+/gu, " ").trim());
        if (/returning request_id/iu.test(text)) return { rows: [{ request_id: envelope.requirementId, canonical_payload: envelope }], rowCount: 1 };
        if (/update public\.investing_research_acquisition_jobs/iu.test(text)) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    };
    const repository = new PostgresDatasetCatalogRepository({ async connect() { return client; } });
    expect((await repository.createOrReuseRequirement(envelope)).reused).toBe(false);
    expect(await repository.compareAndSetAttempt({ scope: scope6e, acquisitionJobId: "job-a", expectedState: "requested", expectedStateVersion: 0, nextState: "acquiring", outcome: null })).toBeNull();
    expect(statements.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(statements.filter((sql) => sql === "commit")).toHaveLength(2);
    expect(statements.join("\n")).toContain("state_version=$9");
    expect(statements.join("\n")).toContain("tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4");
  });
});
