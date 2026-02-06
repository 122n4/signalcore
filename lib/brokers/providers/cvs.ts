import type { BrokerProvider, Holding, PortfolioSnapshot, Trade, Cash } from "../types";
import { computeMetrics } from "../normalize";

export type CsvUpload = {
  // Minimal format you can expand later:
  // holdingsCsv: "symbol,quantity,price,currency,name\nAAPL,2,190,USD,Apple"
  holdingsCsv: string;
  cashCsv?: string;   // "currency,value\nEUR,1200"
  tradesCsv?: string; // "ts,symbol,side,quantity,price,currency\n1700000000000,AAPL,buy,1,180,USD"
  asOf?: string;
};

function parseCsvLines(text: string) {
  const lines = (text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return { header: [], rows: [] as string[][] };
  const header = lines[0].split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((s) => s.trim()));
  return { header, rows };
}

export async function snapshotFromCsv(userId: string, payload: CsvUpload): Promise<PortfolioSnapshot> {
  const { header, rows } = parseCsvLines(payload.holdingsCsv);
  const idx = (k: string) => header.findIndex((h) => h.toLowerCase() === k.toLowerCase());

  const holdings: Holding[] = rows
    .map((r) => {
      const symbol = r[idx("symbol")] || "";
      const quantity = Number(r[idx("quantity")] ?? 0);
      const price = Number(r[idx("price")] ?? 0);
      const currency = r[idx("currency")] || "EUR";
      const name = r[idx("name")] || undefined;

      if (!symbol || !Number.isFinite(quantity) || quantity <= 0) return null;

      const marketValue =
        Number.isFinite(price) && price > 0 ? quantity * price : undefined;

      return { symbol, quantity, price: price || undefined, currency, name, marketValue };
    })
    .filter(Boolean) as Holding[];

  const cash: Cash[] = [];
  if (payload.cashCsv) {
    const c = parseCsvLines(payload.cashCsv);
    const cidx = (k: string) => c.header.findIndex((h) => h.toLowerCase() === k.toLowerCase());
    for (const r of c.rows) {
      const currency = r[cidx("currency")] || "EUR";
      const value = Number(r[cidx("value")] ?? 0);
      if (Number.isFinite(value) && value >= 0) cash.push({ currency, value });
    }
  }

  const trades: Trade[] = [];
  if (payload.tradesCsv) {
    const t = parseCsvLines(payload.tradesCsv);
    const tidx = (k: string) => t.header.findIndex((h) => h.toLowerCase() === k.toLowerCase());
    for (const r of t.rows) {
      const ts = Number(r[tidx("ts")] ?? 0);
      const symbol = r[tidx("symbol")] || "";
      const side = (r[tidx("side")] || "buy") as any;
      const quantity = Number(r[tidx("quantity")] ?? 0);
      const price = Number(r[tidx("price")] ?? 0);
      const currency = r[tidx("currency")] || "EUR";
      if (!symbol || !Number.isFinite(ts) || !Number.isFinite(quantity) || quantity <= 0) continue;
      if (side !== "buy" && side !== "sell") continue;
      trades.push({ ts, symbol, side, quantity, price: price || undefined, currency });
    }
  }

  const snap: PortfolioSnapshot = {
    userId,
    provider: "csv",
    connectionId: null,
    asOf: payload.asOf ?? new Date().toISOString(),
    holdings,
    cash,
    trades,
    metrics: {},
  };

  const m = computeMetrics(snap);
  snap.metrics = {
    totalValue: m.totalValue,
    currency: m.currency,
    concentrationTop5Pct: m.concentrationTop5Pct,
    holdingsCount: m.holdingsCount,
  };
  // Attach weights into holdings for downstream UI (optional)
  snap.holdings = (m as any).holdingsWeighted ?? snap.holdings;

  return snap;
}