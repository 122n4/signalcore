import "server-only";
import { randomUUID } from "node:crypto";
import type { AcquisitionOutcome } from "../datasets";
import type { InvestingResearchScientificScope } from "../contracts";
import type { AcquisitionOrchestrationRepository } from "./repository.server";
import type { OrchestrationRetryPolicy, RetryClassification } from "./types";

export type AcquisitionWork = Readonly<{
  run(signal: AbortSignal): Promise<Readonly<{
    state: "acquired_raw" | "confirmed_no_data" | "provider_unavailable" | "acquisition_failed";
    outcome: AcquisitionOutcome | null;
  }>>;
  classifyError?(error: unknown): RetryClassification;
}>;

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

export class OneShotAcquisitionWorker {
  constructor(
    private readonly repository: AcquisitionOrchestrationRepository,
    private readonly emit: (event: Readonly<Record<string, unknown>>) => void = () => undefined,
  ) {}
  async run(input: Readonly<{ scope: InvestingResearchScientificScope;
    acquisitionJobId?: string; leaseOwner: string;
    policy: OrchestrationRetryPolicy; work: AcquisitionWork; signal: AbortSignal }>) {
    const claimInput = {
      scope: input.scope,
      leaseOwner: input.leaseOwner,
      leaseToken: `lease_${randomUUID()}`,
      policy: input.policy,
    };
    let lease = input.acquisitionJobId === undefined
      ? await this.repository.claimNext(claimInput)
      : await this.repository.claim({ ...claimInput, acquisitionJobId: input.acquisitionJobId });
    if (!lease) return { claimed: false as const };
    this.emit({ type: lease.fencingToken > 1 ? "orchestration_lease_reclaimed" : "orchestration_lease_claimed",
      acquisitionJobId: lease.acquisitionJobId, fencingToken: lease.fencingToken,
      stateVersion: lease.stateVersion });
    const executionStartedAt = Date.now();
    const workAbort = new AbortController();
    const heartbeatStop = new AbortController();
    const timeoutError = new Error("orchestration_execution_timeout");
    const abortError = new Error("orchestration_execution_aborted");
    const staleError = new Error("orchestration_stale_worker");
    let timedOut = false;
    let rejectControl: ((reason: Error) => void) | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const abortWork = () => { workAbort.abort(); rejectControl?.(abortError); };
    const control = new Promise<never>((_resolve, reject) => {
      rejectControl = reject;
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        workAbort.abort();
        this.emit({ type: "orchestration_execution_timed_out",
          acquisitionJobId: lease.acquisitionJobId, attempt: lease.attempt,
          fencingToken: lease.fencingToken, durationMs: Date.now() - executionStartedAt });
        reject(timeoutError);
      }, input.policy.executionTimeoutSeconds * 1000);
      if (input.signal.aborted) abortWork();
      else input.signal.addEventListener("abort", abortWork, { once: true });
    });
    let stale = false;
    const heartbeat = async () => {
      while (!heartbeatStop.signal.aborted) {
        await wait(input.policy.heartbeatSeconds * 1000, heartbeatStop.signal);
        if (heartbeatStop.signal.aborted) break;
        const renewed = await this.repository.heartbeat({
          scope: lease.scope, acquisitionJobId: lease.acquisitionJobId,
          leaseToken: lease.leaseToken, leaseOwner: lease.leaseOwner,
          fencingToken: lease.fencingToken, expectedStateVersion: lease.stateVersion,
        }, input.policy.leaseSeconds);
        if (!renewed) {
          stale = true;
          workAbort.abort();
          rejectControl?.(staleError);
          this.emit({ type: "orchestration_stale_worker_rejected",
            acquisitionJobId: lease.acquisitionJobId, fencingToken: lease.fencingToken });
          break;
        }
        lease = renewed;
        this.emit({ type: "orchestration_heartbeat", acquisitionJobId: lease.acquisitionJobId,
          fencingToken: lease.fencingToken, stateVersion: lease.stateVersion });
      }
    };
    const heartbeatTask = heartbeat();
    let result: Awaited<ReturnType<AcquisitionWork["run"]>>;
    try {
      result = await Promise.race([input.work.run(workAbort.signal), control]);
    } catch (error) {
      const classification = timedOut
        ? "transient"
        : input.signal.aborted ? "cancelled"
        : (input.work.classifyError?.(error) ?? "permanent");
      result = {
        state: "acquisition_failed",
        outcome: { kind: "failed", reasonCode: "acquisition_failed", classification,
          retryable: classification === "transient" || classification === "rate_limited",
          sanitizedError: timedOut ? "acquisition_execution_timeout" : "acquisition_work_failed" },
      };
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      heartbeatStop.abort();
      await heartbeatTask;
      input.signal.removeEventListener("abort", abortWork);
    }
    if (stale) throw new Error("orchestration_stale_worker");
    const command = {
      scope: lease.scope, acquisitionJobId: lease.acquisitionJobId,
      leaseToken: lease.leaseToken, leaseOwner: lease.leaseOwner,
      fencingToken: lease.fencingToken, expectedStateVersion: lease.stateVersion,
    };
    const retryable = (result.state === "acquisition_failed"
      || result.state === "provider_unavailable") && result.outcome?.kind !== "unsupported"
      && result.outcome?.kind !== "cancelled" && result.outcome?.kind !== "confirmed_no_data"
      && result.outcome?.kind !== "acquired" && result.outcome?.retryable === true;
    if (retryable && result.outcome !== null) {
      const retry = await this.repository.scheduleRetry(command, {
        terminalState: result.state as "provider_unavailable" | "acquisition_failed",
        outcome: result.outcome,
        nextAcquisitionJobId: `iracq_retry_${randomUUID()}`,
      });
      if (!retry.accepted) {
        this.emit({ type: "orchestration_stale_worker_rejected",
          acquisitionJobId: lease.acquisitionJobId, fencingToken: lease.fencingToken });
        throw new Error("orchestration_stale_worker");
      }
      this.emit({ type: retry.scheduled ? "orchestration_retry_scheduled" : "orchestration_retry_exhausted",
        acquisitionJobId: lease.acquisitionJobId, nextAcquisitionJobId: retry.acquisitionJobId,
        attempt: retry.attempt, notBefore: retry.notBefore });
      return { claimed: true as const, finalized: true as const, retryScheduled: retry.scheduled };
    }
    const finalized = await this.repository.finalize(command,
      { nextState: result.state, outcome: result.outcome });
    if (!finalized) {
      this.emit({ type: "orchestration_stale_worker_rejected",
        acquisitionJobId: lease.acquisitionJobId, fencingToken: lease.fencingToken });
      throw new Error("orchestration_stale_worker");
    }
    this.emit({ type: "orchestration_finalized", acquisitionJobId: lease.acquisitionJobId,
      fencingToken: lease.fencingToken, outcome: result.outcome?.kind ?? "acquired_raw" });
    return { claimed: true as const, finalized: true as const };
  }
}
