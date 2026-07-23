import { createHash } from "node:crypto";

export type CanonicalDecimal = string & { readonly __canonicalDecimal: unique symbol };

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

function expandScientificDecimal(raw: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw);
  if (!match) return raw;
  const sign = match[1] || "";
  const integer = match[2] || "0";
  const fraction = match[3] || "";
  const exponent = Number(match[4]);
  if (!Number.isSafeInteger(exponent)) throw new Error("canonical_decimal_exponent_invalid");

  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + exponent;
  if (decimalIndex <= 0) return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export function canonicalDecimalFromString(value: string): CanonicalDecimal {
  if (typeof value !== "string") throw new Error("canonical_decimal_string_required");
  const raw = value.trim();
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) throw new Error("canonical_decimal_invalid");

  const negative = match[1] === "-";
  const integer = (match[2] || "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] || "").replace(/0+$/, "");
  if (integer.length + fraction.length > 128) throw new Error("canonical_decimal_too_large");

  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  const isZero = /^0(?:\.0*)?$/.test(magnitude);
  return `${negative && !isZero ? "-" : ""}${magnitude}` as CanonicalDecimal;
}

/**
 * The only permitted boundary for an existing finite JS number. Canonical
 * contracts themselves still accept financial values as decimal strings only.
 */
export function canonicalDecimalFromFiniteNumberBoundary(value: number): CanonicalDecimal {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("canonical_decimal_finite_number_required");
  }
  return canonicalDecimalFromString(expandScientificDecimal(Object.is(value, -0) ? "0" : value.toString()));
}

export function isCanonicalDecimal(value: unknown): value is CanonicalDecimal {
  if (typeof value !== "string") return false;
  try {
    return canonicalDecimalFromString(value) === value;
  } catch {
    return false;
  }
}

export function normalizeIsoTimestamp(value: string): string {
  if (typeof value !== "string") throw new Error("canonical_timestamp_string_required");
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) throw new Error("canonical_timestamp_invalid_or_ambiguous");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] || "").padEnd(3, "0"));
  const offset = match[8] || "Z";

  const calendarProbe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error("canonical_timestamp_invalid_or_ambiguous");
  }

  if (offset !== "Z") {
    const [offsetHours, offsetMinutes] = offset.slice(1).split(":").map(Number);
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error("canonical_timestamp_invalid_or_ambiguous");
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("canonical_timestamp_invalid_or_ambiguous");
  return parsed.toISOString();
}

export type CanonicalJsonValue =
  | null
  | boolean
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): CanonicalJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonical_non_finite_number:${path}`);
    throw new Error(`canonical_number_not_allowed_use_decimal_string:${path}`);
  }
  if (value === undefined) throw new Error(`canonical_undefined_not_allowed:${path}`);
  if (typeof value === "bigint") throw new Error(`canonical_bigint_not_allowed:${path}`);
  if (typeof value === "function" || typeof value === "symbol") {
    throw new Error(`canonical_value_type_not_allowed:${path}`);
  }
  if (typeof value !== "object") throw new Error(`canonical_value_invalid:${path}`);
  if (seen.has(value)) throw new Error(`canonical_cycle_not_allowed:${path}`);
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`canonical_plain_object_required:${path}`);
    }

    const source = value as Record<string, unknown>;
    const output: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      output[key] = canonicalize(source[key], `${path}.${key}`, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJsonValue(value: unknown): CanonicalJsonValue {
  return canonicalize(value, "$", new WeakSet<object>());
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

export function deepFreezeCanonical<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreezeCanonical(entry);
  }
  return value;
}
