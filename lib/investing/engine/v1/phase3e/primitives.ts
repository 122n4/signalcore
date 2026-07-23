import { createHash } from "node:crypto";

import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import type { ConstructionModelSnapshotV1 } from "@/lib/investing/engine/v1/phase3e/types";

type DecimalParts = { coefficient: bigint; scale: number };
type CanonicalValue = null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const TEN = BigInt(10);

function powerOfTen(exponent: number) {
  if (!Number.isSafeInteger(exponent) || exponent < 0) throw new Error("investing_construction_decimal_scale_invalid");
  return TEN ** BigInt(exponent);
}

export function decimal(value: string): CanonicalDecimal {
  if (typeof value !== "string") throw new Error("investing_construction_decimal_string_required");
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error("investing_construction_decimal_invalid");
  const negative = match[1] === "-";
  const integer = (match[2] || "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] || "").replace(/0+$/, "");
  if (integer.length + fraction.length > 128) throw new Error("investing_construction_decimal_too_large");
  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  return `${negative && magnitude !== "0" ? "-" : ""}${magnitude}` as CanonicalDecimal;
}

function parse(value: CanonicalDecimal): DecimalParts {
  const canonical = decimal(value);
  const negative = canonical.startsWith("-");
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [integer, fraction = ""] = unsigned.split(".");
  return { coefficient: BigInt(`${negative ? "-" : ""}${integer}${fraction}`), scale: fraction.length };
}

function fromParts(coefficient: bigint, scale: number): CanonicalDecimal {
  if (coefficient === BigInt(0)) return decimal("0");
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
export const BPS_DIVISOR = decimal("10000");

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

export function divide(numerator: CanonicalDecimal, denominator: CanonicalDecimal, precision = 18): CanonicalDecimal {
  const a = parse(numerator);
  const b = parse(denominator);
  if (b.coefficient === BigInt(0)) throw new Error("investing_construction_division_by_zero");
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 36) throw new Error("investing_construction_precision_invalid");
  const top = a.coefficient * powerOfTen(b.scale + precision);
  const bottom = b.coefficient * powerOfTen(a.scale);
  return fromParts(top / bottom, precision);
}

export function compare(left: CanonicalDecimal, right: CanonicalDecimal): -1 | 0 | 1 {
  const [a, b] = align(parse(left), parse(right));
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(left: CanonicalDecimal, right: CanonicalDecimal) {
  return compare(left, right) <= 0 ? left : right;
}

export function max(left: CanonicalDecimal, right: CanonicalDecimal) {
  return compare(left, right) >= 0 ? left : right;
}

export function abs(value: CanonicalDecimal) {
  return compare(value, ZERO) < 0 ? subtract(ZERO, value) : value;
}

export function sum(values: readonly CanonicalDecimal[]) {
  return values.reduce(add, ZERO);
}

export function isPositive(value: CanonicalDecimal) {
  return compare(value, ZERO) > 0;
}

export function equals(left: CanonicalDecimal, right: CanonicalDecimal) {
  return compare(left, right) === 0;
}

export function floorToIncrement(value: CanonicalDecimal, increment: CanonicalDecimal): CanonicalDecimal {
  if (compare(value, ZERO) < 0 || compare(increment, ZERO) <= 0) throw new Error("investing_construction_rounding_input_invalid");
  const [valueCoefficient, incrementCoefficient, scale] = align(parse(value), parse(increment));
  return fromParts((valueCoefficient / incrementCoefficient) * incrementCoefficient, scale);
}

export function ceilToIncrement(value: CanonicalDecimal, increment: CanonicalDecimal): CanonicalDecimal {
  if (compare(value, ZERO) < 0 || compare(increment, ZERO) <= 0) throw new Error("investing_construction_rounding_input_invalid");
  const [valueCoefficient, incrementCoefficient, scale] = align(parse(value), parse(increment));
  const quotient = valueCoefficient / incrementCoefficient;
  const rounded = valueCoefficient % incrementCoefficient === BigInt(0) ? quotient : quotient + BigInt(1);
  return fromParts(rounded * incrementCoefficient, scale);
}

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") throw new Error(`investing_construction_number_forbidden:${path}`);
  if (value === undefined) throw new Error(`investing_construction_undefined_forbidden:${path}`);
  if (typeof value !== "object") throw new Error(`investing_construction_value_forbidden:${path}`);
  if (seen.has(value)) throw new Error(`investing_construction_cycle_forbidden:${path}`);
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`investing_construction_plain_object_required:${path}`);
    const output: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
    return output;
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

export function freeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) freeze(entry);
  return value;
}

export function normalizeTimestamp(value: string) {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) throw new Error("investing_construction_timestamp_invalid");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("investing_construction_timestamp_invalid");
  return parsed.toISOString();
}

export function sealConstructionModelSnapshotV1(
  draft: Omit<ConstructionModelSnapshotV1, "snapshotHash">,
): ConstructionModelSnapshotV1 {
  const normalized = {
    ...draft,
    asOf: normalizeTimestamp(draft.asOf),
    costBenefitThreshold: decimal(draft.costBenefitThreshold),
    minimumTradeBenefit: decimal(draft.minimumTradeBenefit),
    liquidityMaxAgeSeconds: decimal(draft.liquidityMaxAgeSeconds),
    instruments: [...draft.instruments]
      .map((instrument) => ({
        ...instrument,
        minimumQuantity: decimal(instrument.minimumQuantity),
        quantityIncrement: decimal(instrument.quantityIncrement),
        priceIncrement: instrument.priceIncrement === null ? null : decimal(instrument.priceIncrement),
        commissionBps: instrument.commissionBps === null ? null : decimal(instrument.commissionBps),
        spreadBps: instrument.spreadBps === null ? null : decimal(instrument.spreadBps),
        slippageBps: instrument.slippageBps === null ? null : decimal(instrument.slippageBps),
        fxCostBps: instrument.fxCostBps === null ? null : decimal(instrument.fxCostBps),
        minimumFee: instrument.minimumFee === null ? null : decimal(instrument.minimumFee),
        averageDailyVolume: instrument.averageDailyVolume === null ? null : decimal(instrument.averageDailyVolume),
        maxParticipation: instrument.maxParticipation === null ? null : decimal(instrument.maxParticipation),
        marketImpactBps: instrument.marketImpactBps === null ? null : decimal(instrument.marketImpactBps),
        liquidityAsOf: instrument.liquidityAsOf === null ? null : normalizeTimestamp(instrument.liquidityAsOf),
      }))
      .sort((left, right) => left.symbol.localeCompare(right.symbol)),
  };
  if (new Set(normalized.instruments.map((instrument) => instrument.symbol)).size !== normalized.instruments.length) {
    throw new Error("investing_construction_model_duplicate_symbol");
  }
  canonicalStringify(normalized);
  const result = { ...normalized, snapshotHash: sha256(normalized) } satisfies ConstructionModelSnapshotV1;
  return freeze(result) as ConstructionModelSnapshotV1;
}
