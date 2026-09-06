import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/investing/authority/context", () => ({
  resolveAuthorizedInvestingAccountContext: vi.fn(),
}));
vi.mock("@/lib/investing/plan/writer", () => ({
  initializeInvestingPlanV1: vi.fn(),
  createAndActivateInvestingPlanRevisionV1: vi.fn(),
}));

import { resolveAuthorizedInvestingAccountContext } from "@/lib/investing/authority/context";
import {
  createAndActivateInvestingPlanRevisionV1,
  initializeInvestingPlanV1,
  type PlanContentV1,
} from "@/lib/investing/plan/writer";
import {
  createAndActivateInvestingPlanRevisionForAccountV1,
  initializeInvestingPlanForAccountV1,
} from "@/lib/investing/plan/service";

const accountId = "11111111-1111-4111-8111-111111111111";
const correlationId = "corr-i4-service-0001";
const idempotencyKey = "idem-i4-service-0001";
const planRootId = "22222222-2222-4222-8222-222222222222";
const expectedActiveRevisionId = "33333333-3333-4333-8333-333333333333";

const content: PlanContentV1 = Object.freeze({
  planning_currency_preference: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN" }),
  goal_description: Object.freeze({ state: "NOT_SUPPLIED", type: "TEXT" }),
  target_money: Object.freeze({ state: "NOT_SUPPLIED", type: "MONEY" }),
  target_date: Object.freeze({ state: "NOT_SUPPLIED", type: "DATE" }),
  time_horizon_months: Object.freeze({ state: "NOT_SUPPLIED", type: "INTEGER" }),
  risk_tolerance: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN" }),
  excluded_asset_classes: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN_SET" }),
  notes: Object.freeze({ state: "NOT_SUPPLIED", type: "TEXT" }),
});

const authorizedContext = Object.freeze({
  opaque: "canonical-authority-context",
});

const success = Object.freeze({
  ok: true as const,
  replayed: false,
  planRootId,
  planRevisionId: "44444444-4444-4444-8444-444444444444",
  activeVersion: "2",
  planRevisionContentHash: "a".repeat(64),
  idempotencyRecordId: "55555555-5555-4555-8555-555555555555",
});

describe("I4 canonical Plan service authority boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves canonical authority server-side before initialization and never forwards accountId as authority proof", async () => {
    vi.mocked(resolveAuthorizedInvestingAccountContext).mockResolvedValue({
      ok: true,
      context: authorizedContext,
    } as never);
    vi.mocked(initializeInvestingPlanV1).mockResolvedValue(success);

    const result = await initializeInvestingPlanForAccountV1({
      accountId,
      correlationId,
      idempotencyKey,
      content,
    });

    expect(resolveAuthorizedInvestingAccountContext).toHaveBeenCalledTimes(1);
    expect(resolveAuthorizedInvestingAccountContext).toHaveBeenCalledWith({ accountId, correlationId });
    expect(initializeInvestingPlanV1).toHaveBeenCalledTimes(1);
    expect(initializeInvestingPlanV1).toHaveBeenCalledWith({
      authorizedContext,
      correlationId,
      idempotencyKey,
      content,
    });
    expect(vi.mocked(resolveAuthorizedInvestingAccountContext).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(initializeInvestingPlanV1).mock.invocationCallOrder[0],
    );
    expect(result).toBe(success);
  });

  it("forwards frozen predecessor evidence unchanged only after canonical authority resolution", async () => {
    vi.mocked(resolveAuthorizedInvestingAccountContext).mockResolvedValue({
      ok: true,
      context: authorizedContext,
    } as never);
    vi.mocked(createAndActivateInvestingPlanRevisionV1).mockResolvedValue(success);

    const result = await createAndActivateInvestingPlanRevisionForAccountV1({
      accountId,
      correlationId,
      idempotencyKey,
      content,
      planRootId,
      expectedActiveRevisionId,
      expectedActiveVersion: "1",
    });

    expect(resolveAuthorizedInvestingAccountContext).toHaveBeenCalledWith({ accountId, correlationId });
    expect(createAndActivateInvestingPlanRevisionV1).toHaveBeenCalledWith({
      authorizedContext,
      correlationId,
      idempotencyKey,
      content,
      planRootId,
      expectedActiveRevisionId,
      expectedActiveVersion: "1",
    });
    expect(result).toBe(success);
  });

  it.each([
    ["tenantId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["principalId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    ["userId", "user_client_supplied"],
    ["authorizedContext", { forged: true }],
    ["service_role", true],
    ["serviceRole", true],
    ["database", {}],
    ["tenantMembershipId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
    ["accountAccessId", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
  ])("fails closed on client authority claim %s", async (key, value) => {
    const result = await initializeInvestingPlanForAccountV1({
      accountId,
      correlationId,
      idempotencyKey,
      content,
      [key]: value,
    });

    expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(resolveAuthorizedInvestingAccountContext).not.toHaveBeenCalled();
    expect(initializeInvestingPlanV1).not.toHaveBeenCalled();
  });

  it("does not invoke the writer when canonical authority resolution denies access", async () => {
    const denial = Object.freeze({
      ok: false as const,
      code: "ACCESS_INACTIVE" as const,
      externalCode: "FORBIDDEN_OR_NOT_FOUND" as const,
    });
    vi.mocked(resolveAuthorizedInvestingAccountContext).mockResolvedValue(denial);

    const result = await initializeInvestingPlanForAccountV1({
      accountId,
      correlationId,
      idempotencyKey,
      content,
    });

    expect(result).toBe(denial);
    expect(initializeInvestingPlanV1).not.toHaveBeenCalled();
  });

  it("propagates writer conflict without fallback, mutation retry, or authority substitution", async () => {
    vi.mocked(resolveAuthorizedInvestingAccountContext).mockResolvedValue({
      ok: true,
      context: authorizedContext,
    } as never);
    const conflict = Object.freeze({ ok: false as const, code: "CONFLICT" as const });
    vi.mocked(createAndActivateInvestingPlanRevisionV1).mockResolvedValue(conflict);

    const result = await createAndActivateInvestingPlanRevisionForAccountV1({
      accountId,
      correlationId,
      idempotencyKey,
      content,
      planRootId,
      expectedActiveRevisionId,
      expectedActiveVersion: "1",
    });

    expect(result).toBe(conflict);
    expect(resolveAuthorizedInvestingAccountContext).toHaveBeenCalledTimes(1);
    expect(createAndActivateInvestingPlanRevisionV1).toHaveBeenCalledTimes(1);
  });
});
