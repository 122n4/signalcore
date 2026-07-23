import type { InvestingExecutionEnvironment, InvestingOrderRequest } from "@/lib/investing/broker/types";
import { addMoney, compareMoney, subtractMoney } from "@/lib/investing/money/decimal";
import type { InvestingInstrument, MandatePolicy } from "@/lib/investing/types";

export type InvestingControlEvaluation = {
  controlName: string;
  passed: boolean;
  observedValue: string;
  limitValue: string;
  reason: string;
  evaluatedAt: string;
  engineVersion: string;
};

export function evaluateInvestingPreTradeControls(args: {
  request: InvestingOrderRequest;
  mandate: MandatePolicy;
  instruments: InvestingInstrument[];
  cashAvailable: string;
  reservedCash: string;
  dailySubmittedNotional: string;
  dailyOrderCount: number;
  environment: InvestingExecutionEnvironment;
  killSwitchActive: boolean;
  maxOrderNotional: string;
  maxDailyNotional: string;
  maxDailyOrders: number;
  freshnessSeconds: number;
  reconciliationStatus: "passed" | "warning" | "failed";
  engineVersion?: string;
}): InvestingControlEvaluation[] {
  const now = new Date().toISOString();
  const version = args.engineVersion ?? "investing_v1";
  const instrument = args.instruments.find((entry) => entry.symbol.toUpperCase() === args.request.symbol.toUpperCase());
  const notional = args.request.notional ?? "0.00";
  const environmentAllowed = args.environment !== "live" && args.request.environment !== "live" && args.environment === args.request.environment;
  const spendableCash = subtractMoney(args.cashAvailable, args.reservedCash, 2);
  const submittedAfterOrder = addMoney(args.dailySubmittedNotional, notional, 2);
  const evaluations: InvestingControlEvaluation[] = [];
  const add = (controlName: string, passed: boolean, observedValue: string, limitValue: string, reason: string) => {
    evaluations.push({ controlName, passed, observedValue, limitValue, reason, evaluatedAt: now, engineVersion: version });
  };

  add("environment_allowed", environmentAllowed, `${args.environment}:${args.request.environment}`, "simulation|paper:same", environmentAllowed ? "environment_allowed" : "live_or_environment_mismatch_blocked");
  add("kill_switch", !args.killSwitchActive, String(args.killSwitchActive), "false", args.killSwitchActive ? "kill_switch_active" : "kill_switch_clear");
  add("instrument_approved", Boolean(instrument && instrument.qualityStatus === "approved" && instrument.enabled !== false), args.request.symbol, "approved", "instrument_mandate_status");
  add("currency_approved", args.request.currency === args.mandate.baseCurrency, args.request.currency, args.mandate.baseCurrency, "currency_policy");
  add("cash_available", compareMoney(spendableCash, notional, 2) >= 0, spendableCash, notional, "available_cash_after_reservations_check");
  add("cash_reserved", compareMoney(args.reservedCash, args.cashAvailable, 2) <= 0, args.reservedCash, args.cashAvailable, "reserved_cash_check");
  add("max_order_notional", compareMoney(notional, args.maxOrderNotional, 2) <= 0, notional, args.maxOrderNotional, "order_size_limit");
  add("max_daily_notional", compareMoney(submittedAfterOrder, args.maxDailyNotional, 2) <= 0, submittedAfterOrder, args.maxDailyNotional, "daily_size_limit_after_order");
  add("max_daily_orders", args.dailyOrderCount < args.maxDailyOrders, String(args.dailyOrderCount), String(args.maxDailyOrders), "daily_order_count_limit");
  add("freshness", args.freshnessSeconds <= 900, String(args.freshnessSeconds), "900", "market_data_freshness");
  add("reconciliation_quality", args.reconciliationStatus === "passed", args.reconciliationStatus, "passed", "reconciliation_gate");

  return evaluations;
}

export function assertInvestingControlsPassed(evaluations: InvestingControlEvaluation[]) {
  const failed = evaluations.filter((entry) => !entry.passed);
  if (failed.length) {
    throw new Error(`investing_controls_blocked:${failed.map((entry) => entry.controlName).join(",")}`);
  }
}
