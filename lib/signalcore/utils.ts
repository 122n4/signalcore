// lib/signalcore/utils.ts

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export function round(n: number) {
  return Math.round(n);
}

export function safeNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function id(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function pct(n: number) {
  return `${Math.round(n)}%`;
}