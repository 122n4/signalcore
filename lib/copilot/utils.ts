// lib/copilot/utils.ts
export function id(prefix = "cp") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export function pct(n: number) {
  return `${Math.round(n)}%`;
}

export function safeStr(x: unknown) {
  return x == null ? "" : String(x);
}

export function normalizeText(x: unknown) {
  return safeStr(x).trim().toLowerCase();
}