import "server-only";
import { createHash } from "node:crypto";
import type { DatasetResult } from "../datasets";
import type { ProviderBar } from "./providerAdapter.server";

export type NormalizedDataset = Readonly<{
  bars: readonly ProviderBar[];
  serialized: string;
  contentHash: string;
  byteSize: number;
}>;

export function normalizeProviderBars(input: unknown): DatasetResult<NormalizedDataset> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, issues: [{ path: "bars", reasonCode: "dataset_payload_invalid" }] };
  const byTime = new Map<string, ProviderBar>();
  for (let index = 0; index < input.length; index += 1) {
    const bar = input[index];
    if (typeof bar !== "object" || bar === null || Array.isArray(bar)
      || Reflect.ownKeys(bar).length !== 6 || Object.getPrototypeOf(bar) !== Object.prototype) return { ok: false, issues: [{ path: `bars[${index}]`, reasonCode: "dataset_payload_invalid" }] };
    const value = bar as Record<string, unknown>;
    if (!["timestamp","open","high","low","close","volume"].every((key) => Object.hasOwn(value, key))
      || typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp))
      || !["open","high","low","close"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))
      || !(value.volume === null || (typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0))
      || Number(value.high) < Math.max(Number(value.open), Number(value.close), Number(value.low))
      || Number(value.low) > Math.min(Number(value.open), Number(value.close), Number(value.high))) return { ok: false, issues: [{ path: `bars[${index}]`, reasonCode: "dataset_payload_invalid" }] };
    const normalized: ProviderBar = { timestamp: new Date(value.timestamp).toISOString(), open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close), volume: value.volume === null ? null : Number(value.volume) };
    const prior = byTime.get(normalized.timestamp);
    if (prior && JSON.stringify(prior) !== JSON.stringify(normalized)) return { ok: false, issues: [{ path: `bars[${index}].timestamp`, reasonCode: "dataset_content_mismatch" }] };
    byTime.set(normalized.timestamp, normalized);
  }
  const bars = [...byTime.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const serialized = bars.map((bar) => JSON.stringify(bar)).join("\n") + "\n";
  return { ok: true, value: { bars, serialized, contentHash: createHash("sha256").update(serialized).digest("hex"), byteSize: Buffer.byteLength(serialized) } };
}
