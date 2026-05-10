import type { EngineContext, LoopStage } from "./types";

export function computeLoopStage(ctx: EngineContext): LoopStage {
  if (!ctx?.setupComplete || !ctx?.plan?.hasPlan) return "DAY0_SETUP";

  const doneToday = !!ctx?.dayState?.doneToday;
  const receiptsCount = Math.max(0, Math.round(Number(ctx?.dayState?.receiptsCount || 0)));

  if (!doneToday && receiptsCount === 0) return "DAY0_EXECUTE";
  if (receiptsCount <= 1) return "DAY1_NBA";
  return "DAY2PLUS_NBA";
}
