import "server-only";
import type { DatasetRequirementMaterial } from "../datasets";
import type { ProviderAcquisitionResult, ProviderBar, TimeSeriesProviderAdapter } from "./providerAdapter.server";

type FetchLike = typeof fetch;
const sanitize = (value: unknown, apiKey: string) =>
  String(value instanceof Error ? value.message : value).replaceAll(apiKey, "[redacted]").replace(/https?:\/\/\S+/giu, "[url-redacted]").slice(0, 240);

export class TwelveDataInvestingAdapter implements TimeSeriesProviderAdapter {
  readonly providerId = "twelvedata";
  constructor(private readonly apiKey: string, private readonly fetcher: FetchLike = fetch, private readonly endpoint = "https://api.twelvedata.com") {}

  async acquire(requirement: DatasetRequirementMaterial, options: Readonly<{ signal?: AbortSignal; timeoutMs: number }>): Promise<ProviderAcquisitionResult> {
    if (!this.apiKey) return { kind: "provider_unavailable", provider: this.providerId, retryable: false, retryAfterSeconds: null, classification: "credentials_unavailable" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), Math.max(1, options.timeoutMs));
    let callerAborted = options.signal?.aborted === true;
    const abort = () => { callerAborted = true; controller.abort(options.signal?.reason); };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const url = new URL("/time_series", this.endpoint);
      url.searchParams.set("symbol", requirement.instrument.symbol);
      url.searchParams.set("interval", requirement.timeframe);
      url.searchParams.set("start_date", requirement.range.startInclusive);
      url.searchParams.set("end_date", requirement.range.endExclusive);
      url.searchParams.set("timezone", "UTC");
      url.searchParams.set("order", "ASC");
      url.searchParams.set("outputsize", "5000");
      url.searchParams.set("apikey", this.apiKey);
      const response = await this.fetcher(url, { signal: controller.signal, cache: "no-store" });
      const requestId = response.headers.get("x-request-id");
      const retryAfter = response.headers.get("retry-after");
      if (response.status === 429) return { kind: "provider_unavailable", provider: this.providerId, retryable: true, retryAfterSeconds: retryAfter ? Number(retryAfter) : null, classification: "rate_limited" };
      if (response.status >= 500) return { kind: "provider_unavailable", provider: this.providerId, retryable: true, retryAfterSeconds: null, classification: "upstream_unavailable" };
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof payload !== "object" || payload === null || Array.isArray(payload)) return { kind: "failed", provider: this.providerId, retryable: false, classification: "response_invalid", sanitizedError: "provider_response_invalid" };
      const body = payload as Record<string, unknown>;
      if (body.status === "error") {
        const code = Number(body.code);
        return code === 404 && typeof body.message === "string" && /no data/iu.test(body.message)
          ? { kind: "confirmed_no_data", provider: this.providerId, providerRequestId: requestId, evidence: "provider_explicit_no_data" }
          : { kind: "failed", provider: this.providerId, retryable: code === 429 || code >= 500, classification: "provider_error", sanitizedError: sanitize(body.message, this.apiKey) };
      }
      if (!Array.isArray(body.values)) return { kind: "failed", provider: this.providerId, retryable: false, classification: "response_invalid", sanitizedError: "provider_response_invalid" };
      if (body.values.length === 0) return { kind: "failed", provider: this.providerId, retryable: false, classification: "empty_without_evidence", sanitizedError: "provider_response_invalid" };
      const bars: ProviderBar[] = [];
      for (const entry of body.values) {
        if (typeof entry !== "object" || entry === null) return { kind: "failed", provider: this.providerId, retryable: false, classification: "response_invalid", sanitizedError: "provider_response_invalid" };
        const row = entry as Record<string, unknown>;
        const timestampValue = Date.parse(String(row.datetime));
        if (!Number.isFinite(timestampValue)) return { kind: "failed", provider: this.providerId, retryable: false, classification: "response_invalid", sanitizedError: "provider_response_invalid" };
        const timestamp = new Date(timestampValue).toISOString();
        const nums = ["open","high","low","close"].map((key) => Number(row[key]));
        const volume = row.volume === undefined || row.volume === null ? null : Number(row.volume);
        if (!nums.every(Number.isFinite) || !(volume === null || Number.isFinite(volume))) return { kind: "failed", provider: this.providerId, retryable: false, classification: "response_invalid", sanitizedError: "provider_response_invalid" };
        bars.push({ timestamp, open: nums[0], high: nums[1], low: nums[2], close: nums[3], volume });
      }
      return { kind: "acquired", provider: this.providerId, providerVersion: "time_series/v1", providerRequestId: requestId, sourceTimezone: "UTC", bars, rateLimit: { remaining: response.headers.get("x-ratelimit-remaining") ? Number(response.headers.get("x-ratelimit-remaining")) : null, resetAt: null } };
    } catch (error) {
      if (callerAborted) return { kind: "cancelled", provider: this.providerId, classification: "caller_aborted" };
      return { kind: "provider_unavailable", provider: this.providerId, retryable: true, retryAfterSeconds: null, classification: error instanceof DOMException && error.name === "AbortError" ? "timeout" : sanitize(error, this.apiKey) };
    } finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", abort); }
  }
}
