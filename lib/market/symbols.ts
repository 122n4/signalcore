import type { AssetKind } from "@/lib/market/types";

export function inferAssetKind(symbol: string): AssetKind {
  const normalized = normSymbol(symbol);

  if (normalized.includes("/")) {
    const [left, right] = normalized.split("/");

    if ((left === "XAU" || left === "XAG") && right === "USD") {
      return "metal";
    }

    if (["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"].includes(left)) {
      return "crypto";
    }

    return "forex";
  }

  if (["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "ADAUSD", "DOGEUSD"].includes(normalized)) {
    return "crypto";
  }

  if (["XAUUSD", "XAGUSD"].includes(normalized)) {
    return "metal";
  }

  if (["NDX", "SPX", "DJI", "GER40", "NAS100", "US500"].includes(normalized)) {
    return "index";
  }

  return "equity";
}

export function normSymbol(symbol: string) {
  return String(symbol ?? "").trim().toUpperCase();
}

export function toTwelveDataSymbol(symbol: string, kind: AssetKind): string {
  void kind;
  return normSymbol(symbol);
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
