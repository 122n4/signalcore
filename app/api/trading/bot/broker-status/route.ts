import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { isAlpacaBrokerConfigured } from "@/lib/trading/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBotOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

function hasEnv(name: string) {
  return String(process.env[name] || "").trim().length > 0;
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isBotOperator(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const paperBroker = process.env.SYNTRAKE_BOT_PAPER_BROKER === "alpaca" ? "alpaca" : "syntrake_paper";
  const alpacaPaperConfigured = isAlpacaBrokerConfigured("paper");
  const alpacaLiveConfigured = isAlpacaBrokerConfigured("live");
  const alphaVantageConfigured = hasEnv("ALPHAVANTAGE_API_KEY") || hasEnv("ALPHA_VANTAGE_API_KEY");

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      marketData: {
        alphaVantageConfigured,
      },
      paper: {
        activeBroker: paperBroker,
        alpacaConfigured: alpacaPaperConfigured,
        operational:
          paperBroker === "syntrake_paper" ||
          (paperBroker === "alpaca" && alpacaPaperConfigured),
        message:
          paperBroker === "alpaca"
            ? alpacaPaperConfigured
              ? "Alpaca paper broker is configured for bot paper cycles."
              : "SYNTRAKE_BOT_PAPER_BROKER is alpaca, but Alpaca paper credentials are missing."
            : "Internal Syntrake paper broker is active. No real broker order is sent.",
      },
      live: {
        alpacaConfigured: alpacaLiveConfigured,
        armedByEnvironment: process.env.SYNTRAKE_BOT_LIVE_BROKER === "alpaca" && alpacaLiveConfigured,
        message: alpacaLiveConfigured
          ? "Alpaca live credentials exist, but Syntrake still requires explicit UI arming before live policy."
          : "Alpaca live credentials are not configured.",
      },
      requiredEnv: {
        paper: ["SYNTRAKE_BOT_PAPER_BROKER=alpaca", "ALPACA_PAPER_API_KEY_ID", "ALPACA_PAPER_API_SECRET_KEY"],
        live: ["SYNTRAKE_BOT_LIVE_BROKER=alpaca", "ALPACA_LIVE_API_KEY_ID", "ALPACA_LIVE_API_SECRET_KEY"],
        marketData: ["ALPHAVANTAGE_API_KEY"],
      },
      links: {
        alpacaLogin: "https://app.alpaca.markets/login",
        alpacaPaper: "https://app.alpaca.markets/paper/dashboard/overview",
        brokerSetup: "/app/broker",
        researchLab: "/ops/lab",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
