import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";

import {
  buildTradingLightScannerInputs,
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { getTwelveDataApiKeys, getTwelveDataKeyPoolStatus } from "@/lib/market/providers/twelvedataKeyPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function probeProvider(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      bodySnippet: text.slice(0, 280),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      bodySnippet: error?.message ?? "probe_failed",
    };
  }
}

function buildFinnhubProbeUrl(token: string) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 2 * 5 * 60;

  return `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:EUR_USD&resolution=5&from=${from}&to=${to}&token=${encodeURIComponent(
    token,
  )}`;
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId || (!isOwnerUserId(userId) && !isLocalQaUserId(userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const forceProviderRefresh = url.searchParams.get("force") === "1";
  const asOf = new Date().toISOString();
  const [inputs, diagnostics] = await Promise.all([
    buildTradingLightScannerInputs({
      asOf,
      forceRefresh: true,
      includeInactiveMarkets: true,
    }),
    inspectTradingLightScanner({ asOf, forceProviderRefresh }),
  ]);
  const summary = summarizeTradingLightScannerDiagnostics(diagnostics);

  const twelvedataKeys = getTwelveDataApiKeys();
  const twelvedataKeyPool = getTwelveDataKeyPoolStatus();
  const finnhubKey = String(process.env.FINNHUB_API_KEY || "").trim();
  const fmpKey = String(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || "").trim();
  const alphaVantageKey = String(process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || "").trim();

  const twelvedataProbe = twelvedataKeys[0]
    ? await probeProvider(
        `https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=5min&outputsize=2&apikey=${encodeURIComponent(
          twelvedataKeys[0],
        )}`,
      )
    : {
        ok: false,
        status: 0,
        bodySnippet: "missing_twelvedata_api_key",
      };

  const finnhubProbe = finnhubKey
    ? await probeProvider(
        buildFinnhubProbeUrl(finnhubKey),
      )
    : {
        ok: false,
        status: 0,
        bodySnippet: "missing_finnhub_api_key",
      };

  return NextResponse.json({
    ok: true,
    asOf,
    env: {
      hasTwelveDataKey: twelvedataKeys.length > 0,
      twelveDataKeyCount: twelvedataKeyPool.configuredCount,
      twelveDataActiveKeyCount: twelvedataKeyPool.activeCount,
      twelveDataCooldownKeyCount: twelvedataKeyPool.cooldownCount,
      hasFinnhubKey: finnhubKey.length > 0,
      finnhubKeyLength: finnhubKey.length,
      hasFmpKey: fmpKey.length > 0,
      fmpKeyLength: fmpKey.length,
      hasAlphaVantageKey: alphaVantageKey.length > 0,
      alphaVantageKeyLength: alphaVantageKey.length,
      hasKrakenPublicProvider: true,
    },
    probes: {
      twelvedata: twelvedataProbe,
      finnhub: finnhubProbe,
    },
    summary,
    inputCount: inputs.length,
    activeInstruments: inputs.map((input) => input.snapshot.instrument),
    diagnostics,
  });
}
