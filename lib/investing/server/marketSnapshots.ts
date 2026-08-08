import { createInvestingFingerprint } from "@/lib/investing/persistence";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import type { CustomerDecisionProjection } from "@/lib/investing/customerDecisionProjection";
import type { CanonicalMarketSnapshotV1, InvestingQualityIssueV1 } from "@/lib/investing/engine/v1/contracts";
import { sealMarketSnapshotV1 } from "@/lib/investing/engine/v1/validation";

function safeNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeIso(value: unknown, fallback: string) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function qualityIssue(asOf: string, symbol: string, code: string, message: string): InvestingQualityIssueV1 {
  return { code, severity: "warning", domain: "market", message: `${symbol}: ${message}`, observedAt: asOf };
}

export function buildCanonicalMarketSnapshotFromQuotes(args: {
  asOf: string;
  symbols: string[];
  quotes: Record<string, any> | null | undefined;
}): CanonicalMarketSnapshotV1 {
  const asOf = normalizeIso(args.asOf, new Date().toISOString());
  const symbols = Array.from(new Set(args.symbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))).sort();
  const points = [];
  const issues: InvestingQualityIssueV1[] = [];

  for (const symbol of symbols) {
    const quote = args.quotes?.[symbol] ?? {};
    const price = safeNumber(quote?.price);
    if (price == null || price <= 0) {
      issues.push(qualityIssue(asOf, symbol, "market_price_missing", "No positive provider price in snapshot"));
      continue;
    }
    const providerAsOf = normalizeIso(quote?.asOf ?? quote?.timestamp ?? quote?.time, asOf);
    points.push({
      symbol,
      price: String(price),
      currency: String(quote?.currency || "EUR").trim().toUpperCase(),
      provider: String(quote?.source || quote?.provider || "unknown").trim() || "unknown",
      providerAsOf,
      receivedAt: asOf,
      quality: "good" as const,
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
    quotes: args.snapshot.points.map((point) => ({
      symbol: point.symbol,
      price: Number(point.price),
      source: point.provider,
      asOf: point.providerAsOf,
    })),
  };
}

export function quotesFromCanonicalMarketSnapshot(snapshot: CanonicalMarketSnapshotV1): Record<string, any> {
  return Object.fromEntries(
    snapshot.points.map((point) => [
      point.symbol,
      {
        price: Number(point.price),
        currency: point.currency,
        source: point.provider,
        provider: point.provider,
        asOf: point.providerAsOf,
        timestamp: point.providerAsOf,
      },
    ]),
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
