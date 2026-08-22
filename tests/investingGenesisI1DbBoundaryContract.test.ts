import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(repoRoot, "docs", "investing-genesis", "I1_DB_BOUNDARY_CONTRACT.md");

function readContract() {
  return fs.readFileSync(contractPath, "utf8");
}

function threatRows(contract: string) {
  return contract
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .filter((line) => !line.includes(" --- "))
    .filter((line) => !line.includes("case | attack/precondition"));
}

function declaredThreatCount(contract: string) {
  const match = contract.match(/THREAT_CASE_COUNT = (\d+)/);
  if (!match) {
    throw new Error("Missing THREAT_CASE_COUNT");
  }
  return Number.parseInt(match[1], 10);
}

describe("Investing Genesis I1 database boundary contract", () => {
  it("freezes verified inputs and local dependency/config inspection without choosing unverified facts", () => {
    const contract = readContract();

    expect(contract).toContain("I1_CHECKPOINT_SHA =\nc5a8b0114290e60bfa1ce2d775495e369675a860");
    expect(contract).toContain("LIVE_SUPABASE_PROJECT =\nqdnvbamoamtkujzwrxdb");
    expect(contract).toContain("POSTGRESQL =\n17.6.1.063");
    expect(contract).toContain("CURRENT_DATABASE =\npostgres");
    expect(contract).toContain("investing schema =\nABSENT");
    expect(contract).toContain("investing named roles =\nNONE");
    expect(contract).toContain("rolbypassrls = true");
    expect(contract).toContain("pgrst.db_schemas =\nUNAVAILABLE / MUST VERIFY");
    expect(contract).toContain("DATABASE_PUBLIC_PRIVILEGES =\nCONNECT + TEMP");
    expect(contract).toContain("PUBLIC_SCHEMA_PUBLIC_PRIVILEGES =\nUSAGE");
    expect(contract).toContain("PUBLIC_SCHEMA_FUNCTIONS_TOTAL = 11");
    expect(contract).toContain("PUBLIC_EXECUTABLE_FUNCTIONS = 10");
    expect(contract).toContain("PUBLIC_EXECUTABLE_SECURITY_DEFINER_FUNCTIONS = 0");
    expect(contract).toContain("PUBLIC_TABLE_GRANTS = 0");
    expect(contract).toContain("postgres default function privileges in public =\nowner-only for future functions");
    expect(contract).toContain("Vercel runtime =\nNode.js 24.x");
    expect(contract).toContain("`@supabase/supabase-js` is a runtime dependency at `2.93.3`");
    expect(contract).toContain("`pg` runtime dependency = ABSENT");
    expect(contract).toContain("`pg` devDependency = `^8.22.0`");
    expect(contract).toContain("`@vercel/functions` runtime dependency = ABSENT");
    expect(contract).toContain("does not define `INVESTING_DATABASE_URL`");
    expect(contract).toContain("Current actual Investing secret provisioning is UNAVAILABLE / NOT YET VERIFIED");
  });

  it("selects Supavisor transaction mode and rejects Data API/service_role as canonical Investing runtime authority", () => {
    const contract = readContract();

    expect(contract).toContain("INVESTING_RUNTIME_DB_TRANSPORT =\nSUPABASE SHARED POOLER / SUPAVISOR\nTRANSACTION MODE\nPORT 6543");
    expect(contract).toContain("Investing runtime MUST NOT use the Supabase Data API");
    expect(contract).toContain("Investing runtime MUST NOT use `service_role`");
    expect(contract).toContain("Direct Postgres connection is NOT the normal Vercel runtime transport");
    expect(contract).toContain("Direct/admin connection may later be used only for controlled migration/administrative tooling");
  });

  it("freezes investing_owner and investing_app separation with least privilege and NOBYPASSRLS", () => {
    const contract = readContract();

    expect(contract).toContain("`investing_owner` MUST NOT be an application runtime credential");
    expect(contract).toContain("Dedicated Vercel/server runtime DB role");
    expect(contract).toContain("NOINHERIT");
    expect(contract).toContain("NOBYPASSRLS");
    expect(contract).toContain("`investing_app` MUST NOT:");
    expect(contract).toContain("own Investing tables");
    expect(contract).toContain("own Investing schema");
    expect(contract).toContain("access `auth.*`");
    expect(contract).toContain("access `storage.*`");
    expect(contract).toContain("access Trading-owned objects");
    expect(contract).toContain("access arbitrary `public.*` objects");
    expect(contract).not.toContain("- perform DDL");
    expect(contract).toContain("CREATE persistent schemas");
    expect(contract).toContain("CREATE persistent tables/views/functions/sequences");
    expect(contract).toContain("ALTER persistent Investing/shared objects");
    expect(contract).toContain("DROP persistent Investing/shared objects");
    expect(contract).toContain("own persistent application objects");
    expect(contract).toContain("perform migrations");
    expect(contract).toContain("SET ROLE into a privileged role");
    expect(contract).toContain("Persistent DDL = prohibited");
    expect(contract).toContain("Temporary-object technical capability = currently inherited from PUBLIC / threat-modeled");
    expect(contract).toContain("Runtime use of temporary objects = prohibited");
    expect(contract).toContain("Role Inheritance And Membership Closure");
    expect(contract).toContain("directly or transitively a member of");
    expect(contract).toContain("`investing_owner`");
    expect(contract).toContain("`postgres`");
    expect(contract).toContain("`service_role`");
    expect(contract).toContain("`authenticator`");
    expect(contract).toContain("`supabase_admin`");
    expect(contract).toContain("`supabase_auth_admin`");
    expect(contract).toContain("`supabase_storage_admin`");
    expect(contract).toContain("any migration role");
    expect(contract).toContain("any DDL-capable role");
    expect(contract).toContain("any BYPASSRLS role");
    expect(contract).toContain("Future migration verification MUST inspect direct and transitive role memberships");
    expect(contract).toContain("NOINHERIT does not neutralize privileges granted to PUBLIC");
    expect(contract).toContain("would inherit existing PUBLIC capabilities unless those surfaces are separately closed");
    expect(contract).toContain("CURRENT_PRE_ISOLATION_STATE");
    expect(contract).toContain("`investing_app` does not yet exist");
    expect(contract).toContain("database TEMP");
    expect(contract).toContain("existing PUBLIC EXECUTE function surface");
    expect(contract).toContain("CURRENT_PRE_ISOLATION_STATE does NOT yet prove zero Trading/public callable surface");
    expect(contract).toContain("I1 runtime/migration application remains BLOCKED");
    expect(contract).toContain("SHARED_PUBLIC_ACL_ISOLATION =\nMUST RESOLVE BEFORE investing_app IS CREATED/USED AS PRODUCTION RUNTIME");
    expect(contract).toContain("The resolution MUST NOT be invented in this slice");
    expect(contract).toContain("selective audited revocation of legacy PUBLIC EXECUTE privileges");
    expect(contract).toContain("stronger database/project isolation");
    expect(contract).toContain("No Trading ACL may be changed in this slice");
    expect(contract).toContain("TARGET_POST_ISOLATION_STATE");
    expect(contract).toContain("no Trading object DML");
    expect(contract).toContain("no Trading function EXECUTE");
    expect(contract).toContain("no arbitrary public object DML/EXECUTE");
    expect(contract).toContain("no persistent-schema DDL");
    expect(contract).toContain("Do not represent TARGET guarantees as already-real CURRENT facts");
    expect(contract).toContain("`investing_app` credential = transport/database capability");
    expect(contract).toContain("`investing_app` credential != USER_PRINCIPAL");
    expect(contract).toContain("`investing_app` credential != Tenant ownership");
    expect(contract).toContain("`investing_app` credential != Account ownership");
    expect(contract).toContain("`investing_app` credential != AuthorizedInvestingContext");
    expect(contract).toContain("possession of the Investing runtime DB credential");
    expect(contract).toContain("It does NOT prove which Syntrake user is acting");
    expect(contract).toContain("Current database grants TEMP to PUBLIC");
    expect(contract).toContain("do NOT claim that `investing_app` is technically incapable of all DDL");
    expect(contract).toContain("no persistent-schema DDL capability");
    expect(contract).toContain("no persistent object ownership");
    expect(contract).toContain("no CREATE on `investing`, `public`, `auth`, or `storage` schemas");
    expect(contract).toContain("runtime code MUST NEVER use temporary tables as authority, persistence, coordination, or transaction state");
    expect(contract).toContain("SHARED_DB_TEMP_CAPABILITY =\nVERIFIED / MUST BE THREAT-MODELED");
    expect(contract).toContain("decision to revoke database TEMP from PUBLIC is project-wide");
    expect(contract).toContain("CURRENT_SHARED_DB_TEMP_CAPABILITY");
    expect(contract).toContain("PUBLIC TEMP means a login role may technically create temporary objects");
    expect(contract).toContain("Runtime code MUST NEVER use TEMP objects");
    expect(contract).toContain("TRUNCATE");
    expect(contract).toContain("REFERENCES");
    expect(contract).toContain("TRIGGER");
    expect(contract).toContain("MAINTAIN");
    expect(contract).toContain("ALL PRIVILEGES");
    expect(contract).toContain("TRUNCATE is not protected by RLS");
    expect(contract).toContain("REFERENCES is not protected by RLS");
    expect(contract).toContain("Grants must be explicit per object and operation");
  });

  it("blocks browser/Data API access and preserves unresolved exposed-schema gates", () => {
    const contract = readContract();

    expect(contract).toContain("browser -> `investing.*` = IMPOSSIBLE");
    expect(contract).toContain("anon -> `investing.*` = NO ACCESS");
    expect(contract).toContain("authenticated -> `investing.*` = NO ACCESS");
    expect(contract).toContain("service_role -> `investing.*` = NO NORMAL APPLICATION ACCESS");
    expect(contract).toContain("PUBLIC -> `investing.*` = NO ACCESS");
    expect(contract).toContain("`PUBLIC_SCHEMA_PUBLIC_PRIVILEGES = USAGE` is schema visibility only");
    expect(contract).toContain("Schema USAGE alone must not be described as table/row access");
    expect(contract).toContain("`investing` MUST NOT be added to PostgREST/Data API exposed schemas");
    expect(contract).toContain("first migration/application is BLOCKED until that external configuration is verified");
    expect(contract).toContain("Never rely on Supabase defaults");
    expect(contract).toContain("database ACL");
    expect(contract).toContain("PUBLIC = NO privileges on `investing` schema objects");
    expect(contract).toContain("anon = NO privileges");
    expect(contract).toContain("authenticated = NO privileges");
    expect(contract).toContain("service_role = NO normal application privileges");
    expect(contract).toContain("future tables must not regain PUBLIC access through default privileges");
    expect(contract).toContain("future functions must not regain PUBLIC access through default privileges");
    expect(contract).toContain("future sequences must not regain PUBLIC access through default privileges");
    expect(contract).toContain("future views must not regain PUBLIC access through default privileges");
    expect(contract).toContain("Migration verification must inspect");
    expect(contract).toContain("schema ACL");
    expect(contract).toContain("table ACL");
    expect(contract).toContain("sequence ACL");
    expect(contract).toContain("function ACL");
    expect(contract).toContain("default ACL");
    expect(contract).toContain("view security mode");
  });

  it("requires RLS defense in depth using persisted canonical authority instead of client IDs", () => {
    const contract = readContract();

    expect(contract).toContain("Future authority and financial tables must use RLS as defense-in-depth");
    expect(contract).toContain("ENABLE ROW LEVEL SECURITY");
    expect(contract).toContain("FORCE ROW LEVEL SECURITY");
    expect(contract).toContain("PostgreSQL table owners normally bypass RLS even without BYPASSRLS");
    expect(contract).toContain("investing_owner NOBYPASSRLS alone is insufficient");
    expect(contract).toContain("must also be subject to RLS through FORCE ROW LEVEL SECURITY");
    expect(contract).toContain("Any future exception must be explicit, independently audited");
    expect(contract).toContain("RLS defense-in-depth protects against application mistakes, missing scope, stale scope, and cross-account query defects");
    expect(contract).toContain("RLS is not falsely represented as an independent identity provider");
    expect(contract).toContain("RLS must NEVER treat a client-provided `userId`, `tenantId`, or `accountId` as ownership proof");
    expect(contract).toContain("Principal");
    expect(contract).toContain("TenantMembership");
    expect(contract).toContain("AccountAccess");
    expect(contract).toContain("InvestingAccount");
    expect(contract).toContain("account_id = request.accountId");
    expect(contract).toContain("without canonical persisted authority validation");
  });

  it("requires transaction-local authority context and forbids session authority under transaction pooling", () => {
    const contract = readContract();

    expect(contract).toContain("Supavisor transaction pooling means no authority may depend on persistent session state");
    expect(contract).toContain("SET SESSION");
    expect(contract).toContain("persistent custom GUC state");
    expect(contract).toContain("session-scoped authorization");
    expect(contract).toContain("connection identity as end-user identity");
    expect(contract).toContain("SET ROLE authorization");
    expect(contract).toContain("temp-table authority");
    expect(contract).toContain("session advisory locks");
    expect(contract).toContain("verify no stale Syntrake transaction context");
    expect(contract).toContain("establish TRANSACTION-LOCAL authority context");
    expect(contract).toContain("Transaction-local GUC/context values are scope carriers and guardrails, NOT independent authentication proof");
    expect(contract).toContain("`principal_id`, `tenant_id`, `account_id`, `actor_id`, and `operation` stored in transaction-local DB context MUST NEVER be accepted merely because they exist");
    expect(contract).toContain("They are authority evidence, NOT client authority");
    expect(contract).toContain("Do not describe GUC state as trusted user identity");
    expect(contract).toContain("Persisted canonical relationships must still be validated");
  });

  it("freezes pooler contamination and transaction-mode restrictions", () => {
    const contract = readContract();

    expect(contract).toContain("Account A authority context\nMUST NEVER survive\nCOMMIT or ROLLBACK\ninto Account B transaction");
    expect(contract).toContain("explicit contamination preflight");
    expect(contract).toContain("FAIL CLOSED\nINTERNAL_ERROR\nAUDIT");
    expect(contract).toContain("prepared statements = NOT ALLOWED");
    expect(contract).toContain("LISTEN/NOTIFY dependency = NOT ALLOWED");
    expect(contract).toContain("persistent temp tables = NOT ALLOWED");
    expect(contract).toContain("session SET = NOT ALLOWED");
    expect(contract).toContain("All material transactions must remain on one acquired client");
    expect(contract).toContain("Never perform a transaction through independent `pool.query()` calls");
  });

  it("preserves mutation-time authority revalidation, audit durability, and migration/runtime credential separation", () => {
    const contract = readContract();

    expect(contract).toContain("request-time authorize() alone = INSUFFICIENT");
    expect(contract).toContain("Mutation transaction must revalidate");
    expect(contract).toContain("complete canonical tuple");
    expect(contract).toContain("AuditEvent != financial ledger");
    expect(contract).toContain("mutation + required success audit\nmust commit atomically");
    expect(contract).toContain("Required denial/security audit must then be durably emitted independently");
    expect(contract).toContain("Failure of the denial-audit write MUST NEVER cause the original denied operation to become successful");
    expect(contract).toContain("migration/admin capability != investing_app runtime capability");
    expect(contract).toContain("Runtime secret must never possess migration capability or persistent-schema DDL power");
    expect(contract).toContain("Migration tooling must never use the normal Vercel runtime credential");
  });

  it("freezes Vercel Node runtime and server-only DB secret constraints", () => {
    const contract = readContract();

    expect(contract).toContain("Investing DB-backed runtime must use");
    expect(contract).toContain("Node.js runtime");
    expect(contract).toContain("Do not use Edge Runtime for canonical financial persistence");
    expect(contract).toContain("INVESTING_DATABASE_URL");
    expect(contract).toContain("It MUST NOT be:");
    expect(contract).toContain("`NEXT_PUBLIC_*`");
    expect(contract).toContain("returned to client");
    expect(contract).toContain("logged");
    expect(contract).toContain("committed to repository");
    expect(contract).toContain("Preview, staging, and production credentials must be independently scoped");
    expect(contract).toContain("TLS Transport Contract");
    expect(contract).toContain("ssl = on");
    expect(contract).toContain("ssl_min_protocol_version = TLSv1.2");
    expect(contract).toContain("SERVER_SSL_ENFORCEMENT =\nUNAVAILABLE / MUST VERIFY");
    expect(contract).toContain("INVESTING_DB_TLS =\nREQUIRED");
    expect(contract).toContain("CA_VERIFICATION =\nREQUIRED");
    expect(contract).toContain("HOSTNAME_VERIFICATION =\nREQUIRED");
    expect(contract).toContain("EFFECTIVE_MODE =\nVERIFY_FULL OR EQUIVALENT");
    expect(contract).toContain("sslmode=disable");
    expect(contract).toContain("sslmode=allow");
    expect(contract).toContain("sslmode=prefer");
    expect(contract).toContain("TLS with rejectUnauthorized=false");
    expect(contract).toContain("plaintext fallback");
    expect(contract).toContain("accepting arbitrary/self-signed server certificates");
    expect(contract).toContain("sslmode=require alone is insufficient");
    expect(contract).toContain("UNRESOLVED / MUST VERIFY BEFORE RUNTIME DEPLOYMENT");
    expect(contract).toContain("CA configuration remain server-only");
  });

  it("freezes privileged function and view boundaries outside RLS shortcuts", () => {
    const contract = readContract();

    expect(contract).toContain("Any future runtime-callable SECURITY DEFINER function:");
    expect(contract).toContain("MUST NOT be owned by `postgres`");
    expect(contract).toContain("MUST NOT be owned by a superuser");
    expect(contract).toContain("MUST NOT be owned by a BYPASSRLS role");
    expect(contract).toContain("MUST NOT be owned by `service_role`");
    expect(contract).toContain("MUST NOT be owned by a migration/admin role");
    expect(contract).toContain("MUST NOT be owned by any role able to escape Investing least privilege");
    expect(contract).toContain("FORCE RLS does NOT constrain superusers/BYPASSRLS roles");
    expect(contract).toContain("Prefer SECURITY INVOKER");
    expect(contract).toContain("SECURITY DEFINER remains exceptional and independently audited");
    expect(contract).toContain("Runtime-visible views must not create an RLS bypass");
    expect(contract).toContain("security_invoker = true");
    expect(contract).toContain("unless a future independently audited design proves another safe model");
  });

  it("preserves hard unresolved gates and keeps dashboard, UI, Trading, SQL, and migrations out of scope", () => {
    const contract = readContract();

    expect(contract).toContain("CUSTOM_ROLE_SUPAVISOR_LOGIN = MUST VERIFY ON CONTROLLED CURRENT-STATE DEVELOPMENT DATABASE");
    expect(contract).toContain("EXACT_SUPAVISOR_CONNECTION_STRING = MUST VERIFY / NEVER INVENT");
    expect(contract).toContain("DATA_API_EXPOSED_SCHEMA_CONFIGURATION = MUST VERIFY BEFORE FIRST MIGRATION");
    expect(contract).toContain("VERCEL_INVESTING_DATABASE_SECRET = NOT YET VERIFIED");
    expect(contract).toContain("POOL_SIZE = MUST MEASURE");
    expect(contract).toContain("STATEMENT_TIMEOUT = MUST MEASURE");
    expect(contract).toContain("LOCK_TIMEOUT = MUST MEASURE");
    expect(contract).toContain("IDLE_IN_TRANSACTION_TIMEOUT = MUST MEASURE");
    expect(contract).toContain("SHARED_PUBLIC_ACL_ISOLATION = MUST RESOLVE");
    expect(contract).toContain("SERVER_SSL_ENFORCEMENT = MUST VERIFY");
    expect(contract).toContain("VERCEL_CA_PROVISIONING = MUST VERIFY");
    expect(contract).toContain("no UI or dashboard scope");
    expect(contract).toContain("no Trading modification");
    expect(contract).toContain("no SQL execution");
    expect(contract).toContain("no migration creation");
  });

  it("contains the required database boundary threat model", () => {
    const contract = readContract();
    const rows = threatRows(contract);

    expect(contract).toContain("THREAT_CASE_COUNT = 57");
    expect(declaredThreatCount(contract)).toBe(rows.length);
    expect(rows).toHaveLength(57);
    expect(contract).toContain("browser attempts direct Investing DB access");
    expect(contract).toContain("anon access");
    expect(contract).toContain("authenticated access");
    expect(contract).toContain("service_role treated as authority");
    expect(contract).toContain("investing_app attempts auth.* access");
    expect(contract).toContain("investing_app attempts Trading access");
    expect(contract).toContain("investing_app attempts arbitrary public.* access");
    expect(contract).toContain("investing_app attempts persistent-schema DDL");
    expect(contract).toContain("PUBLIC TEMP remains separate technical capability");
    expect(contract).not.toContain("Runtime role has no DDL capability");
    expect(contract).toContain("investing_app attempts CREATE ROLE");
    expect(contract).toContain("investing_app attempts BYPASSRLS");
    expect(contract).toContain("investing_app attempts SET ROLE");
    expect(contract).toContain("investing_app inherits Trading/public function EXECUTE through PUBLIC");
    expect(contract).toContain("BLOCK I1 runtime/migration application until shared ACL isolation is proven");
    expect(contract).toContain("accidental direct privileged role membership");
    expect(contract).toContain("transitive role inheritance escalation");
    expect(contract).toContain("table owner accesses financial row without FORCE RLS");
    expect(contract).toContain("SECURITY DEFINER function owned by table owner unintentionally bypasses RLS");
    expect(contract).toContain("runtime-callable SECURITY DEFINER owned by privileged role");
    expect(contract).toContain("runtime-visible view bypasses RLS");
    expect(contract).toContain("stolen/compromised investing_app credential");
    expect(contract).toContain("Before shared ACL closure:");
    expect(contract).toContain("blast radius may include inherited PUBLIC EXECUTE surfaces");
    expect(contract).toContain("blast radius may include PUBLIC TEMP");
    expect(contract).toContain("this is why runtime creation/use is BLOCKED");
    expect(contract).toContain("After accepted ACL isolation:");
    expect(contract).toContain("expected verified blast radius is constrained to the explicitly granted Investing runtime surface");
    expect(contract).toContain("unavoidable shared database capabilities must have been independently accepted");
    expect(contract).toContain("Structurally preserved constraints:");
    expect(contract).not.toContain("- no DDL\n");
    expect(contract).not.toContain("- no access outside explicitly granted Investing surface");
    expect(contract).toContain("TEMP object created under transaction pooling");
    expect(contract).toContain("TEMP/session state survives into reused backend connection");
    expect(contract).toContain("compromised investing_app abuses TEMP for resource/session-state effects");
    expect(contract).toContain("TRUNCATE granted to investing_app");
    expect(contract).toContain("REFERENCES privilege used outside RLS boundary");
    expect(contract).toContain("accidental GRANT ALL to investing_app");
    expect(contract).toContain("plaintext/fallback DB connection");
    expect(contract).toContain("TLS without certificate verification");
    expect(contract).toContain("hostname not verified");
    expect(contract).toContain("CA material misconfigured causing unsafe fallback");
    expect(contract).toContain("PRIVILEGED_RUNTIME_CREDENTIAL_COMPROMISE");
    expect(contract).toContain("SECURITY_INCIDENT");
    expect(contract).toContain("FAIL CLOSED WHERE POSSIBLE");
    expect(contract).toContain("ROTATE/REVOKE CREDENTIAL");
    expect(contract).toContain("Transaction GUCs alone do NOT provide cryptographic per-user identity isolation");
    expect(contract).toContain("forged accountId");
    expect(contract).toContain("forged tenantId");
    expect(contract).toContain("forged principalId");
    expect(contract).toContain("RLS context without persisted membership");
    expect(contract).toContain("RLS context without AccountAccess");
    expect(contract).toContain("mismatched account/tenant");
    expect(contract).toContain("duplicated membership");
    expect(contract).toContain("duplicated AccountAccess");
    expect(contract).toContain("session-context leakage Account A -> Account B");
    expect(contract).toContain("rollback context leakage");
    expect(contract).toContain("timeout context leakage");
    expect(contract).toContain("exception context leakage");
    expect(contract).toContain("named prepared statement under Supavisor transaction mode");
    expect(contract).toContain("transaction split across multiple pool clients");
    expect(contract).toContain("stale AuthorizedInvestingContext");
    expect(contract).toContain("membership revoked after request authorize");
    expect(contract).toContain("account frozen after request authorize");
    expect(contract).toContain("SQL injection via selector");
    expect(contract).toContain("malicious search_path");
    expect(contract).toContain("SECURITY DEFINER privilege escalation");
    expect(contract).toContain("runtime credential used for migration");
    expect(contract).toContain("migration credential exposed to runtime");
    expect(contract).toContain("DATABASE_URL exposed to browser");
    expect(contract).toContain("connection string logged");
    expect(contract).toContain("denial audit rolled back with mutation");
    expect(contract).toContain("audit failure accidentally allowing operation");
    expect(contract).toContain("missing DB authority context");
    expect(contract).toContain("unexpected pre-existing DB authority context");
  });
});
