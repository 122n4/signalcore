import "server-only";
import type { InvestingResearchScientificScope } from "../contracts";
import type { DatasetReasonCode } from "../datasets";

export const DATASET_EVENT_TYPES = [
  "requirement_created","requirement_reused","acquisition_requested",
  "acquisition_reused","acquisition_started","acquisition_succeeded",
  "confirmed_no_data","provider_unavailable","acquisition_failed",
  "acquisition_cancelled","dataset_version_published",
  "dataset_version_reused","integrity_mismatch",
] as const;

export type DatasetEvent = Readonly<{
  type: (typeof DATASET_EVENT_TYPES)[number];
  scope: InvestingResearchScientificScope;
  aggregateId: string;
  requirementId: string;
  attempt: number | null;
  state: string;
  occurredAt: string;
  correlationId: string;
  provider: string | null;
  durationMs: number | null;
  reasonCode: DatasetReasonCode | null;
}>;

export interface DatasetEventSink {
  emit(event: DatasetEvent): void | Promise<void>;
}

export interface DatasetClockPort {
  now(): Readonly<{ iso: string; monotonicMs: number }>;
}
