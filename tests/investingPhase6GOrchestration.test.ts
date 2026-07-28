import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { validateRetryPolicy } from "@/lib/investing/research/orchestration";
import { OneShotAcquisitionWorker } from "@/lib/investing/research/orchestration/executor.server";
import type { AcquisitionOrchestrationRepository } from "@/lib/investing/research/orchestration/repository.server";

describe("Phase 6G orchestration contracts", () => {
  const valid = {
    contractVersion: "investing-research-orchestration-retry-policy/v1" as const,
    maximumAttempts: 3, leaseSeconds: 60, heartbeatSeconds: 20,
    executionTimeoutSeconds: 120,
    backoffSeconds: [5, 30],
  };
  it("accepts a bounded policy and reconstructs its output", () => {
    const parsed = validateRetryPolicy(valid);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).not.toBe(valid);
  });
  it.each([
    null, [], { ...valid, maximumAttempts: 0 }, { ...valid, maximumAttempts: 11 },
    { ...valid, leaseSeconds: 10 }, { ...valid, heartbeatSeconds: 30 },
    { ...valid, executionTimeoutSeconds: 10 },
    { ...valid, executionTimeoutSeconds: 20 },
    { ...valid, backoffSeconds: [30, 5] }, { ...valid, extra: true },
  ])("rejects unbounded or malformed policy %#", (value) => {
    expect(validateRetryPolicy(value).ok).toBe(false);
  });
  it("does not execute getters", () => {
    let calls = 0;
    const value = { ...valid, get maximumAttempts() { calls += 1; return 3; } };
    expect(validateRetryPolicy(value).ok).toBe(false);
    expect(calls).toBe(0);
  });
  it("claims eligible work and schedules a classified bounded retry", async () => {
    const events: Readonly<Record<string, unknown>>[] = [];
    const lease = {
      contractVersion: "investing-research-orchestration-lease/v1" as const,
      scope: { tenantId: "11111111-1111-4111-8111-111111111111", ownerId: "owner",
        portfolioId: "portfolio", accountId: "22222222-2222-4222-8222-222222222222" },
      acquisitionJobId: "job-1", attempt: 1, leaseToken: "lease_1234567890123456",
      leaseOwner: "worker", fencingToken: 1, stateVersion: 1,
      leasedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:01:00.000Z",
    };
    const repository = {
      claim: vi.fn(), claimNext: vi.fn().mockResolvedValue(lease), heartbeat: vi.fn(),
      finalize: vi.fn(), scheduleRetry: vi.fn().mockResolvedValue({
        accepted: true, scheduled: true, acquisitionJobId: "job-2",
        attempt: 2, notBefore: "2026-01-01T00:00:05.000Z",
      }),
    } satisfies AcquisitionOrchestrationRepository;
    const worker = new OneShotAcquisitionWorker(repository, (event) => events.push(event));
    const result = await worker.run({ scope: lease.scope, leaseOwner: "worker", policy: valid,
      work: { async run() { throw new Error("secret"); }, classifyError: () => "transient" },
      signal: new AbortController().signal });
    expect(result).toMatchObject({ claimed: true, retryScheduled: true });
    expect(repository.claimNext).toHaveBeenCalledOnce();
    expect(repository.scheduleRetry).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ terminalState: "acquisition_failed" }));
    expect(JSON.stringify(repository.scheduleRetry.mock.calls)).not.toContain("secret");
    expect(events.map((event) => event.type)).toContain("orchestration_retry_scheduled");
  });
  it("heartbeats active work and converts its bounded timeout into a sanitized retry", async () => {
    vi.useFakeTimers();
    try {
      const events: Readonly<Record<string, unknown>>[] = [];
      const lease = {
        contractVersion: "investing-research-orchestration-lease/v1" as const,
        scope: { tenantId: "11111111-1111-4111-8111-111111111111", ownerId: "owner",
          portfolioId: "portfolio", accountId: "22222222-2222-4222-8222-222222222222" },
        acquisitionJobId: "job-timeout", attempt: 1, leaseToken: "lease_1234567890123456",
        leaseOwner: "worker", fencingToken: 1, stateVersion: 1,
        leasedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:01:00.000Z",
      };
      const renewed = { ...lease, stateVersion: 2, expiresAt: "2026-01-01T00:02:00.000Z" };
      const repository = {
        claim: vi.fn().mockResolvedValue(lease), claimNext: vi.fn(),
        heartbeat: vi.fn().mockResolvedValue(renewed), finalize: vi.fn(),
        scheduleRetry: vi.fn().mockResolvedValue({
          accepted: true, scheduled: true, acquisitionJobId: "job-timeout-2",
          attempt: 2, notBefore: "2026-01-01T00:00:20.000Z",
        }),
      } satisfies AcquisitionOrchestrationRepository;
      let observedAbort = false;
      const worker = new OneShotAcquisitionWorker(repository, (event) => events.push(event));
      const running = worker.run({ scope: lease.scope, acquisitionJobId: lease.acquisitionJobId,
        leaseOwner: "worker", policy: { ...valid, leaseSeconds: 20, heartbeatSeconds: 5,
          executionTimeoutSeconds: 15 },
        work: { run(signal) { return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
            reject(new Error("provider secret"));
          }, { once: true });
        }); } }, signal: new AbortController().signal });
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(running).resolves.toMatchObject({ claimed: true, retryScheduled: true });
      expect(observedAbort).toBe(true);
      expect(repository.heartbeat).toHaveBeenCalled();
      expect(repository.scheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({ expectedStateVersion: 2 }),
        expect.objectContaining({ outcome: expect.objectContaining({
          classification: "transient", sanitizedError: "acquisition_execution_timeout",
        }) }),
      );
      expect(events.map((event) => event.type)).toContain("orchestration_execution_timed_out");
      expect(JSON.stringify(events)).not.toContain("provider secret");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
