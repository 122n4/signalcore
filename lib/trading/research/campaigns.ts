import type {
  ResearchCampaignDefinition,
  ResearchCampaignLibrary,
  ResearchCampaignObjective,
  ResearchConfig,
} from "./types";
import { readJsonIfExists } from "./fs";

const CAMPAIGN_OBJECTIVES = new Set<ResearchCampaignObjective>([
  "increase_expectancy",
  "improve_crisis",
  "recover_frequency",
  "reduce_drawdown",
]);

export function assertValidResearchCampaignLibrary(
  input: unknown,
): asserts input is ResearchCampaignLibrary {
  if (!input || typeof input !== "object") {
    throw new Error("Campaign library must be an object.");
  }

  const library = input as ResearchCampaignLibrary;
  if (library.version !== 1) {
    throw new Error(`Unsupported campaign library version '${String(library.version)}'.`);
  }
  if (!Array.isArray(library.campaigns)) {
    throw new Error("Campaign library campaigns must be an array.");
  }

  for (const campaign of library.campaigns) {
    if (!campaign || typeof campaign !== "object") {
      throw new Error("Campaign definition must be an object.");
    }
    if (typeof campaign.id !== "string" || campaign.id.trim().length === 0) {
      throw new Error("Campaign definition is missing id.");
    }
    if (typeof campaign.enabled !== "boolean") {
      throw new Error(`Campaign '${campaign.id}' is missing enabled.`);
    }
    if (!CAMPAIGN_OBJECTIVES.has(campaign.objective)) {
      throw new Error(`Campaign '${campaign.id}' has unsupported objective '${String(campaign.objective)}'.`);
    }
    if (typeof campaign.priority !== "number") {
      throw new Error(`Campaign '${campaign.id}' is missing numeric priority.`);
    }
  }
}

export async function readResearchCampaignLibrary(
  config: ResearchConfig,
): Promise<ResearchCampaignLibrary> {
  const targetPath = config.paths.campaignLibraryPath;
  if (!targetPath) {
    return {
      version: 1,
      campaigns: [],
    };
  }

  const library =
    (await readJsonIfExists<ResearchCampaignLibrary>(targetPath)) ?? {
      version: 1,
      campaigns: [],
    };
  assertValidResearchCampaignLibrary(library);
  return library;
}

export function buildResearchCampaignMap(
  library: ResearchCampaignLibrary,
): Map<string, ResearchCampaignDefinition> {
  return new Map(library.campaigns.map((campaign) => [campaign.id, campaign] as const));
}
