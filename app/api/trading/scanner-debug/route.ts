import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";

import {
  buildTradingLightScannerInputs,
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";

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

  const twelvedataKey = String(process.env.TWELVEDATA_API_KEY || "").trim();
  const finnhubKey = String(process.env.FINNHUB_API_KEY || "").trim();

  const twelvedataProbe = twelvedataKey
    ? await probeProvider(
        `https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=5min&outputsize=2&apikey=${encodeURIComponent(
          twelvedataKey,
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
      hasTwelveDataKey: twelvedataKey.length > 0,
      twelveDataKeyLength: twelvedataKey.length,
      hasFinnhubKey: finnhubKey.length > 0,
      finnhubKeyLength: finnhubKey.length,
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
