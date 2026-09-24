import { describe, expect, it } from "vitest";
import type { InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import {
  readValidationPassportProjectionV1,
} from "../lib/investing/research/validationPassport";

function context(sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO", operationScope: "TENANT_SCOPE" | "ACCOUNT_SCOPE" = "TENANT_SCOPE") {
  return {
    actorKind: "USER_PRINCIPAL",
    actorId: "user",
    principalId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    tenantMembershipId: "33333333-3333-4333-8333-333333333333",
    correlationId: "corr-rl3c-passport-0001",
    operation: "RESEARCH_PASSPORT_READ_V1",
    capability: "RESEARCH_READ",
    operationScope,
    sourceContext,
    researchInvestigationId: "44444444-4444-4444-8444-444444444444",
    ...(operationScope === "ACCOUNT_SCOPE"
      ? {
          accountId: "55555555-5555-4555-8555-555555555555",
          accountAccessId: "66666666-6666-4666-8666-666666666666",
        }
      : {}),
  } as never;
}

class NoQueryClient implements InvestingAuthorityTransactionClient {
  calls = 0;
  async query<Row = Record<string, unknown>>(
    _text: string,
    _values: readonly unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    this.calls += 1;
    throw new Error("validation tables must not be queried for unsupported scope");
  }
  release() {}
}

describe("I5 RL-3C Passport validation projection", () => {
  it.each([
    ["TEST_PORTFOLIO", "TENANT_SCOPE"],
    ["USER_PORTFOLIO", "ACCOUNT_SCOPE"],
  ] as const)("fails closed as unavailable for unsupported %s scope", async (sourceContext, operationScope) => {
    const client = new NoQueryClient();
    const result = await readValidationPassportProjectionV1(client, context(sourceContext, operationScope));
    expect(result).toEqual({
      ok: true,
      validation: {
        availability: "UNAVAILABLE_RL3_SCOPE",
        episodes: [],
        reason: "RL3_PURE_RESEARCH_TENANT_SCOPE_ONLY",
      },
      ledgerEvents: [],
    });
    expect(client.calls).toBe(0);
  });
});
