// lib/signalcore/engine/utils.ts
export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function safeNumber(x: any, fallback: number | null = null) {
  if (x === "" || x === null || x === undefined) return fallback;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function pct(n: number) {
  const v = Math.round(n * 100);
  return `${v}%`;
}

export function tinyId() {
  return Math.random().toString(36).slice(2, 9);
}

export function sum(nums: number[]) {
  return nums.reduce((s, x) => s + (Number(x) || 0), 0);
}

export function isPlaceholderSymbol(sym: string) {
  const s = String(sym || "").toUpperCase();
  return s === "USD" || s === "EUR";
}