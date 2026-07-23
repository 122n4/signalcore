import {
  canonicalDecimalFromString,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";

type DecimalParts = { coefficient: bigint; scale: number };
const TEN = BigInt(10);

function powerOfTen(exponent: number) {
  if (!Number.isSafeInteger(exponent) || exponent < 0) throw new Error("investing_risk_decimal_scale_invalid");
  return TEN ** BigInt(exponent);
}

function parse(value: CanonicalDecimal): DecimalParts {
  const canonical = canonicalDecimalFromString(value);
  const negative = canonical.startsWith("-");
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [integer, fraction = ""] = unsigned.split(".");
  return {
    coefficient: BigInt(`${negative ? "-" : ""}${integer}${fraction}`),
    scale: fraction.length,
  };
}

function fromParts(coefficient: bigint, scale: number): CanonicalDecimal {
  if (coefficient === BigInt(0)) return canonicalDecimalFromString("0");
  const negative = coefficient < BigInt(0);
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const raw = scale === 0 ? digits : `${digits.slice(0, -scale) || "0"}.${digits.slice(-scale)}`;
  return canonicalDecimalFromString(`${negative ? "-" : ""}${raw}`);
}

function align(left: DecimalParts, right: DecimalParts): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * powerOfTen(scale - left.scale),
    right.coefficient * powerOfTen(scale - right.scale),
    scale,
  ];
}

export const DECIMAL_ZERO = canonicalDecimalFromString("0");
export const DECIMAL_ONE = canonicalDecimalFromString("1");

export function decimalAdd(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const [leftCoefficient, rightCoefficient, scale] = align(parse(left), parse(right));
  return fromParts(leftCoefficient + rightCoefficient, scale);
}

export function decimalMultiply(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const leftParts = parse(left);
  const rightParts = parse(right);
  return fromParts(leftParts.coefficient * rightParts.coefficient, leftParts.scale + rightParts.scale);
}

export function decimalDivide(
  numerator: CanonicalDecimal,
  denominator: CanonicalDecimal,
  precision = 18,
): CanonicalDecimal {
  const top = parse(numerator);
  const bottom = parse(denominator);
  if (bottom.coefficient === BigInt(0)) throw new Error("investing_risk_decimal_division_by_zero");
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 36) {
    throw new Error("investing_risk_decimal_precision_invalid");
  }
  const scaledNumerator = top.coefficient * powerOfTen(bottom.scale + precision);
  const scaledDenominator = bottom.coefficient * powerOfTen(top.scale);
  return fromParts(scaledNumerator / scaledDenominator, precision);
}

export function decimalCompare(left: CanonicalDecimal, right: CanonicalDecimal): -1 | 0 | 1 {
  const [leftCoefficient, rightCoefficient] = align(parse(left), parse(right));
  if (leftCoefficient < rightCoefficient) return -1;
  if (leftCoefficient > rightCoefficient) return 1;
  return 0;
}

export function decimalMin(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  return decimalCompare(left, right) <= 0 ? left : right;
}

export function decimalSum(values: readonly CanonicalDecimal[]): CanonicalDecimal {
  return values.reduce(decimalAdd, DECIMAL_ZERO);
}

export function decimalIsPositive(value: CanonicalDecimal) {
  return decimalCompare(value, DECIMAL_ZERO) > 0;
}

export function decimalEquals(left: CanonicalDecimal, right: CanonicalDecimal) {
  return decimalCompare(left, right) === 0;
}
