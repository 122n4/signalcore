// lib/signalcore/dailyBundle.ts
import type { PlanLike, PortfolioSnapshot, DailyBundle } from "./types";
import { buildDailyBundle as impl } from "./dailyBundle.brain";

export async function buildDailyBundle(input: { portfolio: PortfolioSnapshot; plan: PlanLike }): Promise<DailyBundle> {
  return impl(input);
}