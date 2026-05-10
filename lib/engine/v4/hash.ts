import { createHash } from "node:crypto";

function normalizeForHash(value: any): any {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalizeForHash(entry));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeForHash(value[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  return String(value);
}

export function stableSerializeForHash(value: any) {
  return JSON.stringify(normalizeForHash(value));
}

export function stableHash(value: any) {
  return createHash("sha256").update(stableSerializeForHash(value)).digest("hex");
}
