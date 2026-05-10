import type { ExecutionPlanningInput, EntryZoneOutput } from "./types";
import { resolveRiskDistance, roundLevel, sortEntryZone } from "./utils";

function buildOutput(
  triggerType: EntryZoneOutput["triggerType"],
  triggerLevel: number | null,
  entryZoneLow: number | null,
  entryZoneHigh: number | null,
): EntryZoneOutput {
  const sorted = sortEntryZone(entryZoneLow, entryZoneHigh);

  return {
    triggerType,
    triggerLevel: roundLevel(triggerLevel),
    entryZoneLow: sorted.entryZoneLow,
    entryZoneHigh: sorted.entryZoneHigh,
  };
}

export function buildEntryZone(input: ExecutionPlanningInput): EntryZoneOutput {
  const { setup } = input.setupCore;

  if (setup.type === "none") {
    return buildOutput("close_confirm", null, null, null);
  }

  const triggerLevel = setup.triggerLevel ?? null;
  const invalidationLevel = setup.invalidationLevel ?? null;
  const riskDistance = resolveRiskDistance(triggerLevel, invalidationLevel) ?? 0;

  switch (setup.type) {
    case "breakout_continuation": {
      const triggerType =
        input.market.volatility.state === "expansion" ||
        input.market.volatility.state === "spike"
          ? "close_confirm"
          : "break";
      const zoneLow = setup.direction === "long" ? triggerLevel : triggerLevel - riskDistance * 0.15;
      const zoneHigh = setup.direction === "long" ? triggerLevel + riskDistance * 0.15 : triggerLevel;

      return buildOutput(triggerType, triggerLevel, zoneLow, zoneHigh);
    }
    case "trend_pullback": {
      const zoneLow = setup.direction === "long" ? triggerLevel - riskDistance * 0.18 : triggerLevel;
      const zoneHigh = setup.direction === "long" ? triggerLevel + riskDistance * 0.04 : triggerLevel + riskDistance * 0.18;

      return buildOutput("touch", triggerLevel, zoneLow, zoneHigh);
    }
    case "liquidity_sweep_reversal":
    case "range_reclaim": {
      const zoneLow = setup.direction === "long" ? triggerLevel - riskDistance * 0.08 : triggerLevel;
      const zoneHigh = setup.direction === "long" ? triggerLevel + riskDistance * 0.05 : triggerLevel + riskDistance * 0.08;

      return buildOutput("reclaim", triggerLevel, zoneLow, zoneHigh);
    }
    case "failed_breakout": {
      const zoneLow = triggerLevel - riskDistance * 0.05;
      const zoneHigh = triggerLevel + riskDistance * 0.05;

      return buildOutput("close_confirm", triggerLevel, zoneLow, zoneHigh);
    }
  }
}
