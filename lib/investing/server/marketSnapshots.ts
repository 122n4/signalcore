import { createInvestingFingerprint } from "@/lib/investing/persistence";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import type { CustomerDecisionProjection } from "@/lib/investing/customerDecisionProjection";
import type { CanonicalMarketSnapshotV1, InvestingQualityIssueV1 } from "@/lib/investing/engine/v1/contracts";
import { canonicalDecimalFromFiniteNumberBoundary, normalizeIsoTimestamp } from "@/lib/investing/engine/v1/canonical";
import { sealMarketSnapshotV1 } from "@/lib/investing/engine/v1/validation";

const CURRENCY = /^[A-Z]{3}$/;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSnapshotAsOf(value: string) {
  try {
    return normalizeIsoTimestamp(value);
  } catch {
    throw new Error("investing_market_snapshot_as_of_invalid");
  }
}

function normalizeProviderTimestampSeconds(value: unknown) {
  const seconds = finiteNumber(value);
  if (seconds === null || seconds <= 0) return null;
  const date = new Date(seconds * 1_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function qualityIssue(
  asOf: string,
  symbol: string,
  code: string,
  severity: InvestingQualityIssueV1["severity"],
  message: string,
): InvestingQualityIssueV1 {
  return { code, severity, domain: "market", message: `${symbol}: ${message}`, observedAt: asOf };
}

function explicitProvider(quote: Record<string, any>) {
  const provider = typeof quote.source === "string"
    ? quote.source.trim()
    : typeof quote.provider === "string"
      ? quote.provider.trim()
      : "";
  if (!provider || provider.toLowerCase() === "unknown") return null;
  return provider;
}

function pointQualityFromProvenance(args: {
  asOf: string;
  symbol: string;
  quote: Record<string, any>;
  issues: InvestingQualityIssueV1[];
}) {
  const cacheState = args.quote.cacheState && typeof args.quote.cacheState === "object"
    ? args.quote.cacheState as Record<string, any>
    : null;
  const source = explicitProvider(args.quote);
  const topLevelFallback = args.quote.servedFromFallback === true;
  const topLevelState = typeof args.quote.state === "string" ? args.quote.state.trim() : "";
  let quality: "good" | "degraded" | "insufficient" = "good";

  if (!cacheState) {
    args.issues.push(qualityIssue(
      args.asOf,
      args.symbol,
      "market_quote_provenance_unavailable",
      "error",
      "Provider cache/provenance state is unavailable",
    ));
    quality = "insufficient";
  } else {
    const stale = cacheState.stale === true;
    const cacheFallback = cacheState.servedFromFallback === true;
    const cacheStateName = typeof cacheState.state === "string" ? cacheState.state.trim() : "";
    const contradictory =
      (cacheStateName === "fresh" && (cacheFallback || topLevelFallback))
      || (cacheStateName === "last_known_good" && cacheFallback === false)
      || (topLevelState === "fresh" && cacheStateName === "last_known_good")
      || (topLevelState === "last_known_good" && cacheStateName === "fresh");

    if (contradictory) {
      args.issues.push(qualityIssue(
        args.asOf,
        args.symbol,
        "market_quote_provenance_contradictory",
        "error",
        "Provider cache/provenance state is contradictory",
      ));
      quality = "insufficient";
    }
    if (stale) {
      args.issues.push(qualityIssue(args.asOf, args.symbol, "market_quote_stale", "warning", "Provider quote is stale"));
      if (quality === "good") quality = "degraded";
    }
    if (cacheFallback || topLevelFallback || cacheStateName === "last_known_good" || topLevelState === "last_known_good") {
      args.issues.push(qualityIssue(args.asOf, args.symbol, "market_quote_fallback", "warning", "Provider quote was served from fallback or last-known-good state"));
      if (quality === "good") quality = "degraded";
    }
    if (cacheStateName !== "fresh" && cacheStateName !== "last_known_good") {
      args.issues.push(qualityIssue(
        args.asOf,
        args.symbol,
        "market_quote_provenance_unavailable",
        "error",
        "Provider cache/provenance state is not explicit",
      ));
      quality = "insufficient";
    }
  }

  if (source === "market-client-candle-fallback") {
    args.issues.push(qualityIssue(
      args.asOf,
      args.symbol,
      "market_quote_candle_fallback",
      "warning",
      "Quote source market-client-candle-fallback was derived through candle fallback rather than direct quote retrieval",
    ));
    if (quality === "good") quality = "degraded";
  }

  return quality;
}

function recordCandleFallbackIssue(args: {
  asOf: string;
  symbol: string;
  provider: string | null;
  issues: InvestingQualityIssueV1[];
}) {
  if (args.provider !== "market-client-candle-fallback") return;
  args.issues.push(qualityIssue(
    args.asOf,
    args.symbol,
    "market_quote_candle_fallback",
    "warning",
    "Quote source market-client-candle-fallback was derived through candle fallback rather than direct quote retrieval",
  ));
}

export function buildCanonicalMarketSnapshotFromQuotes(args: {
  asOf: string;
  symbols: string[];
  quotes: Record<string, any> | null | undefined;
}): CanonicalMarketSnapshotV1 {
  const asOf = normalizeSnapshotAsOf(args.asOf);
  const symbols = Array.from(new Set(args.symbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))).sort();
  const points: Array<CanonicalMarketSnapshotV1["points"][number]> = [];
  const issues: InvestingQualityIssueV1[] = [];

  for (const symbol of symbols) {
    const quote = args.quotes?.[symbol] ?? {};
    const provider = explicitProvider(quote);
    const price = finiteNumber(quote?.price);
    if (price == null || price <= 0) {
      issues.push(qualityIssue(asOf, symbol, "market_price_missing", "error", "No positive provider price in snapshot"));
      recordCandleFallbackIssue({ asOf, symbol, provider, issues });
      continue;
    }

    const currency = typeof quote?.currency === "string" ? quote.currency.trim().toUpperCase() : "";
    if (!currency) {
      issues.push(qualityIssue(asOf, symbol, "market_currency_missing", "error", "Provider currency is unavailable"));
      recordCandleFallbackIssue({ asOf, symbol, provider, issues });
      continue;
    }
    if (!CURRENCY.test(currency)) {
      issues.push(qualityIssue(asOf, symbol, "market_currency_invalid", "error", "Provider currency is invalid"));
      recordCandleFallbackIssue({ asOf, symbol, provider, issues });
      continue;
    }

    if (!provider) {
      issues.push(qualityIssue(asOf, symbol, "market_provider_missing", "error", "Provider identity is unavailable"));
      continue;
    }
    if (!PROVIDER_ID.test(provider)) {
      issues.push(qualityIssue(asOf, symbol, "market_provider_invalid", "error", "Provider identity is invalid"));
      continue;
    }

    if (quote?.ts === null || quote?.ts === undefined || quote?.ts === "") {
      issues.push(qualityIssue(asOf, symbol, "market_provider_timestamp_missing", "error", "Provider timestamp is unavailable"));
      continue;
    }
    const providerAsOf = normalizeProviderTimestampSeconds(quote.ts);
    if (!providerAsOf) {
      issues.push(qualityIssue(asOf, symbol, "market_provider_timestamp_invalid", "error", "Provider timestamp is invalid"));
      continue;
    }

    const quality = pointQualityFromProvenance({ asOf, symbol, quote, issues });
    points.push({
      symbol,
      price: canonicalDecimalFromFiniteNumberBoundary(price),
      currency,
      provider,
      providerAsOf,
      receivedAt: asOf,
      quality,
    });
  }

  const identityHash = createInvestingFingerprint({ asOf, schemaVersion: "investing-market-snapshot/v1", points, issues });
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: `market_${identityHash.slice(0, 40)}`,
    asOf,
    schemaVersion: "investing-market-snapshot/v1",
    points,
    issues,
  });
}

export function toCustomerMarketSnapshot(args: {
  snapshot: CanonicalMarketSnapshotV1;
  persisted: boolean;
}): CustomerDecisionProjection["marketSnapshot"] {
  return {
    snapshotId: args.snapshot.marketSnapshotId,
    asOf: args.snapshot.asOf,
    hash: args.snapshot.snapshotHash,
    source: "provider_quotes",
    immutableInDatabase: args.persisted,
    quotes: args.snapshot.points.filter((point) => point.quality === "good").map((point) => ({
      symbol: point.symbol,
      price: Number(point.price),
      source: point.provider,
      asOf: point.providerAsOf,
    })),
  };
}

export function quotesFromCanonicalMarketSnapshot(snapshot: CanonicalMarketSnapshotV1): Record<string, any> {
  return Object.fromEntries(
    snapshot.points.filter((point) => point.quality !== "insufficient").map((point) => {
      const quote = {
        price: Number(point.price),
        currency: point.currency,
        source: point.provider,
        provider: point.provider,
        asOf: point.providerAsOf,
        timestamp: point.providerAsOf,
        ts: Math.floor(new Date(point.providerAsOf).getTime() / 1_000),
        quality: point.quality,
      };
      if (point.quality === "degraded") return [point.symbol, quote];
      return [
        point.symbol,
        {
          ...quote,
          availability: "REAL",
          status: "fresh",
          freshness: "fresh",
          cacheState: {
            stale: false,
            servedFromFallback: false,
            state: "fresh",
            lastGoodAt: null,
          },
          servedFromFallback: false,
          state: "fresh",
        },
      ];
    }),
  );
}

function shouldUseDirectPersistenceFallback(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "PGRST202" || message.includes("could not find the function");
}

async function persistInvestingMarketSnapshotDirect(args: {
  database: any;
  userId: string;
  portfolioId: string;
  accountId: string | null;
  snapshot: CanonicalMarketSnapshotV1;
}): Promise<{ persisted: boolean; result: any | null; error: string | null }> {
  if (args.accountId) {
    const account = await args.database
      .from("investing_accounts")
      .select("id")
      .eq("id", args.accountId)
      .eq("user_id", args.userId)
      .eq("environment", "paper")
      .maybeSingle();
    if (account.error || !account.data) {
      return { persisted: false, result: null, error: String(account.error?.message || "market_snapshot_direct_account_scope_invalid") };
    }
  }

  const quoteCount = args.snapshot.points.filter((point) => point.quality !== "insufficient").length;
  const missingCount = args.snapshot.points.filter((point) => point.quality === "insufficient").length + args.snapshot.issues.length;
  const quality = quoteCount === 0 ? "insufficient" : missingCount > 0 ? "degraded" : "good";
  const snapshotRow = {
    snapshot_id: args.snapshot.marketSnapshotId,
    owner_id: args.userId,
    portfolio_id: args.portfolioId,
    account_id: args.accountId,
    as_of: args.snapshot.asOf,
    schema_version: args.snapshot.schemaVersion,
    source: "provider_quotes",
    quality,
    snapshot_hash: args.snapshot.snapshotHash,
    quote_count: quoteCount,
    missing_count: missingCount,
    canonical_payload: args.snapshot,
  };

  const inserted = await args.database.from("investing_market_snapshots").insert(snapshotRow).select("snapshot_id,snapshot_hash,owner_id").maybeSingle();
  if (inserted.error) {
    const isDuplicate = String(inserted.error.code || "") === "23505" || String(inserted.error.message || "").toLowerCase().includes("duplicate");
    if (!isDuplicate) return { persisted: false, result: null, error: String(inserted.error.message || "market_snapshot_direct_insert_failed") };
    const existing = await args.database
      .from("investing_market_snapshots")
      .select("snapshot_id,snapshot_hash,owner_id")
      .eq("snapshot_id", args.snapshot.marketSnapshotId)
      .maybeSingle();
    if (existing.error) return { persisted: false, result: null, error: String(existing.error.message || "market_snapshot_direct_idempotency_read_failed") };
    if (existing.data?.snapshot_hash !== args.snapshot.snapshotHash || existing.data?.owner_id !== args.userId) {
      return { persisted: false, result: null, error: "market_snapshot_direct_id_conflict" };
    }
    return {
      persisted: true,
      result: { ok: true, snapshotId: args.snapshot.marketSnapshotId, snapshotHash: args.snapshot.snapshotHash, persisted: true, idempotent: true, directFallback: true },
      error: null,
    };
  }

  if (args.snapshot.points.length > 0) {
    const items = args.snapshot.points.map((point) => ({
      snapshot_id: args.snapshot.marketSnapshotId,
      symbol: point.symbol,
      price: point.price,
      currency: point.currency,
      provider: point.provider,
      provider_as_of: point.providerAsOf,
      received_at: point.receivedAt,
      quality: point.quality,
      raw_payload: point,
    }));
    const itemsInserted = await args.database.from("investing_market_snapshot_items").insert(items);
    if (itemsInserted.error) return { persisted: false, result: null, error: String(itemsInserted.error.message || "market_snapshot_direct_items_insert_failed") };
  }

  return {
    persisted: true,
    result: {
      ok: true,
      snapshotId: args.snapshot.marketSnapshotId,
      snapshotHash: args.snapshot.snapshotHash,
      persisted: true,
      idempotent: false,
      quoteCount,
      missingCount,
      directFallback: true,
    },
    error: null,
  };
}

export async function persistInvestingMarketSnapshot(args: {
  userId: string;
  portfolioId: string;
  accountId: string | null;
  snapshot: CanonicalMarketSnapshotV1;
}): Promise<{ persisted: boolean; result: any | null; error: string | null }> {
  try {
    const database = getInvestingSupabaseAdmin() as any;
    const result = await database.rpc("investing_record_market_snapshot_v1", {
      p_actor_user_id: args.userId,
      p_portfolio_id: args.portfolioId,
      p_account_id: args.accountId,
      p_snapshot: args.snapshot,
    });
    if (result.error) {
      if (shouldUseDirectPersistenceFallback(result.error)) {
        return persistInvestingMarketSnapshotDirect({
          database,
          userId: args.userId,
          portfolioId: args.portfolioId,
          accountId: args.accountId,
          snapshot: args.snapshot,
        });
      }
      return { persisted: false, result: null, error: String(result.error.message || "market_snapshot_persist_failed") };
    }
    return { persisted: true, result: result.data ?? null, error: null };
  } catch (error: any) {
    return { persisted: false, result: null, error: String(error?.message || "market_snapshot_persist_failed") };
  }
}
