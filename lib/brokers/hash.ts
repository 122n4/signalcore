import crypto from "crypto";
import type { PortfolioSnapshot } from "./types";

export function snapshotHash(s: PortfolioSnapshot) {
  const payload = {
    provider: s.provider,
    asOf: s.asOf,
    holdings: s.holdings.map((h) => ({
      symbol: h.symbol,
      qty: h.quantity,
      mv: h.marketValue ?? null,
    })),
    cash: s.cash.map((c) => ({ cur: c.currency, v: c.value })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}