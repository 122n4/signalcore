import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hashRefV1, sha256HexV1 } from "../lib/investing/research/canonical";
import { hashDatasetSeriesV1, type DatasetSeriesHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import { canonicalDatasetSeriesMaterialBytesV1 } from "../lib/investing/research/datasetMaterial";
import { createLocalSyntheticResearchMaterialProviderV1 } from "../lib/investing/research/localSyntheticResearchMaterialProvider";

vi.mock("server-only",()=>({}));

const fictional=Object.freeze([
  {date:"2025-01-02",value:"100.25"},
  {date:"2025-01-03",value:"101.5"},
]);
const bytes=canonicalDatasetSeriesMaterialBytesV1(fictional);
const series:DatasetSeriesHashPayloadV1={
  schemaVersion:"DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId:"SYNTRAKE_RL5_TEST_OHLCV",
  providerDatasetVersion:"V20260926",
  instrumentId:"SYNTHETIC_TEST_001",
  fieldId:"ADJUSTED_CLOSE",
  fieldVersion:"SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
  frequency:"DAILY",
  timezone:"America/New_York",
  calendar:"XNYS_TRADING_CALENDAR_V2",
  currency:"USD",
  coverageStart:"2025-01-02",coverageEnd:"2025-01-03",
  observationCount:"2",contentSha256:sha256HexV1(bytes),
};
const hash=hashDatasetSeriesV1(series);
const ref=hashRefV1({
  hashAlgorithm:"SHA-256",hashDomain:"SYNTRAKE:DATASET_SERIES:V1",
  hashVersion:"SYNTRAKE_SHA256_V1",hashHex:hash,
});
const ctx={
  actorKind:"USER_PRINCIPAL",
  actorId:"test_actor",
  principalId:"11111111-1111-4111-8111-111111111111",
  tenantId:"22222222-2222-4222-8222-222222222222",
  tenantMembershipId:"33333333-3333-4333-8333-333333333333",
  researchInvestigationId:"44444444-4444-4444-8444-444444444444",
  operation:"RESEARCH_EXECUTION_RUN_V1",capability:"RESEARCH_EXECUTE",
  operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH",
} as unknown as Parameters<typeof createLocalSyntheticResearchMaterialProviderV1>[0];

function rootFixture(fn:(root:string)=>void|Promise<void>){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"syntrake-rl9-local-material-"));
  fs.chmodSync(root,0o700);
  return Promise.resolve().then(()=>fn(root)).finally(()=>
    fs.rmSync(root,{recursive:true,force:true}));
}
function stage(root:string, data:Buffer=bytes) {
  const file=path.join(root,hash+".jsonl");
  fs.writeFileSync(file,data,{mode:0o600,flag:"wx"});
  fs.chmodSync(file,0o600);
  return file;
}

describe.skipIf(process.platform==="win32")("RL-9 local fictional-only positive Research material read",()=>{
  it("returns verified fictional bytes and fsyncs tenant-bound ATTEMPT and VERIFIED audit",async()=>rootFixture(async root=>{
    stage(root);
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root);
    expect(provider).not.toBeNull();
    const actual=await provider!.loadSeriesContent(ref,series);
    expect(actual?.equals(bytes)).toBe(true);
    const audit=fs.readFileSync(path.join(root,".syntrake-synthetic-read-audit.jsonl"),"utf8");
    const events=audit.trim().split("\n").map(row=>JSON.parse(row));
    expect(events).toHaveLength(2);
    expect(events.map(x=>x.phase)).toEqual(["ATTEMPT","VERIFIED"]);
    for(const event of events)expect(event).toMatchObject({
      schemaVersion:"RL9_LOCAL_SYNTHETIC_MATERIAL_READ_V1",
      tenantId:ctx.tenantId,principalId:ctx.principalId,
      researchInvestigationId:ctx.researchInvestigationId,
      seriesHashHex:hash,contentSha256:series.contentSha256,
    });
    expect(events[0].eventId).not.toBe(events[1].eventId);
    expect(audit).not.toContain("100.25");
    expect((fs.statSync(path.join(root,".syntrake-synthetic-read-audit.jsonl")).mode&0o777)).toBe(0o600);
  }));
  it("defaults to no positive provider unless explicitly given a root",()=>{
    expect(createLocalSyntheticResearchMaterialProviderV1(ctx,undefined)).toBeNull();
    expect(createLocalSyntheticResearchMaterialProviderV1(ctx,"")).toBeNull();
  });
  it("never treats another provider's bytes as trusted research even with matching SHA",async()=>rootFixture(async root=>{
    stage(root);
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root)!;
    for(const v of [
      {...series,providerDatasetId:"TWELVEDATA"},
      {...series,providerDatasetVersion:"V20261013"},
      {...series,fieldVersion:"WRONG"},
      {...series,contentSha256:"F".repeat(64)},
    ])await expect(provider.loadSeriesContent(ref,v))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
  }));
  it("rejects source hash mismatch without providing any bytes",async()=>rootFixture(async root=>{
    stage(root,Buffer.from("not the declared material\n"));
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root)!;
    await expect(provider.loadSeriesContent(ref,series))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    const events=fs.readFileSync(path.join(root,".syntrake-synthetic-read-audit.jsonl"),"utf8");
    expect(events).toContain("ATTEMPT");
    expect(events).not.toContain("VERIFIED");
  }));
  it("rejects malformed hash and missing expected payload",async()=>rootFixture(async root=>{
    stage(root);
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root)!;
    await expect(provider.loadSeriesContent({...ref,hashHex:"F".repeat(64)},series))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    await expect(provider.loadSeriesContent(ref))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
  }));
  it("refuses symlink files and permissive file modes",async()=>rootFixture(async root=>{
    const file=stage(root);
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root)!;
    fs.chmodSync(file,0o644);
    await expect(provider.loadSeriesContent(ref,series))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    fs.unlinkSync(file);
    const target=path.join(root,"target");
    fs.writeFileSync(target,bytes,{mode:0o600});
    fs.symlinkSync(target,file);
    await expect(provider.loadSeriesContent(ref,series))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
  }));
  it("refuses ambiguous roots, symlinks, wrong mode, and noncanonical root spelling",async()=>rootFixture(async root=>{
    const link=root+"-link";
    try {
      fs.symlinkSync(root,link);
      for(const value of [link,root+"/.",path.relative(process.cwd(),root)])
        expect(()=>createLocalSyntheticResearchMaterialProviderV1(ctx,value))
          .toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
      fs.chmodSync(root,0o755);
      expect(()=>createLocalSyntheticResearchMaterialProviderV1(ctx,root))
        .toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    }finally{fs.rmSync(link,{force:true});}
  }));
  it("refuses Production even if someone injects a local directory",async()=>rootFixture(async root=>{
    const old=process.env.NODE_ENV;
    try{
      vi.stubEnv("NODE_ENV","production");
      expect(()=>createLocalSyntheticResearchMaterialProviderV1(ctx,root))
        .toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    }finally{
      vi.unstubAllEnvs();
      if(old!==undefined)process.env.NODE_ENV=old;
    }
  }));
  it("refuses account/portfolio scopes and malformed authority",async()=>rootFixture(async root=>{
    for(const changes of [
      {sourceContext:"USER_PORTFOLIO",operationScope:"ACCOUNT_SCOPE"},
      {actorKind:"SYSTEM_ACTOR"},
      {capability:"RESEARCH_MUTATE"},
      {operation:"RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1"},
    ])expect(()=>createLocalSyntheticResearchMaterialProviderV1(
      {...ctx,...changes} as typeof ctx,root)).toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
  }));
  it("also serves accepted validation execution without allowing a secret reveal",async()=>rootFixture(async root=>{
    stage(root);
    const validationCtx={...ctx,operation:"RESEARCH_VALIDATION_CHILD_EXECUTE_V1"} as typeof ctx;
    const material=createLocalSyntheticResearchMaterialProviderV1(validationCtx,root)!;
    expect((await material.loadSeriesContent(ref,series))?.equals(bytes)).toBe(true);
  }));
  it("fails closed when local audit cannot be opened, even though the fictional material is present",async()=>rootFixture(async root=>{
    stage(root);
    const target=path.join(root,".syntrake-synthetic-read-audit.jsonl");
    fs.symlinkSync(path.join(root,hash+".jsonl"),target);
    const provider=createLocalSyntheticResearchMaterialProviderV1(ctx,root)!;
    await expect(provider.loadSeriesContent(ref,series))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
  }));
});
