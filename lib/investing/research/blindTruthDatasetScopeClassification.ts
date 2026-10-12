import { canonicalTextV1 } from "./canonical";
import { canonicalDatasetSeriesHashPayloadV1, type DatasetSeriesHashPayloadV1 } from "./executionMaterials";
import { inspectBlindTruthEmbargoIntersectionV1 } from "./blindTruthEmbargoIntersection";
import type { BlindTruthHoldoutScopeV1 } from "./blindTruth";

/**
 * RL-9C3B2B1: deterministic dataset-series scope classification.
 * This is a DENY/UNPROVEN gate, never an access permission.
 *
 * The mappings argument is NOT proof of a trusted registry. The future
 * server-owned registry and persisted read audit must validate it before
 * any read can be authorized.
 */
export type DatasetSeriesCanonicalMappingV1 = Readonly<{
  providerDatasetId: string;
  providerDatasetVersion: string;
  instrumentId: string;
  fieldId: string;
  fieldVersion: string;
  canonicalMarketId: string;
  canonicalFieldId: string;
}>;

export type ResearchDatasetEmbargoClassificationV1 = Readonly<{
  classification: "DENY" | "UNPROVEN";
  reason:
    | "EMBARGO_INTERSECTION"
    | "SERIES_INVALID"
    | "MAPPING_INVALID"
    | "MAPPING_AMBIGUOUS"
    | "MAPPING_UNAVAILABLE"
    | "HOLDOUT_EVIDENCE_UNPROVEN"
    | "NO_INTERSECTION_NOT_AUTHORIZATION";
}>;

const BLOCKED_OVERLAP = Object.freeze({ classification: "DENY", reason: "EMBARGO_INTERSECTION" } as const);
const SERIES_INVALID = Object.freeze({ classification: "UNPROVEN", reason: "SERIES_INVALID" } as const);
const MAPPING_INVALID = Object.freeze({ classification: "UNPROVEN", reason: "MAPPING_INVALID" } as const);
const MAPPING_AMBIGUOUS = Object.freeze({ classification: "UNPROVEN", reason: "MAPPING_AMBIGUOUS" } as const);
const MAPPING_UNAVAILABLE = Object.freeze({ classification: "UNPROVEN", reason: "MAPPING_UNAVAILABLE" } as const);
const EVIDENCE_UNPROVEN = Object.freeze({ classification: "UNPROVEN", reason: "HOLDOUT_EVIDENCE_UNPROVEN" } as const);
const NO_READ_GRANT = Object.freeze({ classification: "UNPROVEN", reason: "NO_INTERSECTION_NOT_AUTHORIZATION" } as const);

const mappingKeys = [
  "providerDatasetId", "providerDatasetVersion", "instrumentId", "fieldId",
  "fieldVersion", "canonicalMarketId", "canonicalFieldId",
] as const;

function closedDataRecord(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      Object.getPrototypeOf(raw) !== Object.prototype) throw Error("INVALID");
  const own = Reflect.ownKeys(raw);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) {
    throw Error("INVALID");
  }
  const desc = Object.getOwnPropertyDescriptors(raw);
  if (keys.some(key => !Object.hasOwn(desc, key) || !("value" in desc[key]) || !desc[key].enumerable)) {
    throw Error("INVALID");
  }
  return Object.fromEntries(keys.map(key => [key, desc[key].value]));
}

function canonicalMapping(raw: unknown): DatasetSeriesCanonicalMappingV1 {
  const record = closedDataRecord(raw, mappingKeys);
  const get = (key: typeof mappingKeys[number]): string => {
    const value = record[key];
    if (typeof value !== "string") throw Error("INVALID");
    return canonicalTextV1(value, { minBytes: 1, maxBytes: 256 });
  };
  return Object.freeze({
    providerDatasetId: get("providerDatasetId"),
    providerDatasetVersion: get("providerDatasetVersion"),
    instrumentId: get("instrumentId"),
    fieldId: get("fieldId"),
    fieldVersion: get("fieldVersion"),
    canonicalMarketId: get("canonicalMarketId"),
    canonicalFieldId: get("canonicalFieldId"),
  });
}

/**
 * Use existing V1 series canonicalization and RL-9C3A intersection semantics.
 * Frequency/provider differences cannot open a hole when the canonical facts
 * overlap. A clean comparison is NEVER a permission to read.
 */
export function classifyResearchDatasetSeriesEmbargoV1(raw: unknown): ResearchDatasetEmbargoClassificationV1 {
  let input: Record<string, unknown>;
  let series: DatasetSeriesHashPayloadV1;
  try {
    input = closedDataRecord(raw, ["series", "mappings", "embargoScopes"]);
    series = canonicalDatasetSeriesHashPayloadV1(input.series as DatasetSeriesHashPayloadV1) as unknown as DatasetSeriesHashPayloadV1;
  } catch {
    return SERIES_INVALID;
  }

  let matching: DatasetSeriesCanonicalMappingV1[] = [];
  try {
    const rawMappings = input.mappings;
    if (!Array.isArray(rawMappings) || rawMappings.length > 1024) return MAPPING_INVALID;
    // Full traversal: malformed unrelated evidence cannot be silently ignored.
    const mappings = rawMappings.map(canonicalMapping);
    matching = mappings.filter(mapping =>
      mapping.providerDatasetId === series.providerDatasetId &&
      mapping.providerDatasetVersion === series.providerDatasetVersion &&
      mapping.instrumentId === series.instrumentId &&
      mapping.fieldId === series.fieldId &&
      mapping.fieldVersion === series.fieldVersion
    );
  } catch {
    return MAPPING_INVALID;
  }
  if (matching.length === 0) return MAPPING_UNAVAILABLE;
  if (matching.length !== 1) return MAPPING_AMBIGUOUS;

  const mapping = matching[0]!;
  const result = inspectBlindTruthEmbargoIntersectionV1({
    request: {
      canonicalMarkets: [mapping.canonicalMarketId],
      canonicalFields: [mapping.canonicalFieldId],
      coverageStart: series.coverageStart,
      coverageEnd: series.coverageEnd,
      requestedFrequency: series.frequency,
      mappingState: "VERIFIED",
    },
    embargoScopes: input.embargoScopes as readonly BlindTruthHoldoutScopeV1[],
  });
  if (result.classification === "DENY") return BLOCKED_OVERLAP;
  // This mapping is caller-supplied (including when called by server code).
  // The result can at most document a possible non-overlap. Database authority,
  // mapping provenance, snapshot completeness and access audit are unproved.
  if (result.reason === "NO_INTERSECTION_NOT_AUTHORIZATION") return NO_READ_GRANT;
  return EVIDENCE_UNPROVEN;
}
