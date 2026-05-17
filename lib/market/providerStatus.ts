import { getTwelveDataKeyPoolStatus } from "@/lib/market/providers/twelvedataKeyPool";

export type MarketProviderStatus = {
  provider: "alphavantage" | "binance" | "coinbase" | "finnhub" | "fmp" | "kraken" | "twelvedata";
  label: string;
  configured: boolean;
  publicAccess: boolean;
  role: "primary" | "fallback" | "last_resort";
  markets: string[];
  detail: string;
};

function hasEnv(...names: string[]) {
  return names.some((name) => String(process.env[name] || "").trim().length > 0);
}

export function getMarketProviderStatuses(): MarketProviderStatus[] {
  const twelveData = getTwelveDataKeyPoolStatus();

  return [
    {
      provider: "coinbase",
      label: "Coinbase",
      configured: true,
      publicAccess: true,
      role: "primary",
      markets: ["crypto"],
      detail: "Public crypto quote/candles provider.",
    },
    {
      provider: "binance",
      label: "Binance",
      configured: true,
      publicAccess: true,
      role: "primary",
      markets: ["crypto"],
      detail: "Public crypto fallback with deep liquidity.",
    },
    {
      provider: "kraken",
      label: "Kraken",
      configured: true,
      publicAccess: true,
      role: "fallback",
      markets: ["crypto"],
      detail: "Public crypto fallback without an API key.",
    },
    {
      provider: "twelvedata",
      label: "Twelve Data",
      configured: twelveData.configuredCount > 0,
      publicAccess: false,
      role: "primary",
      markets: ["forex", "metals", "indices", "equities", "crypto"],
      detail: `${twelveData.configuredCount} keys configured, ${twelveData.activeCount} active, ${twelveData.cooldownCount} cooling down.`,
    },
    {
      provider: "fmp",
      label: "FMP",
      configured: hasEnv("FMP_API_KEY", "FINANCIAL_MODELING_PREP_API_KEY"),
      publicAccess: false,
      role: "fallback",
      markets: ["forex", "metals", "indices", "equities", "crypto"],
      detail: "Paid/free-key fallback for broad market coverage.",
    },
    {
      provider: "finnhub",
      label: "Finnhub",
      configured: hasEnv("FINNHUB_API_KEY"),
      publicAccess: false,
      role: "fallback",
      markets: ["equities", "forex", "crypto", "indices"],
      detail: "Equity-first fallback and secondary candles provider.",
    },
    {
      provider: "alphavantage",
      label: "Alpha Vantage",
      configured: hasEnv("ALPHAVANTAGE_API_KEY", "ALPHA_VANTAGE_API_KEY"),
      publicAccess: false,
      role: "last_resort",
      markets: ["forex", "equities"],
      detail: "Last-resort free-key provider for slow fallback coverage.",
    },
  ];
}

export function summarizeMarketProviderStatuses(statuses = getMarketProviderStatuses()) {
  return {
    total: statuses.length,
    configured: statuses.filter((provider) => provider.configured).length,
    publicProviders: statuses.filter((provider) => provider.publicAccess).length,
    keyBackedProviders: statuses.filter((provider) => !provider.publicAccess && provider.configured).length,
    cryptoRedundancy: statuses.filter((provider) => provider.configured && provider.markets.includes("crypto")).length,
    forexRedundancy: statuses.filter((provider) => provider.configured && provider.markets.includes("forex")).length,
    equityRedundancy: statuses.filter((provider) => provider.configured && provider.markets.includes("equities")).length,
  };
}
