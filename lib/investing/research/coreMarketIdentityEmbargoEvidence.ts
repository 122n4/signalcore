import {
  resolveCoreMarketIdentityCandidateV1,
} from "../../market/identityCandidateEvidence";
import { canonicalDatasetSeriesHashPayloadV1, type DatasetSeriesHashPayloadV1 } from "./executionMaterials";
import { classifyResearchDatasetSeriesEmbargoV1 } from "./blindTruthDatasetScopeClassification";

export type ResearchCoreIdentityEmbargoAssessmentV1 = Readonly<{
  classification: "DENY" | "UNPROVEN";
  reason:
    | "INVALID_RESEARCH_EVIDENCE"
    | "CORE_MARKET_IDENTITY_UNPROVEN"
    | "POSSIBLE_EMBARGO_INTERSECTION"
    | "NO_INTERSECTION_NOT_AUTHORIZATION";
}>;

const NO_IDENTITY = Object.freeze({classification:"UNPROVEN",reason:"CORE_MARKET_IDENTITY_UNPROVEN"} as const);
const BAD = Object.freeze({classification:"UNPROVEN",reason:"INVALID_RESEARCH_EVIDENCE"} as const);
const POSSIBLE = Object.freeze({classification:"DENY",reason:"POSSIBLE_EMBARGO_INTERSECTION"} as const);
const NOT_GRANTED = Object.freeze({classification:"UNPROVEN",reason:"NO_INTERSECTION_NOT_AUTHORIZATION"} as const);

const SERIES_KEYS = [
  "schemaVersion", "providerDatasetId", "providerDatasetVersion", "instrumentId",
  "fieldId", "fieldVersion", "frequency", "timezone", "calendar", "currency",
  "coverageStart", "coverageEnd", "observationCount", "contentSha256",
] as const;
const REQUEST_KEYS = ["series", "asOf", "candidates", "embargoScopes"] as const;

function closedOwnData(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      Object.getPrototypeOf(raw) !== Object.prototype) throw Error("UNPROVEN");
  const own=Reflect.ownKeys(raw);
  if (own.length!==keys.length ||
      own.some(key=>typeof key!=="string"||!keys.includes(key))) throw Error("UNPROVEN");
  const descriptors=Object.getOwnPropertyDescriptors(raw);
  const values:Record<string,unknown>={};
  for(const key of keys){
    const d=descriptors[key];
    if(!d||!d.enumerable||!("value" in d))throw Error("UNPROVEN");
    values[key]=d.value;
  }
  return values;
}

/**
 * Research Lab consumes Core candidate identity evidence without enabling a
 * read. Cross-provider/frequency possible overlap may DENY; a disjoint or
 * unknown scope ALWAYS stays UNPROVEN. This is not an authoritative registry.
 */
export function assessResearchEmbargoAgainstCoreCandidatesV1(
  raw:unknown,
):ResearchCoreIdentityEmbargoAssessmentV1 {
  let input:Record<string,unknown>;
  let series:DatasetSeriesHashPayloadV1;
  try{
    input=closedOwnData(raw,REQUEST_KEYS);
    series=canonicalDatasetSeriesHashPayloadV1(
      closedOwnData(input.series,SERIES_KEYS) as DatasetSeriesHashPayloadV1,
    ) as unknown as DatasetSeriesHashPayloadV1;
  }catch{return BAD;}

  const core=resolveCoreMarketIdentityCandidateV1({
    series:{
      providerDatasetId:series.providerDatasetId,
      providerDatasetVersion:series.providerDatasetVersion,
      instrumentId:series.instrumentId,
      fieldId:series.fieldId,
      fieldVersion:series.fieldVersion,
      coverageStart:series.coverageStart,
      coverageEnd:series.coverageEnd,
    },
    asOf:input.asOf,
    candidates:input.candidates,
  });

  if(core.reason!=="CANDIDATE_UNVERIFIED"||!core.candidate) return NO_IDENTITY;

  // Unverified mapping can only conservatively deny, NEVER prove non-embargo.
  // B7A unverified persistence and this process-local evidence are NOT
  // sufficient for an operational positive read authorization.
  try{
    const mapped=core.candidate;
    const prefilter=classifyResearchDatasetSeriesEmbargoV1({
      series,
      mappings:[{
        providerDatasetId:mapped.providerDatasetId,
        providerDatasetVersion:mapped.providerDatasetVersion,
        instrumentId:mapped.instrumentId,
        fieldId:mapped.fieldId,
        fieldVersion:mapped.fieldVersion,
        canonicalMarketId:mapped.canonicalMarketId,
        canonicalFieldId:mapped.canonicalFieldId,
      }],
      embargoScopes:input.embargoScopes,
    });
    if(prefilter.classification==="DENY")return POSSIBLE;
    return NOT_GRANTED;
  }catch{
    return BAD;
  }
}
