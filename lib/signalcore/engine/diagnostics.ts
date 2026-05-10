// lib/signalcore/engine/diagnostics.ts
import type { AutopilotMode } from "@/lib/signalcore/modes";
import type { Diagnostic } from "./types";
import { safeNumber } from "./utils";

export function runDiagnostics(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  holdings: Array<{ symbol: string; valueEur?: number | null }>;
  cashEur?: number | null;
}): Diagnostic[] {
  const diags: Diagnostic[] = [];

  if (!args.hasPlan) {
    diags.push({
      key: "plan_missing",
      title: "Plan missing",
      detail: "Safety Brain cannot enforce limits until your plan is active.",
      tone: "danger",
      severity: 3,
    });
  }

  const hasHoldings = (args.holdings?.length ?? 0) > 0;

  if (args.hasPlan && !hasHoldings) {
    diags.push({
      key: "holdings_missing",
      title: "Holdings missing",
      detail: "No drift, no concentration checks, no candidates until holdings exist.",
      tone: "warn",
      severity: 2,
    });
  }

  // Concentration heuristic (no market data needed)
  if (hasHoldings && args.holdings.length <= 2) {
    diags.push({
      key: "concentration",
      title: "High concentration",
      detail: `Only ${args.holdings.length} holdings. This increases drawdown risk.`,
      tone: "warn",
      severity: 2,
    });
  }

  // Missing values heuristic (helps portfolio feel “alive”)
  const missingValues = args.holdings.filter((h) => safeNumber(h.valueEur, null) === null);
  if (hasHoldings && missingValues.length > 0) {
    diags.push({
      key: "missing_values",
      title: "Missing position values",
      detail: `${missingValues.length} holdings have no EUR value. Confirmed Money will be limited.`,
      tone: "neutral",
      severity: 1,
    });
  }

  // Cash drag heuristic
  const cash = safeNumber(args.cashEur, 0) || 0;
  if (hasHoldings && cash > 0) {
    diags.push({
      key: "cash_drag",
      title: "Cash drag detected",
      detail: `You have €${Math.round(cash)} idle cash. Long-term compounding may be slowed.`,
      tone: "neutral",
      severity: 1,
    });
  }

  if (args.hasPlan && hasHoldings && diags.length === 0) {
    diags.push({
      key: "setup_ok",
      title: "Setup clean",
      detail: "No obvious risk leaks detected by the baseline engine.",
      tone: "good",
      severity: 1,
    });
  }

  return diags;
}
