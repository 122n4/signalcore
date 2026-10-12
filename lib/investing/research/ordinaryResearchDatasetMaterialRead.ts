import type { HashRefV1 } from "./canonical";
import { hashRefV1 } from "./canonical";
import { hashDatasetSeriesV1, type DatasetSeriesHashPayloadV1 } from "./executionMaterials";
import type { ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";

/**
 * RL-9C3B2B3: one audited code seam for ordinary Investing Research material
 * reads. This DOES NOT authorize the read or apply an embargo yet.
 *
 * Scientific hash identity is verified before invoking the provider. Both
 * Research and Validation writers call here. A later guarded resolver MUST
 * replace this direct delegation with server-owned mapping, persistent
 * tenant-scoped read admission, and a full read/registration concurrency gate.
 */
export async function loadOrdinaryResearchDatasetSeriesMaterialV1(
  provider: ResearchDatasetMaterialProviderV1,
  series: DatasetSeriesHashPayloadV1,
  rawSeriesRef: HashRefV1,
): Promise<Buffer | null> {
  const ref = hashRefV1(rawSeriesRef);
  if (ref.hashDomain !== "SYNTRAKE:DATASET_SERIES:V1" ||
      hashDatasetSeriesV1(series) !== ref.hashHex) {
    throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  }
  return provider.loadSeriesContent(ref);
}
