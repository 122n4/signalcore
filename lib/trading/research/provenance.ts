import { DEFAULT_RESEARCH_CONFIG_PATH } from "./config";
import { ensureResearchBaselineSnapshot } from "./baseline";
import { buildResearchDatasetCatalog, toResearchDatasetReference } from "./sourceCatalog";
import type { ResearchConfig, ResearchReportProvenance } from "./types";

export async function buildResearchReportProvenance(args: {
  config: ResearchConfig;
  upstreamReportIds?: string[];
}): Promise<ResearchReportProvenance> {
  const { config } = args;
  const baseline = await ensureResearchBaselineSnapshot(config);
  const datasets = await buildResearchDatasetCatalog(config);

  return {
    owner: "research_lab",
    config_path: DEFAULT_RESEARCH_CONFIG_PATH,
    live_baseline_id: config.liveBaselineSource.baselineId ?? null,
    dataset_manifest_hash: baseline.manifest.dataset_manifest_hash,
    engine_manifest_hash: baseline.manifest.engine_manifest_hash,
    dataset_refs: datasets.map(toResearchDatasetReference),
    upstream_report_ids: [...new Set((args.upstreamReportIds ?? []).filter((value) => value.trim().length > 0))],
  };
}
