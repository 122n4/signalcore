import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeProviderBars } from "@/lib/investing/research/data-agent/normalization.server";
import { ContentAddressedDatasetStorage } from "@/lib/investing/research/data-agent/storage.server";
import { TwelveDataInvestingAdapter } from "@/lib/investing/research/data-agent/twelveDataAdapter.server";
import { executeDatasetAcquisition } from "@/lib/investing/research/data-agent/acquisitionExecutor.server";
import type { ProviderBar, TimeSeriesProviderAdapter } from "@/lib/investing/research/data-agent/providerAdapter.server";
import { requirement6e } from "./investingPhase6EDatasetContracts.test";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("Phase 6E storage, normalization and provider", () => {
  it("normalizes UTC, sorts, deduplicates identical bars and rejects conflicts", () => {
    const a = { timestamp: "2026-01-02T00:00:00Z", open: 2, high: 3, low: 1, close: 2, volume: 1 };
    const b = { timestamp: "2026-01-01T00:00:00Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: null };
    const result = normalizeProviderBars([a, b, a]);
    expect(result.ok && result.value.bars).toHaveLength(2);
    expect(result.ok && result.value.bars[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(normalizeProviderBars([a, { ...a, close: 2.5 }]).ok).toBe(false);
  });
  it("publishes content-addressed atomically, converges and verifies reads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "phase6e-")); dirs.push(root);
    const storage = new ContentAddressedDatasetStorage(root);
    const normalized = "{\"ok\":true}\n";
    const hash = createHash("sha256").update(normalized).digest("hex");
    const first = await storage.publish({ normalized, normalizedHash: hash, rawHash: "b".repeat(64), schemaVersion: "v1" });
    const second = await storage.publish({ normalized, normalizedHash: hash, rawHash: "b".repeat(64), schemaVersion: "v1" });
    expect(first.ok && second.ok && first.value.key).toBe(second.ok ? second.value.key : "");
    expect(first.ok && (await storage.read(first.value)).ok).toBe(true);
    expect((await storage.publish({ normalized, normalizedHash: "a".repeat(64), rawHash: "b".repeat(64), schemaVersion: "v1" })).ok).toBe(false);
  });
  it("requests one symbol/timeframe with finite bounds and keeps key out of result", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("symbol")).toBe("IWDA");
      expect(parsed.searchParams.get("interval")).toBe("1day");
      expect(parsed.searchParams.get("start_date")).toBeTruthy();
      expect(parsed.searchParams.get("end_date")).toBeTruthy();
      return new Response(JSON.stringify({ values: [{ datetime: "2026-01-01 00:00:00", open: "1", high: "2", low: "0.5", close: "1.5", volume: "10" }] }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-a" } });
    });
    const result = await new TwelveDataInvestingAdapter("SECRET_KEY", fetcher as typeof fetch).acquire(requirement6e(), { timeoutMs: 1000 });
    expect(result.kind).toBe("acquired");
    expect(JSON.stringify(result)).not.toContain("SECRET_KEY");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes rate limit, explicit no-data and malformed empty response", async () => {
    const rate = new TwelveDataInvestingAdapter("k", async () => new Response("{}", { status: 429, headers: { "retry-after": "3" } }));
    expect((await rate.acquire(requirement6e(), { timeoutMs: 100 })).kind).toBe("provider_unavailable");
    const none = new TwelveDataInvestingAdapter("k", async () => new Response(JSON.stringify({ status: "error", code: 404, message: "No data is available" }), { status: 200 }));
    expect((await none.acquire(requirement6e(), { timeoutMs: 100 })).kind).toBe("confirmed_no_data");
    const empty = new TwelveDataInvestingAdapter("k", async () => new Response(JSON.stringify({ values: [] }), { status: 200 }));
    expect((await empty.acquire(requirement6e(), { timeoutMs: 100 })).kind).toBe("failed");
  });

  it("classifies malformed timestamps as a non-retryable invalid provider response", async () => {
    const adapter = new TwelveDataInvestingAdapter("secret", vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      values: [{ datetime: "not-a-date", open: "1", high: "2", low: "1", close: "2", volume: "3" }],
    }), { status: 200 })) as typeof fetch);
    const result = await adapter.acquire(requirement6e(), { timeoutMs: 1000 });
    expect(result).toMatchObject({
      kind: "failed",
      retryable: false,
      classification: "response_invalid",
      sanitizedError: "provider_response_invalid",
    });
  });

  it("distinguishes caller cancellation from provider unavailability", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      controller.abort("authorised cancellation");
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      throw new Error("unreachable");
    }) as typeof fetch;
    const result = await new TwelveDataInvestingAdapter("secret", fetcher).acquire(
      requirement6e(),
      { signal: controller.signal, timeoutMs: 1000 },
    );
    expect(result).toEqual({ kind: "cancelled", provider: "twelvedata", classification: "caller_aborted" });
  });

  it.each([
    ["impossible candle", [{ timestamp: "2026-01-02T00:00:00.000Z", open: 10, high: 5, low: 6, close: 10, volume: 1 }]],
    ["invalid timestamp", [{ timestamp: "not-a-date", open: 1, high: 2, low: 1, close: 2, volume: 1 }]],
    ["missing field", [{ timestamp: "2026-01-02T00:00:00.000Z", open: 1, high: 2, low: 1, volume: 1 }]],
    ["non-finite number", [{ timestamp: "2026-01-02T00:00:00.000Z", open: 1, high: 2, low: 1, close: Number.NaN, volume: 1 }]],
    ["conflicting duplicate", [
      { timestamp: "2026-01-02T00:00:00.000Z", open: 1, high: 2, low: 1, close: 2, volume: 1 },
      { timestamp: "2026-01-02T00:00:00.000Z", open: 1, high: 3, low: 1, close: 2, volume: 1 },
    ]],
  ])("maps post-response %s to a closed non-retryable provider failure", async (_name, malformed) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "phase6e-invalid-provider-"));
    dirs.push(dir);
    const adapter: TimeSeriesProviderAdapter = {
      providerId: "test-provider",
      acquire: vi.fn(async () => ({
        kind: "acquired" as const,
        provider: "test-provider",
        providerVersion: "v1",
        providerRequestId: null,
        sourceTimezone: "UTC",
        bars: malformed as unknown as readonly ProviderBar[],
        rateLimit: { remaining: null, resetAt: null },
      })),
    };
    const result = await executeDatasetAcquisition({
      requirement: requirement6e(),
      adapter,
      storage: new ContentAddressedDatasetStorage(dir),
      timeoutMs: 1000,
    });
    expect(result).toMatchObject({
      ok: false,
      outcome: {
        kind: "failed" as const,
        reasonCode: "provider_response_invalid",
        classification: "provider_response_invalid",
        retryable: false,
      },
      issues: [{ reasonCode: "provider_response_invalid" }],
    });
    expect(JSON.stringify(result)).not.toContain("secret-sentinel");
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(malformed));
  });

  it("maps an adapter schema failure to provider_response_invalid without outage classification", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "phase6e-invalid-schema-"));
    dirs.push(dir);
    const adapter: TimeSeriesProviderAdapter = {
      providerId: "test-provider",
      acquire: vi.fn(async () => ({
        kind: "failed" as const,
        provider: "test-provider",
        retryable: false,
        classification: "response_invalid",
        sanitizedError: "provider_response_invalid",
      })),
    };
    const result = await executeDatasetAcquisition({
      requirement: requirement6e(),
      adapter,
      storage: new ContentAddressedDatasetStorage(dir),
      timeoutMs: 1000,
    });
    expect(result).toMatchObject({
      ok: false,
      outcome: { kind: "failed", reasonCode: "provider_response_invalid", retryable: false },
    });
    expect(result).not.toMatchObject({ outcome: { kind: "provider_unavailable" } });
  });
});
