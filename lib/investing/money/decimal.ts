const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

function parseDecimal(value: string | number, scale: number) {
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error("invalid_decimal");
  const sign = raw.startsWith("-") ? -ONE : ONE;
  const unsigned = raw.replace(/^-/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = (fraction + "0".repeat(scale + 1)).slice(0, scale + 1);
  const base = BigInt(whole || "0") * TEN ** BigInt(scale);
  const scaled = base + BigInt(padded.slice(0, scale) || "0");
  const roundDigit = Number(padded[scale] || "0");
  return sign * (scaled + (roundDigit >= 5 ? ONE : ZERO));
}

function formatDecimal(value: bigint, scale: number) {
  const sign = value < ZERO ? "-" : "";
  const abs = value < ZERO ? -value : value;
  const factor = TEN ** BigInt(scale);
  const whole = abs / factor;
  const fraction = String(abs % factor).padStart(scale, "0");
  return scale === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export function toMoney(value: string | number, scale = 2) {
  return formatDecimal(parseDecimal(value, scale), scale);
}

export function addMoney(left: string | number, right: string | number, scale = 2) {
  return formatDecimal(parseDecimal(left, scale) + parseDecimal(right, scale), scale);
}

export function subtractMoney(left: string | number, right: string | number, scale = 2) {
  return formatDecimal(parseDecimal(left, scale) - parseDecimal(right, scale), scale);
}

export function multiplyMoney(left: string | number, right: string | number, scale = 2) {
  const workingScale = Math.max(scale, 6);
  const product = parseDecimal(left, workingScale) * parseDecimal(right, workingScale);
  const divisor = TEN ** BigInt(workingScale);
  const rounded = (product + divisor / TWO) / divisor;
  const adjustment = TEN ** BigInt(workingScale - scale);
  return formatDecimal((rounded + adjustment / TWO) / adjustment, scale);
}

export function compareMoney(left: string | number, right: string | number, scale = 2) {
  const l = parseDecimal(left, scale);
  const r = parseDecimal(right, scale);
  return l === r ? 0 : l > r ? 1 : -1;
}

export function isNonNegativeMoney(value: string | number, scale = 2) {
  return parseDecimal(value, scale) >= ZERO;
}
