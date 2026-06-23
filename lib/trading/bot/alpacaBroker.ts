import type { BotExecutionMode, BotOrderIntent, BrokerExecutionAdapter, BrokerExecutionResult } from "./types";

type AlpacaMode = Extract<BotExecutionMode, "paper" | "live">;

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function credentials(mode: AlpacaMode) {
  const keyId =
    mode === "paper"
      ? env("ALPACA_PAPER_API_KEY_ID") || env("ALPACA_API_KEY_ID")
      : env("ALPACA_LIVE_API_KEY_ID") || env("ALPACA_API_KEY_ID");
  const secret =
    mode === "paper"
      ? env("ALPACA_PAPER_API_SECRET_KEY") || env("ALPACA_API_SECRET_KEY")
      : env("ALPACA_LIVE_API_SECRET_KEY") || env("ALPACA_API_SECRET_KEY");
  const baseUrl =
    mode === "paper"
      ? env("ALPACA_PAPER_BASE_URL") || "https://paper-api.alpaca.markets"
      : env("ALPACA_LIVE_BASE_URL") || "https://api.alpaca.markets";

  return { keyId, secret, baseUrl };
}

function isCryptoPair(symbol: string) {
  const normalized = symbol.replace(/[^A-Z]/gi, "").toUpperCase();
  return ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD"].includes(normalized);
}

function normalizeSymbol(symbol: string) {
  const raw = symbol.trim().toUpperCase();
  if (raw.includes("/")) return raw;
  if (isCryptoPair(raw)) return `${raw.slice(0, -3)}/${raw.slice(-3)}`;
  return raw.replace(/[^A-Z0-9.-]/g, "");
}

function price(value: number) {
  return String(Math.round(value * 10000) / 10000);
}

function qty(value: number) {
  return String(Math.max(0, Math.floor(value * 100000) / 100000));
}

export function isAlpacaBrokerConfigured(mode: AlpacaMode = "paper") {
  const c = credentials(mode);
  return Boolean(c.keyId && c.secret);
}

export function createAlpacaBrokerAdapter(args: { mode: AlpacaMode }): BrokerExecutionAdapter {
  return {
    name: `alpaca_${args.mode}`,
    mode: args.mode,
    async submitBracketOrder(intent: BotOrderIntent): Promise<BrokerExecutionResult> {
      const c = credentials(args.mode);
      if (!c.keyId || !c.secret) {
        return {
          ok: false,
          status: "rejected",
          message: `Alpaca ${args.mode} credentials are not configured.`,
        };
      }

      const symbol = normalizeSymbol(intent.instrument);
      if (symbol.includes("/")) {
        return {
          ok: false,
          status: "rejected",
          message: "Syntrake bot only sends Alpaca bracket orders for equities. Crypto stays blocked until stop/target protection is broker-safe.",
        };
      }

      const body = {
        symbol,
        side: intent.side,
        type: "limit",
        time_in_force: intent.timeInForce,
        qty: qty(intent.quantity),
        limit_price: price(intent.estimatedEntry),
        order_class: "bracket",
        take_profit: {
          limit_price: price(intent.takeProfit),
        },
        stop_loss: {
          stop_price: price(intent.stopLoss),
        },
        client_order_id: intent.idempotencyKey.slice(0, 128),
      };

      const response = await fetch(`${c.baseUrl.replace(/\/$/, "")}/v2/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "APCA-API-KEY-ID": c.keyId,
          "APCA-API-SECRET-KEY": c.secret,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          status: "rejected",
          message: payload?.message || `Alpaca order rejected (${response.status}).`,
          raw: payload,
        };
      }

      return {
        ok: true,
        brokerOrderId: payload?.id ?? null,
        status: "accepted",
        message: `Alpaca ${args.mode} bracket order accepted.`,
        raw: payload,
      };
    },
  };
}
