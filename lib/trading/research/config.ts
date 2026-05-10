import path from "node:path";

import { type ResearchConfig } from "./types";
import { readJsonFile } from "./fs";

export const DEFAULT_RESEARCH_CONFIG_PATH = path.resolve(
  "config/trading-research/research-config.json",
);

export async function loadResearchConfig(
  targetPath = DEFAULT_RESEARCH_CONFIG_PATH,
): Promise<ResearchConfig> {
  return readJsonFile<ResearchConfig>(targetPath);
}
