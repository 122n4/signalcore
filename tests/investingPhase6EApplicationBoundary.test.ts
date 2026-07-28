import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DatasetCatalogService } from "@/lib/investing/research/dataset-catalog/service.server";
import type { DatasetCatalogRepository } from "@/lib/investing/research/dataset-catalog/repository.server";
import {
  createDatasetCatalogAuthorizationPortV1,
  createDatasetCatalogServiceV1,
} from "@/lib/investing/research/dataset-catalog/composition.server";
import { requirement6e } from "./investingPhase6EDatasetContracts.test";

const identity = {
  contractVersion: "investing-identity-context/v1", authenticatedUserId: "user-a",
  ownerId: "owner-a", tenantId: "tenant-a", portfolioId: "portfolio-a",
  accountId: "account-a", role: "owner", permissions: ["investing:create"],
  requestId: "request-a",
} as const;

function repository(): DatasetCatalogRepository {
  return {
    createOrReuseRequirement: vi.fn(async (value) => ({ value, reused: false })),
    createOrReuseActiveAttempt: vi.fn(async (value) => ({ value, reused: false })),
    compareAndSetAttempt: vi.fn(async () => null),
    publishOrReuseVersion: vi.fn(async ({ datasetVersionId }) => ({ datasetVersionId, reused: false })),
    getAttempt: vi.fn(async () => null),
    listVersions: vi.fn(async () => []),
    getVersion: vi.fn(async () => null),
  };
}
const authorization = { authorize: vi.fn(async () => ({ ok: true as const, value: { authenticatedUserId: identity.authenticatedUserId, scope: { tenantId: identity.tenantId, ownerId: identity.ownerId, portfolioId: identity.portfolioId, accountId: identity.accountId } } })) };
const clock = { now: vi.fn(() => ({ iso: "2026-01-01T00:00:00.000Z", monotonicMs: 100 })) };
type CompositionDenialOverride = Partial<Readonly<{
  membershipStatus: "revoked";
  portfolioTenantId: string;
  portfolioOwnerId: string;
  accountId: string;
  authenticatedUserId: string;
}>>;

describe("Phase 6E authenticated application boundary", () => {
  it("creates only a requirement matching the resolved complete scope", async () => {
    const repo = repository(), emit = vi.fn();
    const result = await new DatasetCatalogService(repo, { emit }, authorization, clock).createRequirement(
      identity, requirement6e(),
      { createdAt: "2026-01-01T00:00:00.000Z", correlationId: "corr-a" },
    );
    expect(result.ok).toBe(true);
    expect(repo.createOrReuseRequirement).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "requirement_created" }));
  });
  it("rejects cross-tenant material before persistence", async () => {
    const repo = repository();
    const result = await new DatasetCatalogService(repo, { emit: vi.fn() }, authorization, clock).createRequirement(
      identity,
      { ...requirement6e(), scientificScope: { ...requirement6e().scientificScope, tenantId: "tenant-b" } },
      { createdAt: "2026-01-01T00:00:00.000Z", correlationId: "corr-a" },
    );
    expect(result).toMatchObject({ ok: false, issues: [{ reasonCode: "dataset_scope_mismatch" }] });
    expect(repo.createOrReuseRequirement).not.toHaveBeenCalled();
  });
  it("fails stale compare-and-set without changing state", async () => {
    const result = await new DatasetCatalogService(repository(), { emit: vi.fn() }, authorization, clock).transition(
      identity,
      { acquisitionJobId: "job-a", expectedState: "requested", expectedStateVersion: 9, nextState: "acquiring", outcome: null },
    );
    expect(result).toMatchObject({ ok: false, issues: [{ reasonCode: "acquisition_transition_invalid" }] });
  });

  it("fails closed when the runtime authorization port rejects the caller", async () => {
    const repo = repository();
    const denied = { authorize: vi.fn(async () => ({ ok: false as const, issues: [{ path: "identity", reasonCode: "dataset_scope_mismatch" as const }] })) };
    const result = await new DatasetCatalogService(repo, { emit: vi.fn() }, denied, clock).listAuthorizedDatasets({});
    expect(result).toMatchObject({ ok: false, issues: [{ reasonCode: "dataset_scope_mismatch" }] });
    expect(repo.listVersions).not.toHaveBeenCalled();
  });

  it("authorizes state, cancellation, list and detail operations at runtime", async () => {
    const repo = repository();
    const current = {
      acquisitionJobId: "job-a", requirementId: "irdsreq_v1_" + "a".repeat(64),
      scope: { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" },
      attempt: 1, idempotencyKey: "key-a", state: "requested" as const, stateVersion: 0,
      correlationId: "corr-a", requestedBy: "user-a", providerPreference: null, outcome: null,
    };
    vi.mocked(repo.getAttempt).mockResolvedValue(current);
    vi.mocked(repo.compareAndSetAttempt).mockResolvedValue({ ...current, state: "cancelled", stateVersion: 1, outcome: { kind: "cancelled", reasonCode: "acquisition_transition_invalid" } });
    const emit = vi.fn();
    const service = new DatasetCatalogService(repo, { emit }, authorization, clock);
    await service.getAcquisitionState(identity, "job-a");
    await service.cancelAcquisition(identity, "job-a");
    await service.listAuthorizedDatasets(identity);
    await service.getAuthorizedDatasetVersion(identity, "version-a");
    expect(authorization.authorize).toHaveBeenCalledWith(identity, "get_acquisition");
    expect(authorization.authorize).toHaveBeenCalledWith(identity, "cancel_acquisition");
    expect(authorization.authorize).toHaveBeenCalledWith(identity, "list_datasets");
    expect(authorization.authorize).toHaveBeenCalledWith(identity, "get_dataset_version");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "acquisition_cancelled",
      aggregateId: "job-a",
      requirementId: current.requirementId,
      attempt: 1,
      state: "cancelled",
      correlationId: "corr-a",
    }));
  });

  it("does not emit cancellation when CAS fails or state is terminal", async () => {
    const repo = repository(), emit = vi.fn();
    const active = {
      acquisitionJobId: "job-a", requirementId: "req-a",
      scope: { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" },
      attempt: 1, idempotencyKey: "key-a", state: "requested" as const, stateVersion: 0,
      correlationId: "corr-a", requestedBy: "user-a", providerPreference: null, outcome: null,
    };
    vi.mocked(repo.getAttempt).mockResolvedValue(active);
    await new DatasetCatalogService(repo, { emit }, authorization, clock).cancelAcquisition(identity, "job-a");
    expect(emit).not.toHaveBeenCalled();
    vi.mocked(repo.getAttempt).mockResolvedValue({ ...active, state: "cancelled", outcome: { kind: "cancelled", reasonCode: "acquisition_transition_invalid" } });
    await new DatasetCatalogService(repo, { emit }, authorization, clock).cancelAcquisition(identity, "job-a");
    expect(emit).not.toHaveBeenCalled();
  });

  it("composes the official identity resolver and ignores fabricated auth scope", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = createDatasetCatalogServiceV1({
      session: {
        resolve: async () => ({
          authenticatedUserId: "user-a",
          requestId: "request-a",
        }),
      },
      directory: {
        findMemberships: async () => [{
          membershipId: "membership-a",
          authenticatedUserId: "user-a",
          ownerId: "owner-a",
          tenantId: "tenant-a",
          role: "owner",
          permissions: ["investing:read"],
          status: "active",
        }],
        findPortfolios: async () => [{
          portfolioId: "portfolio-a",
          accountId: "account-a",
          ownerId: "owner-a",
          tenantId: "tenant-a",
          status: "active",
          investingEnabled: true,
        }],
      },
      database: {
        connect: async () => ({ query }),
      },
      events: { emit: vi.fn() },
      clock,
    });
    const result = await service.listAuthorizedDatasets({
      authenticatedUserId: "attacker",
      tenantId: "tenant-attacker",
      ownerId: "owner-attacker",
      portfolioId: "portfolio-attacker",
      accountId: "account-attacker",
    });
    expect(result).toEqual({ ok: true, value: [] });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id=$1"),
      ["tenant-a", "owner-a", "portfolio-a", "account-a"],
    );
  });

  it.each([
    ["revoked membership", {
      membershipStatus: "revoked" as const,
    }],
    ["cross-tenant portfolio", {
      portfolioTenantId: "tenant-b",
    }],
    ["cross-owner portfolio", {
      portfolioOwnerId: "owner-b",
    }],
    ["invalid account binding", {
      accountId: "",
    }],
    ["service role without application membership", {
      authenticatedUserId: "service-role",
    }],
  ])("fails closed for %s in the concrete composition", async (_label, override) => {
    const denial = override as CompositionDenialOverride;
    const authorization = createDatasetCatalogAuthorizationPortV1({
      session: {
        resolve: async () => ({
          authenticatedUserId:
            denial.authenticatedUserId ?? "user-a",
          requestId: "request-a",
        }),
      },
      directory: {
        findMemberships: async () => [{
          membershipId: "membership-a",
          authenticatedUserId: "user-a",
          ownerId: "owner-a",
          tenantId: "tenant-a",
          role: "owner",
          permissions: ["investing:read"],
          status: denial.membershipStatus ?? "active",
        }],
        findPortfolios: async () => [{
          portfolioId: "portfolio-a",
          accountId: denial.accountId ?? "account-a",
          ownerId: denial.portfolioOwnerId ?? "owner-a",
          tenantId: denial.portfolioTenantId ?? "tenant-a",
          status: "active",
          investingEnabled: true,
        }],
      },
    });
    await expect(
      authorization.authorize(
        { tenantId: "fabricated" },
        "list_datasets",
      ),
    ).resolves.toMatchObject({
      ok: false,
      issues: [{ reasonCode: "dataset_scope_mismatch" }],
    });
  });
});
