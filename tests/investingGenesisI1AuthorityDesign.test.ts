import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const designPath = path.join(repoRoot, "docs", "investing-genesis", "I1_AUTHORITY_DESIGN.md");

function readDesign() {
  return fs.readFileSync(designPath, "utf8");
}

function threatMatrixRows(design: string) {
  return design
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .filter((line) => !line.includes(" --- "))
    .filter((line) => !line.includes("case | attack/precondition"));
}

describe("Investing Genesis I1 authority design", () => {
  it("freezes the verified I1 authority inputs", () => {
    const design = readDesign();

    expect(design).toContain("PARENT_SHA =\ne0de1ed6fbea9f1d276b5e50228f995543af8be0");
    expect(design).toContain("Clerk is the authenticated identity provider");
    expect(design).toContain("`lib/auth/requestUser.ts` and `getRequestUserId` MUST NOT be used");
    expect(design).toContain("service_role != authorization");
    expect(design).toContain("service_role != system authorization");
    expect(design).toContain("Client-provided `userId`, `tenantId`, and `accountId` are selectors");
    expect(design).toContain("VERIFIED_EXTERNAL_IDENTITY =");
    expect(design).toContain("identity_provider = CLERK");
    expect(design).toContain("external_subject = verified Clerk subject/user id");
    expect(design).toContain("One verified external identity -> exactly one canonical Principal");
    expect(design).toContain("immutable in I1");
    expect(design).toContain("non-reassignable in I1");
    expect(design).toContain("Existing Supabase branch `phase4-7-migration-audit` is STALE");
    expect(design).toContain("MUST NOT be selected as Genesis development authority");
  });

  it("documents distinct entities and the non-client-constructible authorized context", () => {
    const design = readDesign();

    expect(design).toContain("Principal:");
    expect(design).toContain("Tenant:");
    expect(design).toContain("TenantMembership:");
    expect(design).toContain("InvestingAccount:");
    expect(design).toContain("AccountAccess:");
    expect(design).toContain("AuthorizedInvestingContext:");
    expect(design).toContain("SystemActor:");
    expect(design).toContain("AuditEvent:");
    expect(design).toContain("IdempotencyRecord:");
    expect(design).toContain("Principal != Tenant != InvestingAccount");
    expect(design).toContain("server-only");
    expect(design).toContain("opaque/branded");
    expect(design).toContain("non-client-constructible");
    expect(design).toContain("non-deserializable from request payload");
    expect(design).toContain("operation-scoped");
    expect(design).toContain("InvestingAccount belongs to exactly one canonical Tenant");
    expect(design).toContain("TenantMembership binds Principal <-> Tenant");
    expect(design).toContain("AccountAccess binds Principal/TenantMembership <-> InvestingAccount");
    expect(design).toContain("In I1 these authority endpoints are immutable");
  });

  it("anchors user and system authority flows without treating client IDs as ownership proof", () => {
    const design = readDesign();

    expect(design).toContain("Clerk auth()");
    expect(design).toContain("verified external Clerk identity");
    expect(design).toContain("exactly one canonical Principal");
    expect(design).toContain("untrusted accountId selector");
    expect(design).toContain("canonical InvestingAccount lookup");
    expect(design).toContain("derive canonical tenant_id from InvestingAccount");
    expect(design).toContain("resolve exactly one ACTIVE TenantMembership for Principal + tenant");
    expect(design).toContain("resolve exactly one ACTIVE AccountAccess for Principal/membership + account");
    expect(design).toContain("validate the complete canonical authority tuple");
    expect(design).toContain("AuthorizedInvestingContext");
    expect(design).toContain("trusted internal invocation");
    expect(design).toContain("stable SYSTEM_ACTOR identity");
    expect(design).toContain("A system actor MUST NOT fabricate a Clerk/user principal");
    expect(design).toContain("accountId` may be accepted as a selector only");
    expect(design).toContain("Tenant ownership must be resolved canonically");
    expect(design).toContain("ACCOUNT_SCOPE_CANONICAL_RESOLUTION = account-before-membership");
    expect(design).toContain("Tenant must be derived from the canonical account for ACCOUNT_SCOPE");
    expect(design).toContain("An unexpected client `tenantId` must never influence canonical resolution");
    expect(design).toContain("an ACCOUNT_SCOPE API that does not contractually accept `tenantId` treats it as invalid/untrusted input");
    expect(design).toContain("Never select the first row. Never hide corruption with `LIMIT 1`");
  });

  it("preserves ACCOUNT/TENANT/DOMAIN scopes, role limits, lifecycle states, and fail-closed errors", () => {
    const design = readDesign();

    expect(design).toContain("ACCOUNT_SCOPE");
    expect(design).toContain("TENANT_SCOPE");
    expect(design).toContain("DOMAIN_SCOPE");
    expect(design).toContain("Initial supported role:");
    expect(design).toContain("OWNER");
    expect(design).toContain("Principal states:");
    expect(design).toContain("ACTIVE");
    expect(design).toContain("DISABLED");
    expect(design).toContain("Tenant states:");
    expect(design).toContain("SUSPENDED");
    expect(design).toContain("CLOSED");
    expect(design).toContain("TenantMembership states:");
    expect(design).toContain("REVOKED");
    expect(design).toContain("InvestingAccount states:");
    expect(design).toContain("FROZEN");
    expect(design).toContain("AccountAccess states:");
    expect(design).toContain("UNAUTHENTICATED");
    expect(design).toContain("FORBIDDEN_OR_NOT_FOUND");
    expect(design).toContain("PRINCIPAL_DISABLED");
    expect(design).toContain("TENANT_INACTIVE");
    expect(design).toContain("MEMBERSHIP_INACTIVE");
    expect(design).toContain("ACCOUNT_INACTIVE");
    expect(design).toContain("ACCESS_INACTIVE");
    expect(design).toContain("CAPABILITY_DENIED");
    expect(design).toContain("CONFLICT");
    expect(design).toContain("INTERNAL_ERROR");
  });

  it("requires atomic idempotent bootstrap and mutation-time authority revalidation", () => {
    const design = readDesign();

    expect(design).toContain("First account bootstrap is one atomic INITIAL_PERSONAL_BOOTSTRAP operation");
    expect(design).toContain("Partial bootstrap is forbidden");
    expect(design).toContain("SAME RESULT");
    expect(design).toContain("NO DUPLICATE EFFECT");
    expect(design).toContain("Same idempotency key with different material request");
    expect(design).toContain("Material writes must revalidate authority inside the same DB transaction");
    expect(design).toContain("Principal ACTIVE");
    expect(design).toContain("Tenant ACTIVE");
    expect(design).toContain("TenantMembership ACTIVE");
    expect(design).toContain("InvestingAccount state permits operation");
    expect(design).toContain("AccountAccess ACTIVE");
    expect(design).toContain("serializable or locking strategy");
    expect(design).toContain("does not select final SQL locking syntax");
  });

  it("freezes semantic bootstrap uniqueness and immutable authority endpoints", () => {
    const design = readDesign();

    expect(design).toContain("INITIAL_PERSONAL_BOOTSTRAP is semantically unique for the canonical Principal");
    expect(design).toContain("INITIAL_PERSONAL_BOOTSTRAP != CREATE_ADDITIONAL_ACCOUNT");
    expect(design).toContain("Idempotency key alone is insufficient");
    expect(design).toContain("different idempotency keys MUST NOT create two initial personal tenants/accounts");
    expect(design).toContain("Second INITIAL_PERSONAL_BOOTSTRAP after successful bootstrap");
    expect(design).toContain("InvestingAccount tenant reparenting");
    expect(design).toContain("TenantMembership principal/tenant reassignment");
    expect(design).toContain("AccountAccess principal/membership/account reassignment");
    expect(design).toContain("Changes require revoke/close plus an explicit future operation");
  });

  it("requires durable authority/security audit without using the financial ledger", () => {
    const design = readDesign();

    expect(design).toContain("AuditEvent != financial ledger");
    expect(design).toContain("Successful material authority/security mutations must commit their required audit evidence atomically");
    expect(design).toContain("Denied or rolled-back operations must not lose required security/authority audit");
    expect(design).toContain("Audit mechanism failure MUST NEVER convert a denied or ambiguous operation into success");
    expect(design).toContain("Do not solve authority/security audit durability with financial ledger writes");
  });

  it("contains the required adversarial threat matrix", () => {
    const design = readDesign();
    const rows = threatMatrixRows(design);

    expect(design).toContain("## Threat Matrix");
    expect(design).toContain("THREAT_CASE_COUNT = 32");
    expect(rows).toHaveLength(32);
    expect(design).toContain("User A selects Account B");
    expect(design).toContain("User A supplies Tenant B");
    expect(design).toContain("forged userId");
    expect(design).toContain("forged accountId");
    expect(design).toContain("forged tenantId");
    expect(design).toContain("duplicate Principal records for same Clerk subject");
    expect(design).toContain("attempted external identity reassignment");
    expect(design).toContain("serialized/fabricated AuthorizedInvestingContext");
    expect(design).toContain("direct repository call with service_role");
    expect(design).toContain("fake SYSTEM_ACTOR");
    expect(design).toContain("SYSTEM_ACTOR missing capability");
    expect(design).toContain("Principal DISABLED");
    expect(design).toContain("Tenant SUSPENDED");
    expect(design).toContain("Tenant CLOSED");
    expect(design).toContain("TenantMembership REVOKED");
    expect(design).toContain("AccountAccess REVOKED");
    expect(design).toContain("Account FROZEN");
    expect(design).toContain("Account CLOSED");
    expect(design).toContain("membership revoked between resolve and mutation");
    expect(design).toContain("account frozen between resolve and mutation");
    expect(design).toContain("concurrent initial bootstrap with same key");
    expect(design).toContain("concurrent initial bootstrap with different keys");
    expect(design).toContain("second initial bootstrap after successful bootstrap");
    expect(design).toContain("same idempotency key + different payload");
    expect(design).toContain("duplicate active membership corruption");
    expect(design).toContain("duplicate active AccountAccess");
    expect(design).toContain("account/tenant relationship corruption");
    expect(design).toContain("account tenant reassignment attempt");
    expect(design).toContain("membership endpoint reassignment attempt");
    expect(design).toContain("account access endpoint reassignment attempt");
    expect(design).toContain("missing authority evidence");
    expect(design).toContain("authority denied after transactional revalidation and transaction rolls back");
  });

  it("keeps the database transport unresolved and excludes dashboard/UI scope", () => {
    const design = readDesign();

    expect(design).toContain("Target schema remains:");
    expect(design).toContain("investing.*");
    expect(design).toContain("DATA_API_EXPOSED_SCHEMA_CONFIGURATION = UNAVAILABLE / MUST VERIFY");
    expect(design).toContain("FINAL_DB_TRANSPORT = UNRESOLVED GATE");
    expect(design).toContain("OPTION A: Supabase Data API / service_role transport");
    expect(design).toContain("OPTION B: direct PostgreSQL/Supavisor with dedicated application role");
    expect(design).toContain("I1 does not select PostgREST");
    expect(design).toContain("DB_TRANSPORT_DECISION = UNRESOLVED");
    expect(design).toContain("financial tables are never exposed directly to browser `anon` or `authenticated` clients");
    expect(design).toContain("NO_DASHBOARD_UI_SCOPE = TRUE");
    expect(design).toContain("no product dashboard");
    expect(design).toContain("no UI discovery");
  });
});
