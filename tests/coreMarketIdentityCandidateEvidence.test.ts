import { describe, expect, it } from "vitest";
import {
  resolveCoreMarketIdentityCandidateV1 as resolve,
  type CoreMarketIdentityCandidateV1,
  type CoreMarketSeriesIdentityV1,
} from "../lib/market/identityCandidateEvidence";

const series: CoreMarketSeriesIdentityV1 = {
  providerDatasetId:"HISTORICAL_PROVIDER_EURUSD",
  providerDatasetVersion:"V20261012",
  instrumentId:"EURUSD_FEED_02",
  fieldId:"ADJUSTED_CLOSE",
  fieldVersion:"V1",
  coverageStart:"2025-01-01",
  coverageEnd:"2025-06-30",
};
const candidate:CoreMarketIdentityCandidateV1 = {
  schemaVersion:"CORE_MARKET_IDENTITY_CANDIDATE_V1",
  sourceKind:"PROVIDER_ADAPTER_CANDIDATE",
  authorityState:"UNVERIFIED",
  providerId:"PROVIDER_B",
  providerDatasetId:series.providerDatasetId,
  providerDatasetVersion:series.providerDatasetVersion,
  instrumentId:series.instrumentId,
  fieldId:series.fieldId,
  fieldVersion:series.fieldVersion,
  canonicalMarketId:"EURUSD",
  canonicalFieldId:"close",
  validFrom:"2024-01-01",
  validThrough:"2026-12-31",
  knownAt:"2025-07-01T00:00:00.000Z",
  sourceEvidenceSha256Hex:"A".repeat(64),
};
const asOf="2025-07-01T00:00:00.000Z";
const args=(o:Record<string,unknown>={})=>({series,asOf,candidates:[candidate],...o});
const unproven=(reason:string)=>({classification:"UNPROVEN",reason});

describe("Core market identity candidate evidence V1 — no Lab dependencies or ALLOW",()=>{
  it("preserves a single complete historical candidate but never authorizes it",()=>{
    const resolved=resolve(args());
    expect(resolved).toEqual({
      ...unproven("CANDIDATE_UNVERIFIED"),
      candidate,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.candidate)).toBe(true);
    expect(JSON.stringify(resolved)).not.toContain("ALLOW");
  });

  it("does not infer truth from an empty candidate registry",()=>{
    expect(resolve(args({candidates:[]}))).toEqual(unproven("EVIDENCE_UNAVAILABLE"));
  });

  it("rejects future-known information rather than applying look-ahead",()=>{
    expect(resolve(args({asOf:"2025-06-30T23:59:59.999Z"})))
      .toEqual(unproven("INVALID_REQUEST")); // observations span to asOf day but knowledge is future
    expect(resolve(args({candidates:[{...candidate,knownAt:"2025-07-02T00:00:00.000Z"}]})))
      .toEqual(unproven("EVIDENCE_FUTURE_KNOWLEDGE"));
  });

  it("accepts an as-of earlier record and excludes future knowledge without using it",()=>{
    const future={...candidate, knownAt:"2025-08-01T00:00:00.000Z",
      canonicalMarketId:"BTCUSD"};
    const result=resolve(args({candidates:[candidate,future]}));
    expect(result).toEqual({...unproven("CANDIDATE_UNVERIFIED"),candidate});
  });

  it("fails closed on conflicting simultaneous candidate mappings",()=>{
    const conflict={...candidate,canonicalMarketId:"BTCUSD",
      sourceEvidenceSha256Hex:"B".repeat(64)};
    expect(resolve(args({candidates:[candidate,conflict]})))
      .toEqual(unproven("EVIDENCE_AMBIGUOUS"));
    expect(resolve(args({candidates:[candidate,candidate]})))
      .toEqual(unproven("EVIDENCE_AMBIGUOUS"));
  });

  it("does not silently stitch multiple effective-dated revisions or aliases",()=>{
    const earlier={...candidate,validFrom:"2025-01-01",validThrough:"2025-03-31"};
    const later={...candidate,validFrom:"2025-04-01",validThrough:"2025-06-30"};
    expect(resolve(args({candidates:[earlier,later]})))
      .toEqual(unproven("EVIDENCE_AMBIGUOUS"));
  });

  it("requires full inclusive coverage without gaps",()=>{
    for(const c of [
      {...candidate,validFrom:"2025-02-01"},
      {...candidate,validThrough:"2025-06-29"},
      {...candidate,validFrom:"2025-07-01",validThrough:"2025-12-31"},
    ])expect(resolve(args({candidates:[c]})))
      .toEqual(unproven("EVIDENCE_PARTIAL_COVERAGE"));
    expect(resolve(args({candidates:[{...candidate,validFrom:series.coverageStart,
      validThrough:series.coverageEnd}]})).reason).toBe("CANDIDATE_UNVERIFIED");
  });

  it("requires exact provider version, instrument, field and field version",()=>{
    for(const changed of [
      {...candidate,providerDatasetVersion:"DIFFERENT_VERSION"},
      {...candidate,instrumentId:"ALIAS_OF_EURUSD"},
      {...candidate,fieldId:"RAW_CLOSE"},
      {...candidate,fieldVersion:"V2"},
      {...candidate,providerDatasetId:"DIFFERENT_PROVIDER_DATASET"},
    ])expect(resolve(args({candidates:[changed]})))
      .toEqual(unproven("EVIDENCE_UNAVAILABLE"));
  });

  it("rejects invalid dates, leap days and nonexistent UTC timestamps",()=>{
    for(const date of ["2025-02-29","2025-02-30","0000-01-01","2025-13-01"])
      expect(resolve(args({series:{...series,coverageStart:date}})))
        .toEqual(unproven("INVALID_REQUEST"));
    for(const timestamp of ["2025-07-01T00:00:00Z","2025-07-01T24:00:00.000Z",
      "2025-07-01T00:00:60.000Z","2025-07-01T00:00:00.000+00:00"])
      expect(resolve(args({asOf:timestamp}))).toEqual(unproven("INVALID_REQUEST"));
    expect(resolve(args({series:{...series,coverageEnd:"2025-02-28"}})).reason)
      .toBe("CANDIDATE_UNVERIFIED");
  });

  it("rejects future observations relative to as-of date",()=>{
    expect(resolve(args({asOf:"2025-01-01T00:00:00.000Z"})))
      .toEqual(unproven("INVALID_REQUEST"));
  });

  it("rejects unsigned/forged VERIFIED assertions and weak evidence hashes",()=>{
    for(const malformed of [
      {...candidate,authorityState:"VERIFIED"},
      {...candidate,sourceKind:"USER_SUPPLIED"},
      {...candidate,schemaVersion:"CORE_MARKET_IDENTITY_CANDIDATE_V0"},
      {...candidate,sourceEvidenceSha256Hex:"a".repeat(64)},
      {...candidate,sourceEvidenceSha256Hex:"bogus"},
      {...candidate,providerId:""},
      {...candidate,canonicalFieldId:"\u0000"},
      {...candidate,validFrom:"2027-01-01",validThrough:"2026-01-01"},
    ])expect(resolve(args({candidates:[malformed]})))
      .toEqual(unproven("INVALID_EVIDENCE"));
  });

  it("rejects malformed unrelated evidence rather than ignoring it",()=>{
    expect(resolve(args({candidates:[candidate,{not:"a core identity candidate"}]})))
      .toEqual(unproven("INVALID_EVIDENCE"));
  });

  it("never executes accessor getters or inherited records",()=>{
    let invoked=0;
    const accessor={...candidate};
    Object.defineProperty(accessor,"canonicalMarketId",{enumerable:true,
      get(){invoked++;throw Error("SECRET_FROM_GETTER");}});
    expect(resolve(args({candidates:[accessor]}))).toEqual(unproven("INVALID_EVIDENCE"));
    expect(invoked).toBe(0);
    const polluted=Object.assign(Object.create({state:"VERIFIED"}),candidate);
    expect(resolve(args({candidates:[polluted]}))).toEqual(unproven("INVALID_EVIDENCE"));
    const top=args();
    const forged=Object.assign(Object.create({ALLOW:true}),top);
    expect(resolve(forged)).toEqual(unproven("INVALID_REQUEST"));
    const symbol={...top,[Symbol("privileged")]:true};
    expect(resolve(symbol)).toEqual(unproven("INVALID_REQUEST"));
  });

  it("rejects sparse, accessor and overlarge candidate arrays without reading them",()=>{
    const sparse=new Array(2);sparse[1]=candidate;
    expect(resolve(args({candidates:sparse}))).toEqual(unproven("INVALID_EVIDENCE"));
    const malicious=[candidate];
    Object.defineProperty(malicious,0,{enumerable:true,get(){throw Error("LEAK");}});
    expect(resolve(args({candidates:malicious}))).toEqual(unproven("INVALID_EVIDENCE"));
    expect(resolve(args({candidates:Array.from({length:1025},()=>candidate)})))
      .toEqual(unproven("INVALID_EVIDENCE"));
  });

  it("does not trust candidate as proof of provider authenticity",()=>{
    const faked={...candidate,sourceEvidenceSha256Hex:"F".repeat(64)};
    expect(resolve(args({candidates:[faked]})).reason).toBe("CANDIDATE_UNVERIFIED");
  });
});
