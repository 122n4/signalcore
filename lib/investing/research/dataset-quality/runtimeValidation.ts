import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import { validateDatasetRequirementMaterial, validateDatasetVersionMaterial } from "../datasets/runtimeValidation";
import type { DatasetQualityEvaluationInput, QualityEvaluationProfile, QualityEvidence } from "./types";
import { DATASET_QUALITY_POLICY_VERSION } from "./versions";

export type QualityValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ path: string; reasonCode: string }>[] }>;

const fail = <T>(path: string, reasonCode = "quality_input_invalid"): QualityValidationResult<T> =>
  ({ ok: false, issues: [{ path, reasonCode }] });
const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: Record<string, unknown>, keys: readonly string[]) =>
  Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const iso = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

export function validateQualityProfile(input: unknown): QualityValidationResult<QualityEvaluationProfile> {
  if (!canonicalizeResearchContract(input).ok || !plain(input)
    || !exact(input, ["contractVersion", "asOfExclusive", "maximumStalenessSeconds", "maximumAbsoluteReturn", "universeMode"])
    || input.contractVersion !== DATASET_QUALITY_POLICY_VERSION || !iso(input.asOfExclusive)
    || !Number.isInteger(input.maximumStalenessSeconds) || Number(input.maximumStalenessSeconds) < 0
    || typeof input.maximumAbsoluteReturn !== "number" || !Number.isFinite(input.maximumAbsoluteReturn)
    || Number(input.maximumAbsoluteReturn) <= 0
    || !["single_instrument", "point_in_time_universe"].includes(String(input.universeMode))) {
    return fail("profile");
  }
  return { ok: true, value: structuredClone(input) as QualityEvaluationProfile };
}

export function validateQualityEvidence(input: unknown): QualityValidationResult<QualityEvidence> {
  if (!canonicalizeResearchContract(input).ok || !plain(input)
    || !exact(input, ["evidenceId", "kind", "contractVersion", "contentHash", "canonicalMaterial", "state", "material"])
    || typeof input.evidenceId !== "string" || !ID.test(input.evidenceId)
    || !["storage_integrity","coverage","calendar_session","gaps","duplicates","timezone","stale_data","ohlcv_outliers","adjustment_policy","corporate_actions","look_ahead","survivorship","provenance"].includes(String(input.kind))
    || typeof input.contractVersion !== "string" || !ID.test(input.contractVersion)
    || typeof input.contentHash !== "string" || !HASH.test(input.contentHash)
    || typeof input.canonicalMaterial !== "string"
    || input.state !== "verified" || !plain(input.material)) return fail("evidence");
  const material = input.material;
  const closedMaterial = (() => {
    switch (input.kind) {
      case "storage_integrity":
        return exact(material, ["normalizedContentHash","rawContentHash","storageKey"])
          && [material.normalizedContentHash, material.rawContentHash].every((v) => typeof v === "string" && HASH.test(v))
          && typeof material.storageKey === "string";
      case "coverage":
        return exact(material, ["coverageRatio"]) && typeof material.coverageRatio === "number"
          && Number.isFinite(material.coverageRatio) && material.coverageRatio >= 0 && material.coverageRatio <= 1;
      case "calendar_session":
        return exact(material, ["calendar","sessionPolicy","verified"])
          && typeof material.calendar === "string" && typeof material.sessionPolicy === "string" && material.verified === true;
      case "gaps":
        return exact(material, ["gapCount","calendar"]) && Number.isInteger(material.gapCount)
          && Number(material.gapCount) >= 0 && typeof material.calendar === "string";
      case "duplicates":
        return exact(material, ["duplicateCount","conflictCount"])
          && [material.duplicateCount, material.conflictCount].every((v) => Number.isInteger(v) && Number(v) >= 0);
      case "timezone":
        return exact(material, ["sourceTimezone","canonicalTimezone"])
          && typeof material.sourceTimezone === "string" && material.canonicalTimezone === "UTC";
      case "stale_data":
        return exact(material, ["lastTimestamp"]) && iso(material.lastTimestamp);
      case "ohlcv_outliers":
        return exact(material, ["invalidBarCount","maximumObservedAbsoluteReturn"])
          && Number.isInteger(material.invalidBarCount) && Number(material.invalidBarCount) >= 0
          && typeof material.maximumObservedAbsoluteReturn === "number"
          && Number.isFinite(material.maximumObservedAbsoluteReturn) && material.maximumObservedAbsoluteReturn >= 0;
      case "adjustment_policy":
        return exact(material, ["adjustmentPolicy","verified"])
          && ["raw","split_adjusted","all_adjusted"].includes(String(material.adjustmentPolicy)) && material.verified === true;
      case "corporate_actions":
        return exact(material, ["verified","coveredThroughExclusive"])
          && material.verified === true && iso(material.coveredThroughExclusive);
      case "look_ahead":
        return exact(material, ["latestInformationAt"]) && iso(material.latestInformationAt);
      case "survivorship":
        return exact(material, ["pointInTime","universeManifestHash"])
          && material.pointInTime === true && typeof material.universeManifestHash === "string"
          && HASH.test(material.universeManifestHash);
      case "provenance":
        return exact(material, ["complete","provider","providerSymbol"])
          && material.complete === true && typeof material.provider === "string" && typeof material.providerSymbol === "string";
      default:
        return false;
    }
  })();
  if (!closedMaterial) return fail("evidence.material");
  return { ok: true, value: structuredClone(input) as QualityEvidence };
}

export function validateQualityEvaluationInput(input: unknown): QualityValidationResult<DatasetQualityEvaluationInput> {
  if (!canonicalizeResearchContract(input).ok || !plain(input)
    || !exact(input, ["sourceDatasetVersionId", "source", "requirement", "profile", "evidence"])
    || typeof input.sourceDatasetVersionId !== "string" || !ID.test(input.sourceDatasetVersionId)
    || !validateDatasetVersionMaterial(input.source).ok || !validateDatasetRequirementMaterial(input.requirement).ok
    || !validateQualityProfile(input.profile).ok || !Array.isArray(input.evidence)
    || input.evidence.some((item) => !validateQualityEvidence(item).ok)) return fail("evaluation");
  const source = input.source as DatasetQualityEvaluationInput["source"];
  const requirement = input.requirement as DatasetQualityEvaluationInput["requirement"];
  if (JSON.stringify(source.scope) !== JSON.stringify(requirement.scientificScope)) return fail("evaluation.scope", "quality_evidence_mismatch");
  return { ok: true, value: structuredClone(input) as DatasetQualityEvaluationInput };
}
