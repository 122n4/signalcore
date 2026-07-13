import path from "node:path";

import { createTradingHistoricalYearPeriods } from "@/lib/trading/backtest/periods";

import { type ResearchConfig } from "./types";
import { readJsonFile } from "./fs";

export const DEFAULT_RESEARCH_CONFIG_PATH = path.resolve(
  "config/trading-research/research-config.json",
);

function resolveAutoYearlyPeriods(config: ResearchConfig): ResearchConfig["study"]["yearlyPeriods"] {
  const explicit = config.study.yearlyPeriods;
  const autoRange = config.study.yearlyPeriodAutoRange;

  if (!autoRange?.enabled) {
    return explicit ?? [];
  }

  const derivedTo =
    autoRange.deriveEndYearFrom === "final_holdout_to"
      ? config.study.robustness?.finalHoldout?.to
      : autoRange.deriveEndYearFrom === "holdout_to"
        ? config.study.robustness?.holdout?.to
        : config.study.walkForward.to;
  const endYear =
    Number.isFinite(autoRange.endYear)
      ? Math.floor(autoRange.endYear as number)
      : new Date(derivedTo).getUTCFullYear();

  if (!Number.isFinite(autoRange.startYear) || !Number.isFinite(endYear)) {
    return explicit ?? [];
  }

  return createTradingHistoricalYearPeriods({
    startYear: Math.floor(autoRange.startYear),
    endYear,
  });
}

export async function loadResearchConfig(
  targetPath = DEFAULT_RESEARCH_CONFIG_PATH,
): Promise<ResearchConfig> {
  const config = await readJsonFile<ResearchConfig>(targetPath);
  return {
    ...config,
    study: {
      ...config.study,
      yearlyPeriods: resolveAutoYearlyPeriods(config),
    },
  };
}
