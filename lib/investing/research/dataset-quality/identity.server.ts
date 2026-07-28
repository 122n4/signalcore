import "server-only";

import { createHash } from "node:crypto";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import type { DatasetQualityReportMaterial } from "./types";
import { DATASET_QUALITY_HASH_DOMAIN } from "./versions";

type IdentityResult =
  | Readonly<{ ok: true; value: Readonly<{ reportHash: string; qualityReportId: string; canonicalMaterial: string }> }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ path: string; reasonCode: string }>[] }>;

export function deriveDatasetQualityReportIdentity(material: DatasetQualityReportMaterial): IdentityResult {
  const canonical = canonicalizeResearchContract(material);
  if ("issues" in canonical) return { ok: false, issues: canonical.issues };
  const reportHash = createHash("sha256").update(`${DATASET_QUALITY_HASH_DOMAIN}\n${canonical.value}`, "utf8").digest("hex");
  return { ok: true as const, value: { reportHash, qualityReportId: `irqrep_v1_${reportHash}`, canonicalMaterial: canonical.value } };
}
