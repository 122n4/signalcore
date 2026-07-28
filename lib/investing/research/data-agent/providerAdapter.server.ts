import "server-only";
import type { DatasetRequirementMaterial } from "../datasets";

export type ProviderBar = Readonly<{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}>;

export type ProviderAcquisitionResult =
  | Readonly<{ kind: "acquired"; provider: string; providerVersion: string; providerRequestId: string | null; sourceTimezone: string; bars: readonly ProviderBar[]; rateLimit: Readonly<{ remaining: number | null; resetAt: string | null }> }>
  | Readonly<{ kind: "confirmed_no_data"; provider: string; providerRequestId: string | null; evidence: string }>
  | Readonly<{ kind: "provider_unavailable"; provider: string; retryable: boolean; retryAfterSeconds: number | null; classification: string }>
  | Readonly<{ kind: "unsupported"; provider: string; reason: string }>
  | Readonly<{ kind: "cancelled"; provider: string; classification: "caller_aborted" }>
  | Readonly<{ kind: "failed"; provider: string; retryable: boolean; classification: string; sanitizedError: string }>;

export interface TimeSeriesProviderAdapter {
  readonly providerId: string;
  acquire(requirement: DatasetRequirementMaterial, options: Readonly<{ signal?: AbortSignal; timeoutMs: number }>): Promise<ProviderAcquisitionResult>;
}
