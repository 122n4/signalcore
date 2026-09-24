import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAuthorizedResearchValidationChildExecutionContext,
  isAuthorizedResearchValidationProtocolCreateContext,
  isAuthorizedResearchValidationResultFinalizeContext,
  resolveAuthorizedResearchValidationChildExecutionContext,
  resolveAuthorizedResearchValidationProtocolCreateContext,
  resolveAuthorizedResearchValidationResultFinalizeContext,
  type InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";

vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const ids = {
  principal: "11111111-1111-4111-8111-1111111113b0",
  otherPrincipal: "11111111-1111-4111-8111-1111111113b1",
  tenant: "22222222-2222-4222-8222-2222222223b0",
  otherTenant: "22222222-2222-4222-8222-2222222223b1",
  membership: "33333333-3333-4333-8333-3333333333b0",
  investigation: "44444444-4444-4444-8444-4444444443b0",
  otherInvestigation: "44444444-4444-4444-8444-4444444443b1",
  experiment: "55555555-5555-4555-8555-5555555553b0",
  otherExperiment: "55555555-5555-4555-8555-5555555553b1",
  protocol: "66666666-6666-4666-8666-6666666663b0",
  otherProtocol: "66666666-6666-4666-8666-6666666663b1",
  account: "77777777-7777-4777-8777-7777777773b0",
};

type Rows = {
  principalState?: "ACTIVE" | "DISABLED";
  tenantState?: "ACTIVE" | "SUSPENDED";
  membershipState?: "ACTIVE" | "REVOKED";
  membershipRole?: "OWNER" | "VIEWER";
  experimentPrincipal?: string;
  experimentTenant?: string;
  experimentInvestigation?: string;
  protocolPrincipal?: string;
  protocolTenant?: string;
  protocolInvestigation?: string;
};

type ProtocolOverride = Rows & {
  clerk?: "UNAUTHENTICATED";
  experimentId?: string;
  researchExperimentId?: string;
  correlationId?: string;
  inputExtras?: Record<string, unknown>;
};

type ChildOverride = Rows & {
  researchInvestigationId?: string;
  protocolId?: string;
  foldOrdinal?: string;
  phase?: string;
  inputExtras?: Record<string, unknown>;
};

class FakeRl3bAuthorityClient implements InvestingAuthorityTransactionClient {
  readonly queries: { text: string; values: readonly unknown[] }[] = [];

  constructor(private readonly rows: Rows = {}) {}

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql === "begin" || sql === "commit" || sql === "rollback" || sql.startsWith("select set_config(")) {
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql.startsWith("select current_setting(")) return { rows: [{} as Row], rowCount: 1 };
    if (sql.includes("from investing.principals")) {
      return {
        rows: [{ principal_id: ids.principal, state: this.rows.principalState ?? "ACTIVE" } as Row],
        rowCount: 1,
      };
    }
    if (sql.includes("from investing.tenants")) {
      const active = (this.rows.tenantState ?? "ACTIVE") === "ACTIVE";
      return {
        rows: active ? [{ tenant_id: ids.tenant, state: "ACTIVE" } as Row] : [],
        rowCount: active ? 1 : 0,
      };
    }
    if (sql.includes("from investing.tenant_memberships")) {
      const active =
        (this.rows.membershipState ?? "ACTIVE") === "ACTIVE" &&
        (this.rows.membershipRole ?? "OWNER") === "OWNER";
      return {
        rows: active
          ? [{
              tenant_membership_id: ids.membership,
              tenant_id: ids.tenant,
              principal_id: ids.principal,
              state: "ACTIVE",
            } as Row]
          : [],
        rowCount: active ? 1 : 0,
      };
    }
    if (sql.includes("from investing.research_experiments e")) {
      const experimentPrincipal = this.rows.experimentPrincipal ?? ids.principal;
      const experimentTenant = this.rows.experimentTenant ?? ids.tenant;
      const experimentInvestigation = this.rows.experimentInvestigation ?? ids.investigation;
      const visible =
        values[0] === ids.experiment &&
        values[1] === experimentInvestigation &&
        values[2] === ids.principal &&
        experimentPrincipal === ids.principal &&
        experimentTenant === ids.tenant &&
        (this.rows.tenantState ?? "ACTIVE") === "ACTIVE" &&
        (this.rows.membershipState ?? "ACTIVE") === "ACTIVE" &&
        (this.rows.membershipRole ?? "OWNER") === "OWNER";
      return {
        rows: visible
          ? [{
              research_investigation_id: experimentInvestigation,
              research_experiment_id: ids.experiment,
              tenant_id: experimentTenant,
              principal_id: experimentPrincipal,
              tenant_membership_id: ids.membership,
              operation_scope: "TENANT_SCOPE",
              source_context: "PURE_RESEARCH",
            } as Row]
          : [],
        rowCount: visible ? 1 : 0,
      };
    }
    if (
      sql.includes("from investing.research_validation_protocols_scientific_identities v") ||
      sql.includes("from investing.research_validation_protocols_scientific_identities")
    ) {
      const protocolPrincipal = this.rows.protocolPrincipal ?? ids.principal;
      const protocolTenant = this.rows.protocolTenant ?? ids.tenant;
      const protocolInvestigation = this.rows.protocolInvestigation ?? ids.investigation;
      const visible =
        values[0] === ids.protocol &&
        values[1] === protocolInvestigation &&
        values[2] === ids.principal &&
        protocolPrincipal === ids.principal &&
        protocolTenant === ids.tenant &&
        (this.rows.tenantState ?? "ACTIVE") === "ACTIVE" &&
        (this.rows.membershipState ?? "ACTIVE") === "ACTIVE" &&
        (this.rows.membershipRole ?? "OWNER") === "OWNER";
      return {
        rows: visible
          ? [{
              research_investigation_id: protocolInvestigation,
              research_validation_protocol_identity_id: ids.protocol,
              research_experiment_id: ids.experiment,
              tenant_id: protocolTenant,
              principal_id: protocolPrincipal,
              tenant_membership_id: ids.membership,
              operation_scope: "TENANT_SCOPE",
              source_context: "PURE_RESEARCH",
            } as Row]
          : [],
        rowCount: visible ? 1 : 0,
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  release() {}
}

function mockDatabase(rows: Rows = {}) {
  const client = new FakeRl3bAuthorityClient(rows);
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({ connect: async () => client });
  return client;
}

function mockClerkOk() {
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: "user_rl3b_authority",
  });
}

describe("I5 RL-3B Validation authority contexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["valid OWNER", {}, { ok: true }],
    ["unauthenticated", { clerk: "UNAUTHENTICATED" }, { ok: false, code: "UNAUTHENTICATED" }],
    ["disabled principal", { principalState: "DISABLED" }, { ok: false, code: "PRINCIPAL_DISABLED" }],
    ["wrong Experiment selector", { experimentId: ids.otherExperiment }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Experiment from another principal", { experimentPrincipal: ids.otherPrincipal }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Experiment from another tenant", { experimentTenant: ids.otherTenant }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["inactive membership", { membershipState: "REVOKED" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["non-OWNER membership", { membershipRole: "VIEWER" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["inactive tenant", { tenantState: "SUSPENDED" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["account-scoped context rejected", { inputExtras: { accountId: ids.account } }, { ok: false, code: "VALIDATION_ERROR" }],
    ["USER_PORTFOLIO rejected", { inputExtras: { sourceContext: "USER_PORTFOLIO" } }, { ok: false, code: "VALIDATION_ERROR" }],
    ["caller-injected tenant/principal/membership/operation rejected", { inputExtras: { tenantId: ids.tenant, principalId: ids.principal, tenantMembershipId: ids.membership, operation: "RESEARCH_VALIDATION_PROTOCOL_CREATE_V1" } }, { ok: false, code: "VALIDATION_ERROR" }],
    ["malformed correlation/selector fail closed", { researchExperimentId: "not-a-uuid", correlationId: "bad" }, { ok: false, code: "VALIDATION_ERROR" }],
  ])("resolves Protocol create authority: %s", async (_label, override, expected) => {
    const fixture = override as ProtocolOverride;
    if (fixture.clerk) {
      vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: false, code: "UNAUTHENTICATED" });
    } else {
      mockClerkOk();
    }
    mockDatabase(fixture);
    const result = await resolveAuthorizedResearchValidationProtocolCreateContext({
      researchInvestigationId: ids.investigation,
      researchExperimentId: fixture.experimentId ??
        fixture.researchExperimentId ??
        ids.experiment,
      correlationId: fixture.correlationId ?? "corr-rl3b-protocol-0001",
      ...(fixture.inputExtras ?? {}),
    } as never);
    expect(result).toMatchObject(expected);
    if (result.ok) {
      expect(isAuthorizedResearchValidationProtocolCreateContext(result.context)).toBe(true);
      expect("accountId" in result.context).toBe(false);
      expect(result.context.operation).toBe("RESEARCH_VALIDATION_PROTOCOL_CREATE_V1");
    }
  });

  it.each([
    ["valid Protocol owner", {}, { ok: true }],
    ["Protocol other principal denied", { protocolPrincipal: ids.otherPrincipal }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Protocol other tenant denied", { protocolTenant: ids.otherTenant }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Investigation mismatch denied", { researchInvestigationId: ids.otherInvestigation }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["inactive membership", { membershipState: "REVOKED" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["non-OWNER", { membershipRole: "VIEWER" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["inactive tenant", { tenantState: "SUSPENDED" }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["invalid fold ordinal rejected", { foldOrdinal: "-1" }, { ok: false, code: "VALIDATION_ERROR" }],
    ["invalid phase rejected", { phase: "VALIDATION" }, { ok: false, code: "VALIDATION_ERROR" }],
    ["account-scoped context rejected", { inputExtras: { accountId: ids.account } }, { ok: false, code: "VALIDATION_ERROR" }],
    ["injected authority fields rejected", { inputExtras: { principalId: ids.principal, operation: "RESEARCH_VALIDATION_CHILD_EXECUTE_V1" } }, { ok: false, code: "VALIDATION_ERROR" }],
  ])("resolves Validation child execute authority: %s", async (_label, override, expected) => {
    const fixture = override as ChildOverride;
    mockClerkOk();
    mockDatabase(fixture);
    const result = await resolveAuthorizedResearchValidationChildExecutionContext({
      researchInvestigationId: fixture.researchInvestigationId ?? ids.investigation,
      researchValidationProtocolIdentityId: fixture.protocolId ?? ids.protocol,
      foldOrdinal: fixture.foldOrdinal ?? "0",
      phase: fixture.phase ?? "TRAINING",
      correlationId: "corr-rl3b-child-0001",
      ...(fixture.inputExtras ?? {}),
    } as never);
    expect(result).toMatchObject(expected);
    if (result.ok) {
      expect(isAuthorizedResearchValidationChildExecutionContext(result.context)).toBe(true);
      expect("accountId" in result.context).toBe(false);
      expect(result.context.operation).toBe("RESEARCH_VALIDATION_CHILD_EXECUTE_V1");
    }
  });
  it.each([
    ["valid Protocol owner", {}, { ok: true }],
    ["Protocol other principal denied", { protocolPrincipal: ids.otherPrincipal }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Protocol other tenant denied", { protocolTenant: ids.otherTenant }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["Investigation mismatch denied", { researchInvestigationId: ids.otherInvestigation }, { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" }],
    ["inactive membership", { membershipState: "REVOKED" }, { ok: false, code: "MEMBERSHIP_INACTIVE" }],
    ["non-OWNER", { membershipRole: "VIEWER" }, { ok: false, code: "MEMBERSHIP_INACTIVE" }],
    ["inactive tenant", { tenantState: "SUSPENDED" }, { ok: false, code: "TENANT_INACTIVE" }],
    ["account-scoped context rejected", { inputExtras: { accountId: ids.account } }, { ok: false, code: "VALIDATION_ERROR" }],
    ["injected authority fields rejected", { inputExtras: { principalId: ids.principal, operation: "RESEARCH_VALIDATION_RESULT_FINALIZE_V1" } }, { ok: false, code: "VALIDATION_ERROR" }],
  ])("resolves Validation aggregate finalize authority: %s", async (_label, override, expected) => {
    const fixture = override as ChildOverride;
    mockClerkOk();
    mockDatabase(fixture);
    const result = await resolveAuthorizedResearchValidationResultFinalizeContext({
      researchInvestigationId: fixture.researchInvestigationId ?? ids.investigation,
      researchValidationProtocolIdentityId: fixture.protocolId ?? ids.protocol,
      correlationId: "corr-rl3c-finalize-0001",
      ...(fixture.inputExtras ?? {}),
    } as never);
    expect(result).toMatchObject(expected);
    if (result.ok) {
      expect(isAuthorizedResearchValidationResultFinalizeContext(result.context)).toBe(true);
      expect("accountId" in result.context).toBe(false);
      expect(result.context.operation).toBe("RESEARCH_VALIDATION_RESULT_FINALIZE_V1");
      expect(result.context.capability).toBe("RESEARCH_MUTATE");
      expect(result.context.researchExperimentId).toBe(ids.experiment);
    }
  });
});
