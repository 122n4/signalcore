import { describe, expect, it } from "vitest";
import { assessResearchEmbargoAgainstCoreCandidatesV1 as assess } from "../lib/investing/research/coreMarketIdentityEmbargoEvidence";
import type { DatasetSeriesHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import type { BlindTruthHoldoutScopeV1 } from "../lib/investing/research/blindTruth";
import type { CoreMarketIdentityCandidateV1 } from "../lib/market/identityCandidateEvidence";

const series:DatasetSeriesHashPayloadV1={
  schemaVersion:"DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId:"PROVIDER_B_DATASET",providerDatasetVersion:"V20261012",
  instrumentId:"EURUSD_SOURCE_SYMBOL_B",fieldId:"ADJUSTED_CLOSE",fieldVersion:"V1",
  frequency:"D1",timezone:"UTC",calendar:"CALENDAR_24_7_V1",currency:"USD",
  coverageStart:"2026-01-01",coverageEnd:"2026-08-01",
  observationCount:"10",contentSha256:"A".repeat(64),
};
const candidate:CoreMarketIdentityCandidateV1={
  schemaVersion:"CORE_MARKET_IDENTITY_CANDIDATE_V1",
  sourceKind:"PROVIDER_ADAPTER_CANDIDATE",authorityState:"UNVERIFIED",
  providerId:"PROVIDER_B",providerDatasetId:series.providerDatasetId,
  providerDatasetVersion:series.providerDatasetVersion,instrumentId:series.instrumentId,
  fieldId:series.fieldId,fieldVersion:series.fieldVersion,
  canonicalMarketId:"EURUSD",canonicalFieldId:"close",
  validFrom:"2025-01-01",validThrough:"2027-01-01",
  knownAt:"2026-08-02T00:00:00.000Z",sourceEvidenceSha256Hex:"B".repeat(64),
};
const scope:BlindTruthHoldoutScopeV1={
  schemaVersion:"BLIND_TRUTH_HOLDOUT_SCOPE_V1",
  providerId:"PROVIDER_A",providerDatasetId:"PROVIDER_A_DATASET",
  providerDatasetVersion:"V20261012",markets:["EURUSD"],frequency:"M1",
  fields:["close"],coverageStart:"2026-03-01",coverageEnd:"2026-06-30",
  calendarId:"CALENDAR_24_7_V1",timezone:"UTC",
};
const args=(o:Record<string,unknown>={})=>({
  series,asOf:"2026-10-12T00:00:00.000Z",candidates:[candidate],
  embargoScopes:[scope],...o,
});

describe("RL-9C3B2B7B Core identity candidate → Research embargo adapter",()=>{
  it("detects cross-provider AND cross-frequency possible intersection; does not grant reads",()=>{
    expect(assess(args())).toEqual({
      classification:"DENY",reason:"POSSIBLE_EMBARGO_INTERSECTION",
    });
  });

  it("does not grant reads outside embargo period",()=>{
    const disjoint={...scope,coverageStart:"2025-01-01",coverageEnd:"2025-03-01"};
    expect(assess(args({embargoScopes:[disjoint]}))).toEqual({
      classification:"UNPROVEN",reason:"NO_INTERSECTION_NOT_AUTHORIZATION",
    });
  });

  it("missing fence list does not become authorization",()=>{
    const r=assess(args({embargoScopes:[]}));
    expect(r.classification).toBe("UNPROVEN");
    expect(JSON.stringify(r)).not.toContain("ALLOW");
  });

  it("detects conflicting Core identity aliases as UNPROVEN",()=>{
    const other={...candidate,canonicalMarketId:"BTCUSD"};
    expect(assess(args({candidates:[candidate,other]}))).toEqual({
      classification:"UNPROVEN",reason:"CORE_MARKET_IDENTITY_UNPROVEN",
    });
  });

  it("never trusts future-known provider mapping at earlier asOf",()=>{
    expect(assess(args({asOf:"2026-08-01T00:00:00.000Z"}))).toEqual({
      classification:"UNPROVEN",reason:"CORE_MARKET_IDENTITY_UNPROVEN",
    });
  });

  it("refuses wrong effective dates and malformed provider evidence",()=>{
    for(const v of [
      {...candidate,validFrom:"2026-04-01"},
      {...candidate,authorityState:"VERIFIED"},
      {...candidate,sourceEvidenceSha256Hex:"weak"},
    ])expect(assess(args({candidates:[v]})).classification).toBe("UNPROVEN");
  });

  it("rejects inherited, extra and accessor keys without reading untrusted values",()=>{
    let calls=0;
    const ev={...candidate};
    Object.defineProperty(ev,"canonicalFieldId",{
      enumerable:true,get(){calls++;throw Error("sensitive leak");},
    });
    const poisoned=assess(args({candidates:[ev]}));
    expect(poisoned.classification).toBe("UNPROVEN");
    expect(JSON.stringify(poisoned)).not.toContain("sensitive leak");
    expect(calls).toBe(0);

    const root=args();
    expect(assess(Object.assign(Object.create({isRoot:true}),root))).toEqual({
      classification:"UNPROVEN",reason:"INVALID_RESEARCH_EVIDENCE",
    });
    expect(assess({...root,[Symbol("ALLOW")]:true})).toEqual({
      classification:"UNPROVEN",reason:"INVALID_RESEARCH_EVIDENCE",
    });
  });

  it("never converts a proven series content SHA to a source identity authorization",()=>{
    const sameHash={...series,contentSha256:"F".repeat(64)};
    const result=assess(args({series:sameHash,embargoScopes:[]}));
    expect(result.classification).toBe("UNPROVEN");
  });
});
