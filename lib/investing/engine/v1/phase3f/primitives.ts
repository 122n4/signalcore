import { createHash } from "node:crypto";

import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import {
  FINAL_RUN_CONTEXT_VERSION,
  FINAL_RUN_REQUEST_VERSION,
  type InvestingEngineRunContextV1,
  type InvestingEngineRunRequestV1,
} from "@/lib/investing/engine/v1/phase3f/types";

type DecimalParts = { coefficient: bigint; scale: number };
type CanonicalValue = null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const TEN = BigInt(10);

function powerOfTen(exponent: number) {
  if (!Number.isSafeInteger(exponent) || exponent < 0) throw new Error("final_decimal_scale_invalid");
  return TEN ** BigInt(exponent);
}

export function decimal(value: string): CanonicalDecimal {
  if (typeof value !== "string") throw new Error("final_decimal_string_required");
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error("final_decimal_invalid");
  const negative = match[1] === "-";
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  if (integer.length + fraction.length > 128) throw new Error("final_decimal_too_large");
  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  return `${negative && magnitude !== "0" ? "-" : ""}${magnitude}` as CanonicalDecimal;
}

function parse(value: CanonicalDecimal): DecimalParts {
  const normalized = decimal(value);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integer, fraction = ""] = unsigned.split(".");
  return {
    coefficient: BigInt(`${negative ? "-" : ""}${integer}${fraction}`),
    scale: fraction.length,
  };
}

function fromParts(coefficient: bigint, scale: number): CanonicalDecimal {
  if (coefficient === BigInt(0)) return "0" as CanonicalDecimal;
  const negative = coefficient < BigInt(0);
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const raw = scale === 0 ? digits : `${digits.slice(0, -scale) || "0"}.${digits.slice(-scale)}`;
  return decimal(`${negative ? "-" : ""}${raw}`);
}

function align(left: DecimalParts, right: DecimalParts): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * powerOfTen(scale - left.scale),
    right.coefficient * powerOfTen(scale - right.scale),
    scale,
  ];
}

export const ZERO = decimal("0");
export const ONE = decimal("1");

export function add(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const [a, b, scale] = align(parse(left), parse(right));
  return fromParts(a + b, scale);
}

export function subtract(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const [a, b, scale] = align(parse(left), parse(right));
  return fromParts(a - b, scale);
}

export function multiply(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const a = parse(left);
  const b = parse(right);
  return fromParts(a.coefficient * b.coefficient, a.scale + b.scale);
}

export function compare(left: CanonicalDecimal, right: CanonicalDecimal): -1 | 0 | 1 {
  const [a, b] = align(parse(left), parse(right));
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sum(values: readonly CanonicalDecimal[]) {
  return values.reduce(add, ZERO);
}

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") throw new Error(`final_number_forbidden:${path}`);
  if (value === undefined) throw new Error(`final_undefined_forbidden:${path}`);
  if (typeof value !== "object") throw new Error(`final_value_forbidden:${path}`);
  if (seen.has(value)) throw new Error(`final_cycle_forbidden:${path}`);
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`final_plain_object_required:${path}`);
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalStringify(value: unknown) {
  return JSON.stringify(canonicalize(value, "$", new WeakSet<object>()));
}

export function sha256(value: unknown) {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

export function hashWithout(value: unknown, field: string) {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy[field];
  return sha256(copy);
}

function setCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(setCanonicalize)
      .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, setCanonicalize(entry)]),
    );
  }
  return value;
}

export function hashSetSemanticSnapshot(value: unknown) {
  return sha256(setCanonicalize(value));
}

export function normalizeTimestamp(value: string) {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) throw new Error("final_timestamp_invalid");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("final_timestamp_invalid");
  return parsed.toISOString();
}

export function freeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) freeze(entry);
  return value;
}

export function sealInvestingEngineRunRequestV1(
  draft: Omit<InvestingEngineRunRequestV1, "requestHash">,
): InvestingEngineRunRequestV1 {
  if (draft.contractVersion !== FINAL_RUN_REQUEST_VERSION) throw new Error("final_request_invalid");
  for (const identifier of [
    draft.runId,
    draft.requestedUserId,
    draft.accountId,
    draft.inputSnapshotId,
    draft.marketSnapshotId,
    draft.mandateSnapshotId,
    draft.constructionModelSnapshotId,
  ]) {
    if (typeof identifier !== "string" || identifier.trim() === "") throw new Error("final_request_invalid");
  }
  const normalized = { ...draft, asOf: normalizeTimestamp(draft.asOf) };
  canonicalStringify(normalized);
  const result = { ...normalized, requestHash: sha256(normalized) } satisfies InvestingEngineRunRequestV1;
  return freeze(result) as InvestingEngineRunRequestV1;
}

export function sealInvestingEngineRunContextV1(
  draft: Omit<InvestingEngineRunContextV1, "contextHash">,
): InvestingEngineRunContextV1 {
  if (draft.contractVersion !== FINAL_RUN_CONTEXT_VERSION || draft.accountMode !== "paper") {
    throw new Error("final_context_invalid");
  }
  if ([draft.ownerId, draft.expectedUserId, draft.expectedAccountId].some((identifier) => identifier.trim() === "")) {
    throw new Error("final_context_invalid");
  }
  canonicalStringify(draft);
  const result = { ...draft, contextHash: sha256(draft) } satisfies InvestingEngineRunContextV1;
  return freeze(result) as InvestingEngineRunContextV1;
}
