import type { AssetKind } from "@/lib/market/types";

const CRYPTO_BASES = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"];
const METAL_BASES = ["XAU", "XAG"];
const FIAT_CURRENCIES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "CNH",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "NZD",
  "SEK",
  "SGD",
  "USD",
]);

export function inferAssetKind(symbol: string): AssetKind {
  const normalized = normSymbol(symbol);

  if (normalized.includes("/")) {
    const [left, right] = normalized.split("/");

    if (METAL_BASES.includes(left) && right === "USD") {
      return "metal";
    }

    if (CRYPTO_BASES.includes(left)) {
      return "crypto";
    }

    return "forex";
  }

  if (CRYPTO_BASES.some((base) => normalized === `${base}USD`)) {
    return "crypto";
  }

  if (METAL_BASES.some((base) => normalized === `${base}USD`)) {
    return "metal";
  }

  if (isCompactForexPair(normalized)) return "forex";

  if (["NDX", "SPX", "DJI", "GER40", "NAS100", "US500"].includes(normalized)) {
    return "index";
  }

  return "equity";
}

export function normSymbol(symbol: string) {
  return String(symbol ?? "").trim().toUpperCase();
}

export function toTwelveDataSymbol(symbol: string, kind: AssetKind): string {
  const normalized = normSymbol(symbol);
  if (normalized.includes("/")) return normalized;

  if (kind === "forex" && isCompactForexPair(normalized)) {
    return `${normalized.slice(0, 3)}/${normalized.slice(3)}`;
  }

  if (kind === "metal" && normalized.length === 6) {
    return `${normalized.slice(0, 3)}/${normalized.slice(3)}`;
  }

  if (kind === "crypto" && normalized.endsWith("USD") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}/USD`;
  }

  return normalized;
}

export function toFinnhubSymbol(symbol: string, kind?: AssetKind): string {
  const normalized = normSymbol(symbol);
  const resolvedKind = kind ?? inferAssetKind(normalized);

  if (resolvedKind === "forex" || resolvedKind === "metal") {
    if (normalized.includes("/")) {
      const [base, quote] = normalized.split("/");
      return `OANDA:${base}_${quote}`;
    }
    if (normalized.length === 6) {
      return `OANDA:${normalized.slice(0, 3)}_${normalized.slice(3)}`;
    }
  }

  if (resolvedKind === "crypto") {
    if (normalized.includes("/")) {
      const [base, quote] = normalized.split("/");
      if (quote === "USD") return `BINANCE:${base}USDT`;
      return `BINANCE:${base}${quote}`;
    }
    if (normalized.endsWith("USD")) {
      return `BINANCE:${normalized.slice(0, -3)}USDT`;
    }
  }

  return normalized;
}

function isCompactForexPair(symbol: string) {
  if (symbol.length !== 6) return false;
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  return FIAT_CURRENCIES.has(base) && FIAT_CURRENCIES.has(quote);
}
