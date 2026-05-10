import { finnhubQuote } from "@/lib/market/providers/finnhub";
import { inferAssetKind } from "@/lib/market/symbols";
import { tdQuoteNormalized } from "@/lib/market/providers/twelvedata";
import type { NormalizedCandle, TradingTimeframeMap } from "@/lib/trading/data";
import { TRADING_LIGHT_SCANNER_INSTRUMENTS, buildTradingLightScannerInputs } from "@/lib/trading/lightScanner";

type VerificationStatus = "confirmed" | "caution" | "unavailable";
type VerificationSourceKind = "provider" | "site";

export type TradingExternalVerificationCheck = {
  source: string;
  kind: VerificationSourceKind;
  price: number | null;
  fetchedAt: string | null;
  deltaAbs: number | null;
  deltaBps: number | null;
  matchesInternal: boolean | null;
  note?: string | null;
  url?: string | null;
};

export type TradingExternalVerificationResult = {
  instrument: string;
  status: VerificationStatus;
  summary: string;
  internalPrice: number | null;
  internalSnapshotAt: string | null;
  toleranceBps: number;
  checks: TradingExternalVerificationCheck[];
  links: Array<{ label: string; url: string }>;
};

type ExternalReferenceConfig = {
  instrument: string;
  investingUrl?: string;
  tradingViewUrl?: string;
};

const EXTERNAL_REFERENCE_CONFIGS: ExternalReferenceConfig[] = [
  { instrument: "EURUSD", investingUrl: "https://www.investing.com/currencies/eur-usd", tradingViewUrl: "https://www.tradingview.com/symbols/EURUSD/" },
  { instrument: "GBPUSD", investingUrl: "https://www.investing.com/currencies/gbp-usd", tradingViewUrl: "https://www.tradingview.com/symbols/GBPUSD/" },
  { instrument: "USDJPY", investingUrl: "https://www.investing.com/currencies/usd-jpy", tradingViewUrl: "https://www.tradingview.com/symbols/USDJPY/" },
  { instrument: "AUDUSD", investingUrl: "https://www.investing.com/currencies/aud-usd", tradingViewUrl: "https://www.tradingview.com/symbols/AUDUSD/" },
  { instrument: "USDCHF", investingUrl: "https://www.investing.com/currencies/usd-chf", tradingViewUrl: "https://www.tradingview.com/symbols/USDCHF/" },
  { instrument: "NZDUSD", investingUrl: "https://www.investing.com/currencies/nzd-usd", tradingViewUrl: "https://www.tradingview.com/symbols/NZDUSD/" },
  { instrument: "AUDJPY", investingUrl: "https://www.investing.com/currencies/aud-jpy", tradingViewUrl: "https://www.tradingview.com/symbols/AUDJPY/" },
  { instrument: "EURJPY", investingUrl: "https://www.investing.com/currencies/eur-jpy", tradingViewUrl: "https://www.tradingview.com/symbols/EURJPY/" },
  { instrument: "EURGBP", investingUrl: "https://www.investing.com/currencies/eur-gbp", tradingViewUrl: "https://www.tradingview.com/symbols/EURGBP/" },
  { instrument: "USDCAD", investingUrl: "https://www.investing.com/currencies/usd-cad", tradingViewUrl: "https://www.tradingview.com/symbols/USDCAD/" },
  { instrument: "GBPJPY", investingUrl: "https://www.investing.com/currencies/gbp-jpy", tradingViewUrl: "https://www.tradingview.com/symbols/GBPJPY/" },
  { instrument: "EURCHF", investingUrl: "https://www.investing.com/currencies/eur-chf", tradingViewUrl: "https://www.tradingview.com/symbols/EURCHF/" },
  { instrument: "NZDJPY", investingUrl: "https://www.investing.com/currencies/nzd-jpy", tradingViewUrl: "https://www.tradingview.com/symbols/NZDJPY/" },
  { instrument: "XAUUSD", investingUrl: "https://www.investing.com/currencies/xau-usd", tradingViewUrl: "https://www.tradingview.com/symbols/XAUUSD/" },
  { instrument: "XAGUSD", investingUrl: "https://www.investing.com/currencies/xag-usd", tradingViewUrl: "https://www.tradingview.com/symbols/XAGUSD/" },
  { instrument: "BTCUSD", investingUrl: "https://www.investing.com/crypto/bitcoin/btc-usd", tradingViewUrl: "https://www.tradingview.com/symbols/BTCUSD/" },
  { instrument: "ETHUSD", investingUrl: "https://www.investing.com/crypto/ethereum/eth-usd", tradingViewUrl: "https://www.tradingview.com/symbols/ETHUSD/" },
  { instrument: "NAS100", tradingViewUrl: "https://www.tradingview.com/symbols/NAS100USD/" },
  { instrument: "US500", tradingViewUrl: "https://www.tradingview.com/symbols/SPX/" },
];

function resolveReferenceConfig(instrument: string) {
  return EXTERNAL_REFERENCE_CONFIGS.find(
    (config) => config.instrument === instrument.trim().toUpperCase(),
  ) ?? { instrument };
}

function resolveToleranceBps(instrument: string) {
  if (["BTCUSD", "ETHUSD"].includes(instrument)) {
    return 80;
  }

  if (["NAS100", "US500"].includes(instrument)) {
    return 40;
  }

  return 25;
}

function supportsFinnhubQuote(symbol: string) {
  return inferAssetKind(symbol) === "equity";
}

function resolveVerificationDataSymbol(config: {
  dataSymbol: string;
  dataSymbols?: Array<{ symbol: string; relation: "direct" | "proxy" }>;
}) {
  const direct =
    config.dataSymbols?.find((candidate) => candidate.relation === "direct")?.symbol ?? null;

  return direct ?? config.dataSymbols?.[0]?.symbol ?? config.dataSymbol;
}

function roundNullable(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000000) / 1000000;
}

type TradingExternalVerificationSummary = {
  status: VerificationStatus;
  matchedChecks: TradingExternalVerificationCheck[];
  availableChecks: TradingExternalVerificationCheck[];
  summary: string;
};

function buildCheck(args: {
  source: string;
  kind: VerificationSourceKind;
  price: number | null;
  fetchedAt: string | null;
  internalPrice: number | null;
  toleranceBps: number;
  note?: string | null;
  url?: string | null;
}): TradingExternalVerificationCheck {
  const { price, internalPrice } = args;

  if (price == null || internalPrice == null || internalPrice === 0) {
    return {
      source: args.source,
      kind: args.kind,
      price,
      fetchedAt: args.fetchedAt,
      deltaAbs: null,
      deltaBps: null,
      matchesInternal: null,
      note: args.note ?? null,
      url: args.url ?? null,
    };
  }

  const deltaAbs = Math.abs(price - internalPrice);
  const deltaBps = (deltaAbs / Math.abs(internalPrice)) * 10_000;

  return {
    source: args.source,
    kind: args.kind,
    price: roundNullable(price),
    fetchedAt: args.fetchedAt,
    deltaAbs: roundNullable(deltaAbs),
    deltaBps: roundNullable(deltaBps),
    matchesInternal: deltaBps <= args.toleranceBps,
    note: args.note ?? null,
    url: args.url ?? null,
  };
}

export function extractInvestingPriceFromHtml(html: string): number | null {
  const match = html.match(/data-test="instrument-price-last"[^>]*>([^<]+)</i);

  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].replace(/,/g, "").trim();
  const price = Number(normalized);

  return Number.isFinite(price) ? price : null;
}

export function extractTradingViewPriceFromHtml(html: string): number | null {
  const tradePriceMatch = html.match(/"trade"\s*:\s*\{\s*"price"\s*:\s*(\d+(?:\.\d+)?)\s*\}/i);

  if (tradePriceMatch?.[1]) {
    const price = Number(tradePriceMatch[1]);
    if (Number.isFinite(price)) {
      return price;
    }
  }

  const dailyCloseMatch = html.match(
    /"daily_bar"\s*:\s*\{\s*"close"\s*:\s*"(\d+(?:\.\d+)?)"/i,
  );

  if (dailyCloseMatch?.[1]) {
    const price = Number(dailyCloseMatch[1]);
    if (Number.isFinite(price)) {
      return price;
    }
  }

  return null;
}

async function fetchInvestingPrice(url: string): Promise<number | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Investing fetch failed (${response.status})`);
  }

  return extractInvestingPriceFromHtml(await response.text());
}

async function fetchTradingViewPrice(url: string): Promise<number | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`TradingView fetch failed (${response.status})`);
  }

  return extractTradingViewPriceFromHtml(await response.text());
}

function resolveInternalPrice(timeframes: TradingTimeframeMap<NormalizedCandle[]>) {
  for (const timeframe of ["5m", "15m", "1h", "4h", "1d"]) {
    const candles = timeframes[timeframe];
    const latest = candles?.[candles.length - 1];

    if (latest && Number.isFinite(latest.close)) {
      return latest.close;
    }
  }

  return null;
}

export function resolveTradingExternalVerificationSummary(
  checks: TradingExternalVerificationCheck[],
): TradingExternalVerificationSummary {
  const providerChecks = checks.filter(
    (check) => check.kind === "provider" && check.price != null,
  );
  const siteChecks = checks.filter(
    (check) => check.kind === "site" && check.price != null,
  );
  const matchedProviderChecks = providerChecks.filter(
    (check) => check.matchesInternal === true,
  );
  const matchedSiteChecks = siteChecks.filter(
    (check) => check.matchesInternal === true,
  );
  const matchedChecks = checks.filter((check) => check.matchesInternal === true);
  const availableChecks = checks.filter((check) => check.price != null);
  const status: VerificationStatus =
    availableChecks.length === 0
      ? "unavailable"
      : matchedProviderChecks.length > 0
        ? "confirmed"
        : "caution";
  const matchedProviderSources = matchedProviderChecks
    .map((check) => check.source)
    .join(", ");
  const summary =
    status === "confirmed"
      ? `Syntrake is aligned with ${matchedProviderSources || "at least one provider reference"} right now.`
      : status === "caution"
        ? matchedSiteChecks.length > 0 && providerChecks.length === 0
          ? "Only public site checks were close to the Syntrake snapshot. Treat this as a soft cross-check, not execution confirmation."
          : providerChecks.length > 0
            ? "Provider references are available, but they are not close enough to the Syntrake snapshot yet."
            : "Only public site references were available. Treat this as a soft cross-check, not execution confirmation."
        : "No external reference was available to verify this trade in real time.";

  return {
    status,
    matchedChecks,
    availableChecks,
    summary,
  };
}

export async function verifyTradingInstrumentExternally(
  instrument: string,
): Promise<TradingExternalVerificationResult> {
  const normalizedInstrument = instrument.trim().toUpperCase();
  const config =
    TRADING_LIGHT_SCANNER_INSTRUMENTS.find((item) => item.instrument === normalizedInstrument) ?? null;
  const verificationSymbol = config ? resolveVerificationDataSymbol(config) : normalizedInstrument;
  const referenceConfig = resolveReferenceConfig(normalizedInstrument);
  const toleranceBps = resolveToleranceBps(normalizedInstrument);
  const links = [
    referenceConfig.tradingViewUrl
      ? { label: "TradingView", url: referenceConfig.tradingViewUrl }
      : null,
    referenceConfig.investingUrl
      ? { label: "Investing.com", url: referenceConfig.investingUrl }
      : null,
  ].filter((item): item is { label: string; url: string } => Boolean(item));

  if (!config) {
    return {
      instrument: normalizedInstrument,
      status: "unavailable",
      summary: "Instrument is not wired into the live trading scanner yet.",
      internalPrice: null,
      internalSnapshotAt: null,
      toleranceBps,
      checks: [],
      links,
    };
  }

  const [scannerInput] = await buildTradingLightScannerInputs({
    asOf: new Date().toISOString(),
    instruments: [config],
    forceRefresh: true,
  });
  const internalPrice = scannerInput ? resolveInternalPrice(scannerInput.snapshot.timeframes) : null;
  const internalSnapshotAt = scannerInput?.snapshot.snapshotAt ?? null;
  const checks = (
    await Promise.all([
      (async () => {
        try {
          const quote = await tdQuoteNormalized(verificationSymbol);
          return buildCheck({
            source: "Twelve Data",
            kind: "provider",
            price: quote.price,
            fetchedAt: quote.timestamp
              ? new Date(quote.timestamp).toISOString()
              : new Date().toISOString(),
            internalPrice,
            toleranceBps,
            note: "Provider quote cross-check.",
          });
        } catch (error) {
          return buildCheck({
            source: "Twelve Data",
            kind: "provider",
            price: null,
            fetchedAt: null,
            internalPrice,
            toleranceBps,
            note: error instanceof Error ? error.message : "Twelve Data unavailable.",
          });
        }
      })(),
      (async () => {
        if (!supportsFinnhubQuote(verificationSymbol)) {
          return buildCheck({
            source: "Finnhub",
            kind: "provider",
            price: null,
            fetchedAt: null,
            internalPrice,
            toleranceBps,
            note: "Finnhub quote is only used for supported equity/index references.",
          });
        }

        try {
          const quote = await finnhubQuote(verificationSymbol);
          if (!Number.isFinite(quote.price) || quote.price <= 0) {
            throw new Error("Finnhub returned a non-positive quote.");
          }

          return buildCheck({
            source: "Finnhub",
            kind: "provider",
            price: quote.price,
            fetchedAt: quote.timestamp
              ? new Date(quote.timestamp).toISOString()
              : new Date().toISOString(),
            internalPrice,
            toleranceBps,
            note: "Secondary provider quote cross-check.",
          });
        } catch (error) {
          return buildCheck({
            source: "Finnhub",
            kind: "provider",
            price: null,
            fetchedAt: null,
            internalPrice,
            toleranceBps,
            note: error instanceof Error ? error.message : "Finnhub unavailable for this instrument.",
          });
        }
      })(),
      referenceConfig.investingUrl
        ? (async () => {
            try {
              const price = await fetchInvestingPrice(referenceConfig.investingUrl!);
              return buildCheck({
                source: "Investing.com",
                kind: "site",
                price,
                fetchedAt: new Date().toISOString(),
                internalPrice,
                toleranceBps,
                note: "Public site price cross-check.",
                url: referenceConfig.investingUrl,
              });
            } catch (error) {
              return buildCheck({
                source: "Investing.com",
                kind: "site",
                price: null,
                fetchedAt: null,
                internalPrice,
                toleranceBps,
                note: error instanceof Error ? error.message : "Investing.com unavailable.",
                url: referenceConfig.investingUrl,
              });
            }
          })()
        : Promise.resolve<TradingExternalVerificationCheck | null>(null),
      referenceConfig.tradingViewUrl
        ? (async () => {
            try {
              const price = await fetchTradingViewPrice(referenceConfig.tradingViewUrl!);
              return buildCheck({
                source: "TradingView",
                kind: "site",
                price,
                fetchedAt: new Date().toISOString(),
                internalPrice,
                toleranceBps,
                note: "Public chart page cross-check.",
                url: referenceConfig.tradingViewUrl,
              });
            } catch (error) {
              return buildCheck({
                source: "TradingView",
                kind: "site",
                price: null,
                fetchedAt: null,
                internalPrice,
                toleranceBps,
                note: error instanceof Error ? error.message : "TradingView unavailable.",
                url: referenceConfig.tradingViewUrl,
              });
            }
          })()
        : Promise.resolve<TradingExternalVerificationCheck | null>(null),
    ])
  ).filter((check): check is TradingExternalVerificationCheck => Boolean(check));
  const summaryState = resolveTradingExternalVerificationSummary(checks);

  return {
    instrument: normalizedInstrument,
    status: summaryState.status,
    summary: summaryState.summary,
    internalPrice: roundNullable(internalPrice),
    internalSnapshotAt,
    toleranceBps,
    checks,
    links,
  };
}
