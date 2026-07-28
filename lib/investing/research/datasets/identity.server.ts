import "server-only";
import { MANIFEST_IDENTITY_DOMAIN } from "../reproducibility";
import { hashCanonicalResearchMaterial } from "../reproducibility/hashing.server";
import type { DatasetResult } from "./reasonCodes";
import { validateDatasetRequirementMaterial, validateDatasetVersionMaterial } from "./runtimeValidation";
import type { DatasetRequirementMaterial, DatasetVersionMaterial } from "./types";

export function deriveDatasetRequirementIdentity(input: unknown): DatasetResult<Readonly<{ requirementId: string; digest: string; canonicalMaterial: string; material: DatasetRequirementMaterial }>> {
  const parsed = validateDatasetRequirementMaterial(input);
  if ("issues" in parsed) return { ok: false, issues: parsed.issues };
  const hashed = hashCanonicalResearchMaterial(MANIFEST_IDENTITY_DOMAIN, parsed.value);
  if (!hashed.ok) return { ok: false, issues: [{ path: "requirement.identity", reasonCode: "dataset_requirement_invalid" }] };
  return { ok: true, value: { requirementId: `irdsreq_v1_${hashed.value.digest}`, digest: hashed.value.digest, canonicalMaterial: hashed.value.canonicalMaterial, material: parsed.value } };
}

export function deriveDatasetVersionIdentity(input: unknown): DatasetResult<Readonly<{ datasetVersionId: string; manifestHash: string; canonicalMaterial: string; material: DatasetVersionMaterial }>> {
  const parsed = validateDatasetVersionMaterial(input);
  if ("issues" in parsed) return { ok: false, issues: parsed.issues };
  const hashed = hashCanonicalResearchMaterial(MANIFEST_IDENTITY_DOMAIN, parsed.value);
  if (!hashed.ok) return { ok: false, issues: [{ path: "datasetVersion.identity", reasonCode: "dataset_payload_invalid" }] };
  return { ok: true, value: { datasetVersionId: `irdsv_v1_${hashed.value.digest}`, manifestHash: hashed.value.digest, canonicalMaterial: hashed.value.canonicalMaterial, material: parsed.value } };
}
