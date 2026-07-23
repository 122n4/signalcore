import { createHash } from "node:crypto";

import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";

type CanonicalValue = null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };
// `authorization` is a sealed domain field in FeasibleDecisionEnvelopeV1, not
// an HTTP credential. Actual credential/header/token key names remain denied.
const SECRET_KEY = /^(?:password|secret|api[_-]?key|authorization[_-]?header|bearer|access[_-]?token|refresh[_-]?token|broker[_-]?(?:credential|token)|stack|stacktrace)$/iu;
const AUTHORIZATION_KEYS = ["environment", "expectedAccountId", "expectedUserId"] as const;

function assertCanonicalPersistenceKeyV1(key: string, path: string): void {
  let comparable = key;
  if (key.includes("%")) {
    try {
      comparable = decodeURIComponent(key);
    } catch (error) {
      return persistenceError("persistence_authorization_shape_invalid", {
        path,
        reason: "invalid_percent_encoded_key",
      }, error);
    }
    if (comparable.includes("%")) {
      return persistenceError("persistence_authorization_shape_invalid", {
        path,
        reason: "residual_percent_encoding_forbidden",
      });
    }
  }
  if (comparable.toLowerCase() === "authorization" && key !== "authorization") {
    return persistenceError("persistence_authorization_shape_invalid", {
      path,
      reason: "canonical_key_required",
    });
  }
}

export function assertCanonicalAuthorizationShapeV1(value: unknown, path = "$.authorization"): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return persistenceError("persistence_authorization_shape_invalid", { path, reason: "plain_object_required" });
  }
  const authorization = value as Record<string, unknown>;
  const keys = Object.keys(authorization).sort();
  if (keys.length !== AUTHORIZATION_KEYS.length || keys.some((key, index) => key !== AUTHORIZATION_KEYS[index])) {
    return persistenceError("persistence_unexpected_payload_property", {
      path,
      expected: AUTHORIZATION_KEYS.join(","),
      actual: keys.join(","),
    });
  }
  if (
    typeof authorization.expectedUserId !== "string"
    || authorization.expectedUserId.trim() === ""
    || typeof authorization.expectedAccountId !== "string"
    || authorization.expectedAccountId.trim() === ""
    || authorization.environment !== "paper"
  ) {
    return persistenceError("persistence_authorization_shape_invalid", { path });
  }
}

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" || value === undefined || typeof value !== "object") {
    return persistenceError("persistence_input_invalid", { path });
  }
  if (seen.has(value)) return persistenceError("persistence_input_invalid", { path, reason: "cycle" });
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return persistenceError("persistence_input_invalid", { path, reason: "plain_object_required" });
    }
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      assertCanonicalPersistenceKeyV1(key, `${path}.${key}`);
      if (SECRET_KEY.test(key)) return persistenceError("persistence_payload_unsafe", { path: `${path}.${key}` });
      const entry = (value as Record<string, unknown>)[key];
      if (key.toLowerCase() === "authorization") {
        assertCanonicalAuthorizationShapeV1(entry, `${path}.${key}`);
      }
      result[key] = canonicalize(entry, `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalPersistenceStringifyV1(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$", new WeakSet<object>()));
}

export function canonicalPersistenceSha256V1(value: unknown): string {
  return createHash("sha256").update(canonicalPersistenceStringifyV1(value), "utf8").digest("hex");
}

export function hashWithoutPersistenceFieldV1(value: unknown, field: string): string {
  const draft = { ...(value as Record<string, unknown>) };
  delete draft[field];
  return canonicalPersistenceSha256V1(draft);
}

function setCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(setCanonicalize).sort((a, b) => canonicalPersistenceStringifyV1(a).localeCompare(canonicalPersistenceStringifyV1(b)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, setCanonicalize(entry)]));
  }
  return value;
}

export function hashSetSemanticPersistenceV1(value: unknown): string {
  return canonicalPersistenceSha256V1(setCanonicalize(value));
}

export function parseCanonicalPayloadV1(payload: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch (error) {
    return persistenceError("persistence_payload_not_canonical", { reason: "invalid_json" }, error);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return persistenceError("persistence_payload_not_canonical", { reason: "object_required" });
  }
  if (canonicalPersistenceStringifyV1(parsed) !== payload) {
    return persistenceError("persistence_payload_not_canonical");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

export function canonicalEqualV1(left: unknown, right: unknown): boolean {
  return canonicalPersistenceStringifyV1(left) === canonicalPersistenceStringifyV1(right);
}
