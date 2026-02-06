// lib/brokers/providers/csv.ts
import type { Holding, PortfolioSnapshot, Trade, Cash } from "../types";
import { computeMetrics } from "../normalize";

export type CsvUpload = {
  // holdingsCsv: "symbol,quantity,price,currency,name\nAAPL,2,190,USD,Apple"
  holdingsCsv: string;
  cashCsv?: string;   // "currency,value\nEUR,1200"
  tradesCsv?: string; // "ts,symbol,side,quantity,price,currency\n1700000000000,AAPL,buy,1,180,USD"
  asOf?: string;
};

type ParsedCsv = { header: string[]; rows: string[][] };

function parseCsvLines(text: string): ParsedCsv {
  const lines = (text || "")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return { header: [], rows: [] };

  const header = lines[0].split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((s) => s.trim()));
  return { header, rows };
}

function idxOf(header: string[], k: string) {
  const kk = k.toLowerCase();
  return header.findIndex((h) => h.toLowerCase() === kk);
}

export async function snapshotFromCsv(userId: string, payload: CsvUpload): Promise<PortfolioSnapshot> {
  const { header, rows } = parseCsvLines(payload.holdingsCsv);

  const iSymbol = idxOf(header, "symbol");
  const iQty = idxOf(header, "quantity");
  const iPrice = idxOf(header, "price");
  const iCcy = idxOf(header, "currency");
  const iName = idxOf(header, "name");

  const holdings: Holding[] = rows
    .map((r): Holding | null => {
      const symbol = (iSymbol >= 0 ? r[iSymbol] : "")?.trim();
      const quantity = Number(iQty >= 0 ? r[iQty] : 0);
      const price = Number(iPrice >= 0 ? r[iPrice] : 0);
      const currency = (iCcy >= 0 ? r[iCcy] : "EUR") || "EUR";
      const name = (iName >= 0 ? r[iName] : undefined) || undefined;

      if (!symbol) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      const mv =
        Number.isFinite(price) && price > 0 ? quantity * price : null;

      return {
        symbol,
        quantity,
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency,
        name,
        marketValue: mv,
      };
    })
    .filter((x): x is Holding => Boolean(x));

  const cash: Cash[] = [];
  if (payload.cashCsv) {
    const c = parseCsvLines(payload.cashCsv);
    const cCcy = idxOf(c.header, "currency");
    const cVal = idxOf(c.header, "value");

    for (const r of c.rows) {
      const currency = (cCcy >= 0 ? r[cCcy] : "EUR") || "EUR";
      const value = Number(cVal >= 0 ? r[cVal] : 0);
      if (Number.isFinite(value) && value >= 0) cash.push({ currency, value });
    }
  }

  const trades: Trade[] = [];
  if (payload.tradesCsv) {
    const t = parseCsvLines(payload.tradesCsv);
    const tTs = idxOf(t.header, "ts");
    const tSym = idxOf(t.header, "symbol");
    const tSide = idxOf(t.header, "side");
    const tQty = idxOf(t.header, "quantity");
    const tPrice = idxOf(t.header, "price");
    const tCcy = idxOf(t.header, "currency");

    for (const r of t.rows) {
      const ts = Number(tTs >= 0 ? r[tTs] : 0);
      const symbol = (tSym >= 0 ? r[tSym] : "")?.trim();
      const sideRaw = (tSide >= 0 ? r[tSide] : "buy")?.trim().toLowerCase();
      const side = sideRaw === "sell" ? "sell" : "buy";
      const quantity = Number(tQty >= 0 ? r[tQty] : 0);
      const price = Number(tPrice >= 0 ? r[tPrice] : 0);
      const currency = (tCcy >= 0 ? r[tCcy] : "EUR") || "EUR";

      if (!symbol) continue;
      if (!Number.isFinite(ts) || ts <= 0) continue;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      trades.push({
        ts,
        symbol,
        side,
        quantity,
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency,
      });
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

  // computeMetrics() should accept PortfolioSnapshot and return an object
  // with totals + optional holdingsWeighted.
  const m: any = computeMetrics(snap as any);

  snap.metrics = {
    totalValue: m?.totalValue ?? null,
    currency: m?.currency ?? null,
    concentrationTop5Pct: m?.concentrationTop5Pct ?? null,
    holdingsCount: m?.holdingsCount ?? null,
  };

  // Attach weights into holdings for downstream UI if provided
  if (Array.isArray(m?.holdingsWeighted)) {
    snap.holdings = m.holdingsWeighted as Holding[];
  }

  return snap;
}