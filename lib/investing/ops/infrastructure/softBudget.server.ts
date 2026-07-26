import "server-only";

import { performance } from "node:perf_hooks";

export type InvestingOpsSoftBudgetV1 = Readonly<{
  remainingMs(): number;
  expired(): boolean;
}>;

export function createInvestingOpsSoftBudgetV1(
  budgetMs: number,
  nowMs: () => number = () => performance.now(),
): InvestingOpsSoftBudgetV1 {
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) {
    throw new Error("investing_ops_budget_invalid");
  }
  const expiresAt = nowMs() + budgetMs;
  const remainingMs = () => Math.max(0, Math.ceil(expiresAt - nowMs()));
  return {
    remainingMs,
    expired: () => remainingMs() === 0,
  };
}
