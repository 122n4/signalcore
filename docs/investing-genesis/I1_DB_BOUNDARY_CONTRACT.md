# Investing Genesis I1 Database Boundary Contract

PARENT_SHA =
c5a8b0114290e60bfa1ce2d775495e369675a860

I1_DB_BOUNDARY_CONTRACT is design and threat model only.

This slice creates no runtime code, API, UI, SQL, migration, Supabase mutation, Vercel mutation, package change, commit, push, or PR.

## Verified External Inputs

I1_CHECKPOINT_SHA =
c5a8b0114290e60bfa1ce2d775495e369675a860

LIVE_SUPABASE_PROJECT =
qdnvbamoamtkujzwrxdb

POSTGRESQL =
17.6.1.063

CURRENT_DATABASE =
postgres

investing schema =
ABSENT

investing named roles =
NONE

service_role:

- rolsuper = false
- rolcanlogin = false
- rolcreatedb = false
- rolcreaterole = false
- rolreplication = false
- rolbypassrls = true

pgrst.db_schemas =
UNAVAILABLE / MUST VERIFY

effective PostgREST exposed-schema configuration =
UNAVAILABLE / MUST VERIFY BEFORE FIRST MIGRATION

DATABASE_PUBLIC_PRIVILEGES =
CONNECT + TEMP

PUBLIC_SCHEMA_PUBLIC_PRIVILEGES =
USAGE

PUBLIC_SCHEMA_FUNCTIONS_TOTAL = 11

PUBLIC_EXECUTABLE_FUNCTIONS = 10

PUBLIC_EXECUTABLE_SECURITY_DEFINER_FUNCTIONS = 0

PUBLIC_TABLE_GRANTS = 0

postgres default function privileges in public =
owner-only for future functions

Vercel project =
signalcore

Vercel runtime =
Node.js 24.x

## Local Repository Inspection

package.json:

- `@supabase/supabase-js` is a runtime dependency at `2.93.3`.
- `pg` is absent from runtime dependencies.
- `pg` is present only in devDependencies at `^8.22.0`.
- `@vercel/functions` is absent from runtime dependencies and devDependencies.

.env.example:

- contains `SUPABASE_URL`
- contains `SUPABASE_SERVICE_ROLE_KEY`
- contains `NEXT_PUBLIC_SUPABASE_URL`
- does not define `INVESTING_DATABASE_URL`
- does not prove any current Investing DB credential exists

Existing Supabase DB helpers:

- `lib/supabase/admin.ts` creates a Supabase JS admin client.
- `lib/supabase/admin.ts` reads `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`.
- `lib/supabase/admin.ts` reads `SUPABASE_SERVICE_ROLE_KEY`.
- `lib/supabase/admin.ts` optionally loads `.env.research`.
- This helper is current shared/Trading-era infrastructure and is NOT Investing Genesis financial authority.

Existing Vercel/server runtime configuration:

- `vercel.json` currently defines cron schedules only.
- `next.config.ts` defines Next configuration and redirects, not Investing DB runtime.
- Existing server routes commonly declare `export const runtime = "nodejs"`.
- No current local config proves `INVESTING_DATABASE_URL` exists in Vercel.
- Current actual Investing secret provisioning is UNAVAILABLE / NOT YET VERIFIED.

## Final Runtime Transport Decision

INVESTING_RUNTIME_DB_TRANSPORT =
SUPABASE SHARED POOLER / SUPAVISOR
TRANSACTION MODE
PORT 6543

Reason:

- Vercel/serverless transient connections
- IPv4 compatibility
- connection pooling
- no need for browser Data API access

Investing runtime MUST NOT use the Supabase Data API as its canonical financial persistence transport.

Investing runtime MUST NOT use `service_role` as its normal DB credential or authority.

Direct Postgres connection is NOT the normal Vercel runtime transport.

Direct/admin connection may later be used only for controlled migration/administrative tooling under a separate credential and explicit authorization.

## Database Role Model

Conceptual future roles:

- `investing_owner`
- `investing_app`

### investing_owner

Object/schema owner.

Required attributes:

- NOLOGIN
- NOINHERIT
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS

Owns future:

- `investing` schema
- Investing tables
- Investing functions
- Investing sequences
- Investing views where applicable

`investing_owner` MUST NOT be an application runtime credential.

### investing_app

Dedicated Vercel/server runtime DB role.

Required attributes:

- LOGIN
- NOINHERIT
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS

`investing_app` MUST NOT:

- own Investing tables
- own Investing schema
- create schemas
- create roles
- alter roles
- bypass RLS
- access `auth.*`
- access `storage.*`
- access Trading-owned objects
- access arbitrary `public.*` objects
- CREATE persistent schemas
- CREATE persistent tables/views/functions/sequences
- ALTER persistent Investing/shared objects
- DROP persistent Investing/shared objects
- own persistent application objects
- perform migrations
- grant privileges
- SET ROLE into a privileged role

Persistent DDL = prohibited.

Temporary-object technical capability = currently inherited from PUBLIC / threat-modeled.

Runtime use of temporary objects = prohibited.

NOINHERIT does not neutralize privileges granted to PUBLIC.

Therefore a new `investing_app` in the current shared database would inherit existing PUBLIC capabilities unless those surfaces are separately closed.

CURRENT_PRE_ISOLATION_STATE:

`investing_app` does not yet exist.

If created against the current shared DB without ACL closure, it would inherit PUBLIC capabilities including:

- database TEMP
- existing PUBLIC EXECUTE function surface

Therefore CURRENT_PRE_ISOLATION_STATE does NOT yet prove zero Trading/public callable surface.

I1 runtime/migration application remains BLOCKED.

SHARED_PUBLIC_ACL_ISOLATION =
MUST RESOLVE BEFORE investing_app IS CREATED/USED AS PRODUCTION RUNTIME

The resolution MUST NOT be invented in this slice.

Candidate future resolutions may include:

- selective audited revocation of legacy PUBLIC EXECUTE privileges
- stronger database/project isolation

Choosing or applying either resolution is OUT OF SCOPE here.

No Trading ACL may be changed in this slice.

TARGET_POST_ISOLATION_STATE:

After SHARED_PUBLIC_ACL_ISOLATION is independently proven, `investing_app` must have:

- no Trading object DML
- no Trading function EXECUTE
- no arbitrary public object DML/EXECUTE
- no `auth.*` access
- no `storage.*` access
- no persistent-schema DDL
- no migration capability
- no privileged SET ROLE
- no BYPASSRLS

Do not represent TARGET guarantees as already-real CURRENT facts.

Runtime privileges must be minimum explicit grants only.

### Role Inheritance And Membership Closure

`investing_app` MUST NOT be directly or transitively a member of:

- `investing_owner`
- `postgres`
- `service_role`
- `authenticator`
- `supabase_admin`
- `supabase_auth_admin`
- `supabase_storage_admin`
- any migration role
- any DDL-capable role
- any BYPASSRLS role

No role membership may allow `investing_app` to `SET ROLE` into a more privileged identity.

Future migration verification MUST inspect direct and transitive role memberships.

### Database Credential Is Capability, Not User Authority

`investing_app` credential = transport/database capability.

`investing_app` credential != USER_PRINCIPAL.

`investing_app` credential != Tenant ownership.

`investing_app` credential != Account ownership.

`investing_app` credential != AuthorizedInvestingContext.

A successful PostgreSQL login as `investing_app` proves only:

```text
possession of the Investing runtime DB credential
```

It does NOT prove which Syntrake user is acting.

### Public TEMP Truth Boundary

Current database grants TEMP to PUBLIC.

Therefore do NOT claim that `investing_app` is technically incapable of all DDL.

Freeze instead:

- `investing_app` MUST have no persistent-schema DDL capability
- `investing_app` MUST have no persistent object ownership
- `investing_app` MUST have no CREATE on `investing`, `public`, `auth`, or `storage` schemas
- runtime code MUST NEVER use temporary tables as authority, persistence, coordination, or transaction state

SHARED_DB_TEMP_CAPABILITY =
VERIFIED / MUST BE THREAT-MODELED

Any decision to revoke database TEMP from PUBLIC is project-wide and requires a separate impact audit and explicit authorization.

CURRENT_SHARED_DB_TEMP_CAPABILITY:

PUBLIC TEMP means a login role may technically create temporary objects.

Runtime code MUST NEVER use TEMP objects.

### RLS-External Privilege Closure

`investing_app` MUST NEVER receive:

- TRUNCATE
- REFERENCES
- TRIGGER
- MAINTAIN
- ALL PRIVILEGES

Reason:

- TRUNCATE is not protected by RLS
- REFERENCES is not protected by RLS

Grants must be explicit per object and operation.

## Schema And Data API Isolation

Target schema remains:

```text
investing.*
```

Frozen access contract:

- browser -> `investing.*` = IMPOSSIBLE
- anon -> `investing.*` = NO ACCESS
- authenticated -> `investing.*` = NO ACCESS
- service_role -> `investing.*` = NO NORMAL APPLICATION ACCESS
- PUBLIC -> `investing.*` = NO ACCESS

`PUBLIC_SCHEMA_PUBLIC_PRIVILEGES = USAGE` is schema visibility only.

Schema USAGE alone must not be described as table/row access.

`investing` MUST NOT be added to PostgREST/Data API exposed schemas.

Actual hosted exposed-schema configuration is currently:

```text
UNAVAILABLE / MUST VERIFY
```

Therefore first migration/application is BLOCKED until that external configuration is verified.

Future migration design must explicitly control:

- database ACL
- schema USAGE
- table privileges
- sequence privileges
- function EXECUTE
- default privileges
- PUBLIC privileges
- anon privileges
- authenticated privileges
- service_role privileges

Never rely on Supabase defaults.

Future `investing_owner` migrations and default ACLs must preserve:

- PUBLIC = NO privileges on `investing` schema objects
- anon = NO privileges
- authenticated = NO privileges
- service_role = NO normal application privileges
- future tables must not regain PUBLIC access through default privileges
- future functions must not regain PUBLIC access through default privileges
- future sequences must not regain PUBLIC access through default privileges
- future views must not regain PUBLIC access through default privileges

Migration verification must inspect:

- database ACL
- schema ACL
- table ACL
- sequence ACL
- function ACL
- default ACL
- direct role memberships
- transitive role memberships
- RLS enabled
- FORCE RLS
- function owner
- view security mode

## RLS Defense In Depth

Runtime role must be:

- NOBYPASSRLS
- NOT TABLE OWNER

Future authority and financial tables must use RLS as defense-in-depth even though primary authorization remains the I1 server authority boundary.

Future canonical Investing authority and financial tables MUST:

- ENABLE ROW LEVEL SECURITY
- FORCE ROW LEVEL SECURITY

PostgreSQL table owners normally bypass RLS even without BYPASSRLS.

Therefore:

```text
investing_owner NOBYPASSRLS alone is insufficient.
```

`investing_owner`, as table owner, must also be subject to RLS through FORCE ROW LEVEL SECURITY on authority/financial tables.

Any future exception must be explicit, independently audited, and must never become normal runtime access.

RLS defense-in-depth protects against application mistakes, missing scope, stale scope, and cross-account query defects.

RLS is not falsely represented as an independent identity provider.

RLS must NEVER treat a client-provided `userId`, `tenantId`, or `accountId` as ownership proof.

DB authorization must be consistent with canonical:

- Principal
- TenantMembership
- Tenant
- AccountAccess
- InvestingAccount

Do not design policies that merely compare:

```text
account_id = request.accountId
```

without canonical persisted authority validation.

## Transaction-Local Authority Context

Supavisor transaction pooling means no authority may depend on persistent session state.

Forbidden:

- SET SESSION
- persistent custom GUC state
- session-scoped authorization
- connection identity as end-user identity
- SET ROLE authorization
- temp-table authority
- session advisory locks

Material ACCOUNT_SCOPE operation must conceptually use one acquired DB client:

```text
acquire pooled client
  -> BEGIN
  -> verify no stale Syntrake transaction context
  -> establish TRANSACTION-LOCAL authority context
  -> revalidate canonical I1 authority
  -> lock/serialize required authority rows
  -> execute mutation
  -> write success audit
  -> COMMIT
  -> release client
```

On any failure:

```text
ROLLBACK
  -> transaction-local context disappears
  -> release clean connection
```

Future implementation may use PostgreSQL transaction-local configuration such as:

```text
set_config(..., ..., true)
```

This slice MUST NOT write SQL.

Candidate conceptual fields:

- actor_kind
- actor_id
- principal_id
- tenant_id
- account_id
- operation
- correlation_id

Transaction-local GUC/context values are scope carriers and guardrails, NOT independent authentication proof.

`principal_id`, `tenant_id`, `account_id`, `actor_id`, and `operation` stored in transaction-local DB context MUST NEVER be accepted merely because they exist.

They are authority evidence, NOT client authority.

Do not describe GUC state as trusted user identity.

All database policies/functions must still validate persisted canonical relationships.

Persisted canonical relationships must still be validated.

## Pooler Contamination Invariant

Because backend connections are reused:

```text
Account A authority context
MUST NEVER survive
COMMIT or ROLLBACK
into Account B transaction.
```

Future implementation must include an explicit contamination preflight.

If Syntrake transaction-local context is unexpectedly already populated at transaction start:

```text
FAIL CLOSED
INTERNAL_ERROR
AUDIT
```

Never overwrite unexplained stale authority state and continue.

Contamination cleanup must cover:

- Account A then Account B on reused backend connection
- COMMIT cleanup
- ROLLBACK cleanup
- exception cleanup
- timeout cleanup
- connection release after failure

## Prepared Statement And Transaction Mode Restrictions

Frozen restrictions:

- prepared statements = NOT ALLOWED
- LISTEN/NOTIFY dependency = NOT ALLOWED
- persistent temp tables = NOT ALLOWED
- session SET = NOT ALLOWED
- session advisory locks = NOT ALLOWED

Future PostgreSQL client configuration must explicitly avoid named/prepared statements when using Supavisor transaction mode.

All material transactions must remain on one acquired client from BEGIN through COMMIT/ROLLBACK.

Never perform a transaction through independent `pool.query()` calls that might use different clients.

## Concurrency And Locking

I1 remains implementation-neutral on exact SQL syntax.

Frozen invariant:

```text
request-time authorize() alone = INSUFFICIENT
```

Mutation transaction must revalidate:

- Principal ACTIVE
- Tenant ACTIVE
- TenantMembership ACTIVE
- AccountAccess ACTIVE
- InvestingAccount operation-compatible
- operation capability
- complete canonical tuple

Race prevention may use:

- row locking
- unique constraints
- transaction isolation
- optimistic versions

Exact combination is future implementation design.

Do NOT use session advisory locking as required correctness machinery.

## Audit Durability

AuditEvent != financial ledger.

Successful material mutation:

```text
mutation + required success audit
must commit atomically
```

Denial found during transactional revalidation:

```text
mutation transaction rolls back
```

Required denial/security audit must then be durably emitted independently of the rolled-back mutation transaction.

Conceptual sequence:

```text
BEGIN material transaction
  -> revalidation denies
  -> ROLLBACK
  -> separate bounded audit write
  -> return denial
```

Failure of the denial-audit write MUST NEVER cause the original denied operation to become successful.

Exact audit persistence implementation remains future scope.

## Migration Role Is Not Runtime Role

Frozen invariant:

```text
migration/admin capability != investing_app runtime capability
```

Runtime secret must never possess migration capability or persistent-schema DDL power.

Migration tooling must never use the normal Vercel runtime credential.

Production migration remains explicitly owner-authorized only.

Migration path may later use:

- Supabase controlled migration tooling
- direct PostgreSQL administrative connection

but NOT Vercel application runtime.

## Vercel Runtime Contract

Investing DB-backed runtime must use:

```text
Node.js runtime
```

Do not use Edge Runtime for canonical financial persistence.

Database URL/credential must be server-only.

Candidate name:

```text
INVESTING_DATABASE_URL
```

It MUST NOT be:

- `NEXT_PUBLIC_*`
- returned to client
- logged
- embedded in errors
- committed to repository
- embedded in build artifacts

Preview, staging, and production credentials must be independently scoped.

Do not claim the actual Vercel environment variable exists today unless verified.

Current actual secret provisioning:

```text
UNAVAILABLE / NOT YET VERIFIED
```

## Application-Side Connection Pool

Current dependency inspection:

- `pg` runtime dependency = ABSENT
- `pg` devDependency = `^8.22.0`
- `@vercel/functions` runtime dependency = ABSENT
- `@vercel/functions` devDependency = ABSENT

Do NOT change dependencies in this slice.

Future Vercel implementation must use a bounded pool.

Exact settings are:

- pool max = UNRESOLVED / MUST MEASURE
- idle timeout = UNRESOLVED / MUST MEASURE
- connection timeout = UNRESOLVED / MUST MEASURE

If Vercel `attachDatabasePool()` is adopted later, it must be attached immediately after pool creation.

`attachDatabasePool()` is not mandatory before confirming actual dependency/runtime implementation.

## Query Safety

Frozen query safety contract:

- all identifiers controlled by source code
- all user values parameterized
- no string-built SQL from client input
- schema qualification required for sensitive objects
- no implicit public search_path trust

SECURITY DEFINER functions, if ever introduced:

- explicit safe search_path
- minimum owner privilege
- minimum EXECUTE grants
- no PUBLIC EXECUTE
- independently audited

No SECURITY DEFINER function may become an authorization shortcut.

Any future runtime-callable SECURITY DEFINER function:

- MUST NOT be owned by `postgres`
- MUST NOT be owned by a superuser
- MUST NOT be owned by a BYPASSRLS role
- MUST NOT be owned by `service_role`
- MUST NOT be owned by a migration/admin role
- MUST NOT be owned by any role able to escape Investing least privilege

FORCE RLS does NOT constrain superusers/BYPASSRLS roles.

Prefer SECURITY INVOKER.

SECURITY DEFINER remains exceptional and independently audited.

Runtime-visible views must not create an RLS bypass.

Views exposed to `investing_app` must use:

```text
security_invoker = true
```

unless a future independently audited design proves another safe model.

## TLS Transport Contract

Verified DB:

- ssl = on
- ssl_min_protocol_version = TLSv1.2

SERVER_SSL_ENFORCEMENT =
UNAVAILABLE / MUST VERIFY

INVESTING_DB_TLS =
REQUIRED

CA_VERIFICATION =
REQUIRED

HOSTNAME_VERIFICATION =
REQUIRED

EFFECTIVE_MODE =
VERIFY_FULL OR EQUIVALENT

Forbidden:

- sslmode=disable
- sslmode=allow
- sslmode=prefer
- TLS with rejectUnauthorized=false
- plaintext fallback
- accepting arbitrary/self-signed server certificates

sslmode=require alone is insufficient as the final financial-runtime contract because it does not verify CA + hostname.

Exact CA provisioning in Vercel remains:

```text
UNRESOLVED / MUST VERIFY BEFORE RUNTIME DEPLOYMENT
```

The DB URL and CA configuration remain server-only and must never enter `NEXT_PUBLIC_*`.

## Hard Unresolved Gates

These MUST remain explicitly unresolved:

- CUSTOM_ROLE_SUPAVISOR_LOGIN = MUST VERIFY ON CONTROLLED CURRENT-STATE DEVELOPMENT DATABASE
- EXACT_SUPAVISOR_CONNECTION_STRING = MUST VERIFY / NEVER INVENT
- DATA_API_EXPOSED_SCHEMA_CONFIGURATION = MUST VERIFY BEFORE FIRST MIGRATION
- VERCEL_INVESTING_DATABASE_SECRET = NOT YET VERIFIED
- POOL_SIZE = MUST MEASURE
- STATEMENT_TIMEOUT = MUST MEASURE
- LOCK_TIMEOUT = MUST MEASURE
- IDLE_IN_TRANSACTION_TIMEOUT = MUST MEASURE
- SHARED_PUBLIC_ACL_ISOLATION = MUST RESOLVE
- SERVER_SSL_ENFORCEMENT = MUST VERIFY
- VERCEL_CA_PROVISIONING = MUST VERIFY

None of these may silently become guessed implementation facts.

## Threat Model

| case | attack/precondition | boundary checked | expected result | failure classification | audit requirement |
| --- | --- | --- | --- | --- | --- |
| browser attempts direct Investing DB access | Browser or client bundle attempts to reach `investing.*` directly | No Data API exposure, no browser credential, no grants | Reject/no route to financial tables | FORBIDDEN_OR_NOT_FOUND | Actor/session metadata if available, attempted surface |
| anon access | Supabase anon role attempts `investing.*` access | anon privileges revoked/absent | Reject | FORBIDDEN_OR_NOT_FOUND | Role, schema/object, denied operation |
| authenticated access | Supabase authenticated role attempts `investing.*` access | authenticated privileges revoked/absent | Reject | FORBIDDEN_OR_NOT_FOUND | Role, schema/object, denied operation |
| service_role treated as authority | Runtime attempts to authorize because service_role exists | AuthorizedInvestingContext and dedicated role model | Reject service_role as authority | INTERNAL_ERROR | Caller, attempted credential class |
| investing_app attempts auth.* access | Runtime role queries Supabase auth schema | Role grants exclude `auth.*` | Reject | INTERNAL_ERROR | Role, target schema, denied operation |
| investing_app attempts Trading access | TARGET_POST_ISOLATION_STATE runtime role queries Trading-owned object DML or EXECUTE | Post-isolation explicit grants exclude Trading objects | Reject | INTERNAL_ERROR | Role, target object/domain |
| investing_app attempts arbitrary public.* access | TARGET_POST_ISOLATION_STATE runtime role queries unrelated public object DML or EXECUTE | Post-isolation explicit grants only | Reject | INTERNAL_ERROR | Role, target object |
| investing_app attempts persistent-schema DDL | Runtime role attempts persistent CREATE/ALTER/DROP or persistent object ownership | Runtime role has no persistent-schema DDL capability; PUBLIC TEMP remains separate technical capability | Reject | INTERNAL_ERROR | Role, attempted persistent DDL |
| investing_app attempts CREATE ROLE | Runtime role attempts role creation | NOCREATEROLE | Reject | INTERNAL_ERROR | Role, attempted role action |
| investing_app attempts BYPASSRLS | Runtime role attempts to bypass RLS | NOBYPASSRLS | Reject | INTERNAL_ERROR | Role, bypass attempt |
| investing_app attempts SET ROLE | Runtime attempts SET ROLE into privileged role | SET ROLE authorization forbidden and grants absent | Reject | INTERNAL_ERROR | Role, attempted target role |
| investing_app inherits Trading/public function EXECUTE through PUBLIC | New runtime role receives PUBLIC EXECUTE in the shared database | SHARED_PUBLIC_ACL_ISOLATION gate | BLOCK I1 runtime/migration application until shared ACL isolation is proven | INTERNAL_ERROR | Public ACL inventory, function list, isolation decision |
| accidental direct privileged role membership | `investing_app` is directly granted a privileged role | Direct role membership verification | Fail closed before migration/release | INTERNAL_ERROR | Role membership edge and target role |
| transitive role inheritance escalation | `investing_app` can reach privileged role through nested memberships | Transitive role membership verification and NOINHERIT closure | Fail closed before migration/release | INTERNAL_ERROR | Full membership path |
| table owner accesses financial row without FORCE RLS | `investing_owner` owns authority/financial table and FORCE RLS is missing | FORCE ROW LEVEL SECURITY requirement | Fail design gate | INTERNAL_ERROR | Table owner, table, missing FORCE RLS |
| SECURITY DEFINER function owned by table owner unintentionally bypasses RLS | SECURITY DEFINER function runs as table owner without FORCE RLS protection | SECURITY DEFINER audit plus FORCE RLS requirement | Fail design gate | INTERNAL_ERROR | Function owner, function, affected table |
| runtime-callable SECURITY DEFINER owned by privileged role | SECURITY DEFINER function is owned by `postgres`, superuser, BYPASSRLS, `service_role`, migration/admin, or escaping role | SECURITY DEFINER owner closure | Fail design gate | INTERNAL_ERROR | Function owner, function, owner attributes |
| runtime-visible view bypasses RLS | View exposed to `investing_app` runs with definer behavior or unsafe security mode | security_invoker view requirement | Fail design gate | INTERNAL_ERROR | View name, owner, security mode |
| stolen/compromised investing_app credential | Attacker possesses the shared backend DB credential | Role isolation, explicit grants, RLS defense-in-depth, membership closure | Security incident; fail closed where possible; rotate/revoke credential; audit | PRIVILEGED_RUNTIME_CREDENTIAL_COMPROMISE, SECURITY_INCIDENT, FAIL CLOSED WHERE POSSIBLE, ROTATE/REVOKE CREDENTIAL | Credential class, allowed surface, blocked privileged surfaces, incident audit |
| TEMP object created under transaction pooling | Runtime creates temp table/object while using Supavisor transaction mode | Temporary tables forbidden for authority/persistence/coordination/state | Reject design/implementation | INTERNAL_ERROR | Operation, temp object type |
| TEMP/session state survives into reused backend connection | Temp/session state persists across pooled backend reuse | Pooler contamination invariant and temp-state prohibition | Fail closed if detected | INTERNAL_ERROR | Previous temp/session marker, attempted new scope |
| compromised investing_app abuses TEMP for resource/session-state effects | Attacker with runtime credential uses PUBLIC TEMP capability for resource pressure or session-state confusion | SHARED_DB_TEMP_CAPABILITY threat model and runtime temp prohibition | Security incident; fail closed where possible; audit; future revocation decision requires separate project-wide audit | SECURITY_INCIDENT, FAIL CLOSED WHERE POSSIBLE | Temp activity evidence and credential class |
| TRUNCATE granted to investing_app | Runtime role receives TRUNCATE on authority/financial table | RLS-external privilege closure | Fail design gate | INTERNAL_ERROR | Table, grant source |
| REFERENCES privilege used outside RLS boundary | Runtime role uses REFERENCES to create cross-object dependency outside row policy protection | RLS-external privilege closure | Fail design gate | INTERNAL_ERROR | Referencing object, referenced object, grant source |
| accidental GRANT ALL to investing_app | Migration grants ALL PRIVILEGES instead of explicit operations | Explicit grant contract | Fail design gate | INTERNAL_ERROR | Grant statement/object |
| plaintext/fallback DB connection | Runtime DB connection allows plaintext or downgrade fallback | TLS transport contract | Block runtime deployment | INTERNAL_ERROR | Connection mode without secret value |
| TLS without certificate verification | Runtime accepts encrypted transport without CA verification | CA_VERIFICATION requirement | Block runtime deployment | INTERNAL_ERROR | TLS configuration class |
| hostname not verified | Runtime does not verify database server hostname | HOSTNAME_VERIFICATION requirement | Block runtime deployment | INTERNAL_ERROR | TLS configuration class |
| CA material misconfigured causing unsafe fallback | Vercel CA provisioning fails and runtime falls back to unsafe TLS behavior | VERCEL_CA_PROVISIONING unresolved gate and forbidden fallback list | Block runtime deployment | INTERNAL_ERROR | CA provisioning state without secret value |
| forged accountId | Client supplies accountId for another account | Server authority and DB canonical relationship validation | Reject | FORBIDDEN_OR_NOT_FOUND | Principal, account selector, denial |
| forged tenantId | Client supplies tenantId as ownership proof | Tenant derived from canonical account/membership | Reject | FORBIDDEN_OR_NOT_FOUND | Principal, tenant selector |
| forged principalId | Client supplies principalId | Clerk verified identity maps to canonical Principal | Reject forged value | FORBIDDEN_OR_NOT_FOUND | Verified identity, forged value marker |
| RLS context without persisted membership | Transaction context claims tenant without active membership | Persisted TenantMembership validation | Reject | MEMBERSHIP_INACTIVE | Principal, tenant, missing membership |
| RLS context without AccountAccess | Transaction context claims account without active access | Persisted AccountAccess validation | Reject | ACCESS_INACTIVE | Principal, account, missing access |
| mismatched account/tenant | Account tenant differs from membership/access tenant | Complete canonical tuple validation | Fail closed | INTERNAL_ERROR | Tuple evidence and mismatch |
| duplicated membership | More than one ACTIVE membership matches | Unambiguous active membership requirement | Fail closed; never LIMIT 1 | INTERNAL_ERROR | Duplicate membership evidence |
| duplicated AccountAccess | More than one ACTIVE access matches | Unambiguous active access requirement | Fail closed; never LIMIT 1 | INTERNAL_ERROR | Duplicate access evidence |
| session-context leakage Account A -> Account B | Reused backend connection retains stale authority | Contamination preflight and transaction-local context | Fail closed before Account B operation | INTERNAL_ERROR | Previous context marker, attempted new scope |
| rollback context leakage | ROLLBACK leaves authority state visible | Transaction-local context cleanup | Fail closed if detected | INTERNAL_ERROR | Rollback cleanup failure evidence |
| timeout context leakage | Timeout interrupts transaction cleanup | Connection release/cleanup invariant | Fail closed if detected on reuse | INTERNAL_ERROR | Timeout event, stale context marker |
| exception context leakage | Exception path fails cleanup | ROLLBACK and release clean connection | Fail closed if detected | INTERNAL_ERROR | Exception, stale context marker |
| named prepared statement under Supavisor transaction mode | Client config uses named/prepared statements | Prepared statements forbidden | Reject configuration/use | INTERNAL_ERROR | Statement name/config evidence |
| transaction split across multiple pool clients | Code uses independent pool.query calls in one material transaction | Same-client transaction invariant | Reject design/implementation | INTERNAL_ERROR | Operation, client identity evidence |
| stale AuthorizedInvestingContext | Request-time context used after authority change | Mutation-time revalidation | Reject stale mutation | MEMBERSHIP_INACTIVE, ACCESS_INACTIVE, ACCOUNT_INACTIVE, or TENANT_INACTIVE | Context version/evidence mismatch |
| membership revoked after request authorize | Membership revoked before mutation transaction | Transactional revalidation | Reject | MEMBERSHIP_INACTIVE | Membership version/state |
| account frozen after request authorize | Account frozen before mutation transaction | Transactional revalidation | Reject | ACCOUNT_INACTIVE | Account state/version |
| SQL injection via selector | Client selector attempts SQL control | Parameterized values and source-controlled identifiers | Reject/no injection effect | VALIDATION_ERROR or INTERNAL_ERROR | Sanitized selector class, query boundary |
| malicious search_path | Attacker relies on implicit public search_path | Schema qualification and safe search_path | Reject/no hijack effect | INTERNAL_ERROR | Operation, search_path evidence |
| SECURITY DEFINER privilege escalation | Function bypasses authority/RLS | SECURITY DEFINER audit rules and minimum grants | Reject design/implementation | INTERNAL_ERROR | Function identity, grant evidence |
| runtime credential used for migration | Vercel runtime credential attempts migration | Migration/runtime separation | Reject | INTERNAL_ERROR | Credential class, migration attempt |
| migration credential exposed to runtime | Admin credential configured in app runtime | Secret separation and deployment review | Block release/fail closed | INTERNAL_ERROR | Environment key class without secret value |
| DATABASE_URL exposed to browser | DB URL uses NEXT_PUBLIC or is bundled/logged | Server-only secret contract | Block release/fail closed | INTERNAL_ERROR | Variable name, exposure surface |
| connection string logged | Error/log includes DB credential | Secret redaction contract | Block and rotate if real | INTERNAL_ERROR | Redacted log event and incident marker |
| denial audit rolled back with mutation | Denial found in transaction disappears on rollback | Independent denial/security audit durability | Mutation absent, denial audit survives | MEMBERSHIP_INACTIVE, ACCESS_INACTIVE, ACCOUNT_INACTIVE, or INTERNAL_ERROR | Separate denial audit evidence |
| audit failure accidentally allowing operation | Audit write fails after denial | Audit failure never turns denial into success | Deny remains deny; surface audit failure separately | INTERNAL_ERROR | Denial reason plus audit failure |
| missing DB authority context | Material DB operation starts without context | Transaction-local context requirement | Reject | INTERNAL_ERROR | Operation, missing context |
| unexpected pre-existing DB authority context | Transaction starts with stale Syntrake context already populated | Contamination preflight | Fail closed; never overwrite and continue | INTERNAL_ERROR | Stale context marker |

THREAT_CASE_COUNT = 57

The stolen/compromised `investing_app` credential threat is modeled truthfully:

Before shared ACL closure:

- attacker possesses the shared backend DB credential
- blast radius may include inherited PUBLIC EXECUTE surfaces
- blast radius may include PUBLIC TEMP
- this is why runtime creation/use is BLOCKED

After accepted ACL isolation:

- expected verified blast radius is constrained to the explicitly granted Investing runtime surface
- unavoidable shared database capabilities must have been independently accepted

Structurally preserved constraints:

- no role creation
- no BYPASSRLS
- no migration/admin capability
- no privileged SET ROLE
- no `auth.*` access
- no `storage.*` access
- no persistent-schema DDL

Transaction GUCs alone do NOT provide cryptographic per-user identity isolation after the runtime credential itself is compromised.

The exact additional mitigation against a fully compromised runtime credential remains a future security-hardening design decision.

## Explicit Non-Scope

- no SQL execution
- no migration creation
- no Supabase mutation
- no Vercel mutation
- no package install
- no runtime implementation
- no application API change
- no UI or dashboard scope
- no Trading modification
- no commit
- no push
- no PR
