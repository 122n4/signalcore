export type ExactDecimalV1 = Readonly<{ coefficient: bigint; scale: number }>;
export type ExactRationalV1 = Readonly<{ numerator: bigint; denominator: bigint }>;

export function parseExactDecimalV1(value: string): ExactDecimalV1 {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("INVALID_DECIMAL");
  if (/^-0(?:\.0+)?$/u.test(value)) throw new Error("INVALID_DECIMAL");
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`;
  return normalizeDecimalV1({ coefficient: BigInt(`${negative ? "-" : ""}${digits}`), scale: fraction.length });
}

export function normalizeDecimalV1(decimal: ExactDecimalV1): ExactDecimalV1 {
  let coefficient = decimal.coefficient;
  let scale = decimal.scale;
  if (!Number.isInteger(scale) || scale < 0) throw new Error("INVALID_SCALE");
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  if (coefficient === 0n) scale = 0;
  return { coefficient, scale };
}

export function decimalToRationalV1(decimal: ExactDecimalV1): ExactRationalV1 {
  return reduceRationalV1({ numerator: decimal.coefficient, denominator: 10n ** BigInt(decimal.scale) });
}

export function decimalStringToRationalV1(value: string): ExactRationalV1 {
  return decimalToRationalV1(parseExactDecimalV1(value));
}

export function integerToRationalV1(value: bigint): ExactRationalV1 {
  return { numerator: value, denominator: 1n };
}

export function reduceRationalV1(value: ExactRationalV1): ExactRationalV1 {
  if (value.denominator === 0n) throw new Error("DIVIDE_BY_ZERO");
  let numerator = value.numerator;
  let denominator = value.denominator;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function compareRationalV1(left: ExactRationalV1, right: ExactRationalV1): -1 | 0 | 1 {
  const lhs = left.numerator * right.denominator;
  const rhs = right.numerator * left.denominator;
  return lhs === rhs ? 0 : lhs < rhs ? -1 : 1;
}

export function addRationalV1(left: ExactRationalV1, right: ExactRationalV1): ExactRationalV1 {
  return reduceRationalV1({ numerator: left.numerator * right.denominator + right.numerator * left.denominator, denominator: left.denominator * right.denominator });
}

export function subtractRationalV1(left: ExactRationalV1, right: ExactRationalV1): ExactRationalV1 {
  return reduceRationalV1({ numerator: left.numerator * right.denominator - right.numerator * left.denominator, denominator: left.denominator * right.denominator });
}

export function multiplyRationalV1(left: ExactRationalV1, right: ExactRationalV1): ExactRationalV1 {
  return reduceRationalV1({ numerator: left.numerator * right.numerator, denominator: left.denominator * right.denominator });
}

export function divideRationalV1(left: ExactRationalV1, right: ExactRationalV1): ExactRationalV1 {
  if (right.numerator === 0n) throw new Error("DIVIDE_BY_ZERO");
  return reduceRationalV1({ numerator: left.numerator * right.denominator, denominator: left.denominator * right.numerator });
}

export function truncateRationalToScaleV1(value: ExactRationalV1, scale: number): ExactDecimalV1 {
  const factor = 10n ** BigInt(scale);
  return normalizeDecimalV1({ coefficient: (value.numerator * factor) / value.denominator, scale });
}

export function roundHalfEvenRationalToScaleV1(value: ExactRationalV1, scale: number): ExactDecimalV1 {
  const factor = 10n ** BigInt(scale);
  const scaled = value.numerator * factor;
  const quotient = scaled / value.denominator;
  const remainder = abs(scaled % value.denominator);
  const halfCompare = remainder * 2n - value.denominator;
  let coefficient = quotient;
  if (halfCompare > 0n || (halfCompare === 0n && abs(quotient) % 2n === 1n)) {
    coefficient += value.numerator < 0n ? -1n : 1n;
  }
  return normalizeDecimalV1({ coefficient, scale });
}

export function renderCanonicalDecimalV1(decimal: ExactDecimalV1): string {
  const normalized = normalizeDecimalV1(decimal);
  const negative = normalized.coefficient < 0n;
  const digits = abs(normalized.coefficient).toString();
  if (normalized.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(normalized.scale + 1, "0");
  const whole = padded.slice(0, -normalized.scale);
  const fraction = padded.slice(-normalized.scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function renderRatioOutputV1(value: ExactRationalV1): string {
  return renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1(value, 18));
}

export function renderMoneyOutputV1(value: ExactRationalV1): string {
  return renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1(value, 16));
}

export function renderQuantityOutputV1(value: ExactRationalV1): string {
  return renderCanonicalDecimalV1(truncateRationalToScaleV1(value, 8));
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a === 0n ? 1n : a;
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}
