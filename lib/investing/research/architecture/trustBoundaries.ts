import { TRUST_BOUNDARY_VERSION } from "./versions";

export type TrustBoundary = Readonly<{
  id: string; contractVersion: typeof TRUST_BOUNDARY_VERSION;
  input: string; output: string; authentication: string; authorization: string;
  validation: string; allowedSecret: string; forbiddenSecret: string;
  scopePropagation: string; auditEvidence: string; failureMode: string;
}>;

const rows = [
  ["browser-client", "public-intent", "rendered-state", "user-session", "server-authorization", "server-validated", "none", "all", "none", "fail-closed"],
  ["next-control-plane", "session-and-intent", "authorized-command", "authenticated-session", "scope-policy", "closed-schema", "app-secrets", "provider-and-broker", "revalidated-resolved-scope", "fail-closed"],
  ["authenticated-application-boundary", "resolved-scope", "scoped-result", "server-identity", "revalidate-scope", "closed-schema", "database-credentials", "broker", "revalidated-exact-scope", "fail-closed"],
  ["future-postgresql", "scoped-statements", "scoped-rows", "service-credential", "rls-plus-user-scope", "rls-and-schema", "database-secrets", "provider-and-broker", "tenant-owner-portfolio-account", "rollback"],
  ["investing-research-runtime", "research-ready-manifest", "scientific-evidence", "workload-identity", "job-scope", "scientific-contract-validation", "artifact-storage-future", "provider-and-broker", "revalidated-scientific-scope", "visible-failure"],
  ["investing-data-agent", "acquisition-request", "dataset-publication", "workload-identity", "request-scope", "acquisition-policy", "provider-credentials", "broker", "revalidated-dataset-scope", "visible-failure"],
  ["provider-adapters", "provider-request", "raw-response", "delegated-provider-auth", "request-policy", "provider-response-validation", "delegated-provider-auth", "user-and-broker", "acquisition-reference", "provider-unavailable"],
  ["future-artifact-storage", "content-addressed-artifact", "artifact-reference", "workload-identity", "scope-and-hash", "hash-and-scope-validation", "storage-secret", "provider-and-broker", "artifact-scope", "integrity-blocked"],
  ["promotion-boundary", "promotion-candidate-envelope", "promotion-prepared", "server-identity", "full-revalidation", "6b-and-6c-integrity", "none", "provider-and-broker", "revalidated-exact-scope", "fail-closed"],
  ["investing-engine", "future-authorized-request", "canonical-result", "server-identity", "application-boundary", "engine-contract-validation", "database-secret", "provider", "revalidated-exact-scope", "integrity-blocked"],
  ["future-broker", "engine-only-request", "execution-result", "broker-credential", "engine-policy", "broker-contract-validation", "broker-credentials", "research-secrets", "engine-scope", "fail-closed"],
  ["ops-reader", "read-query", "redacted-health", "ops-identity", "read-policy", "read-schema", "none", "provider-broker-and-writer", "read-scope", "read-only-failure"],
] as const;

export const TRUST_BOUNDARIES: readonly TrustBoundary[] = rows.map(
  ([id, input, output, authentication, authorization, validation,
    allowedSecret, forbiddenSecret, scopePropagation, failureMode]) => ({
    id, contractVersion: TRUST_BOUNDARY_VERSION, input, output, authentication,
    authorization, validation, allowedSecret, forbiddenSecret, scopePropagation,
    auditEvidence: "correlation-plus-reason-code", failureMode,
  }),
);

function safeTree(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return true;
  if (typeof value !== "object" || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set
      || (key !== "length" && !descriptor.enumerable)) return false;
    if (key !== "length" && !safeTree(descriptor.value, seen)) return false;
  }
  seen.delete(value);
  return true;
}

export function validateTrustBoundaries(input: unknown) {
  const fail = (path: string) => ({
    ok: false as const,
    issues: [{ path, reasonCode: "research.architecture.contract_invalid" as const }],
  });
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return fail("trustBoundaries");
  }
  if (!safeTree(input)) return fail("trustBoundaries");
  const keys = ["id", "contractVersion", "input", "output", "authentication",
    "authorization", "validation", "allowedSecret", "forbiddenSecret",
    "scopePropagation", "auditEvidence", "failureMode"];
  const canonical = new Map(TRUST_BOUNDARIES.map((value) => [value.id, value]));
  const rebuilt: TrustBoundary[] = [];
  for (const [index, candidate] of input.entries()) {
    if (typeof candidate !== "object" || candidate === null
      || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype
      || Reflect.ownKeys(candidate).length !== keys.length
      || Reflect.ownKeys(candidate).some((key) => {
        if (typeof key !== "string" || !keys.includes(key)) return true;
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        return descriptor?.enumerable !== true
          || descriptor.get !== undefined || descriptor.set !== undefined;
      })) return fail(`trustBoundaries[${index}]`);
    const expected = canonical.get((candidate as { id?: unknown }).id as string);
    if (!expected || JSON.stringify(candidate) !== JSON.stringify(expected)) {
      return fail(`trustBoundaries[${index}]`);
    }
    rebuilt.push(structuredClone(expected));
  }
  if (rebuilt.length !== TRUST_BOUNDARIES.length
    || new Set(rebuilt.map(({ id }) => id)).size !== TRUST_BOUNDARIES.length) {
    return fail("trustBoundaries");
  }
  return { ok: true as const, value: rebuilt };
}
