import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  RESEARCH_ARTIFACT_REF_VERSION,
  validateResearchArtifactRef,
  type InvestingResearchScientificScope,
  type ResearchArtifactRef,
} from "../contracts";
import { canonicalizeResearchContract } from "../contracts";
import { hashCanonicalResearchMaterial } from "../reproducibility/hashing.server";
import { ARTIFACT_IDENTITY_DOMAIN } from "../reproducibility/versions";
import type { BacktestResult } from "./types";

export interface BacktestArtifactPublisher {
  publish(input:Readonly<{
    scope:InvestingResearchScientificScope;
    experimentId:string;
    executionId:string;
    runId:string;
    result:BacktestResult;
  }>):Promise<Readonly<{ok:true;value:ResearchArtifactRef}>
    |Readonly<{ok:false;reason:string}>>;
}

export class ContentAddressedBacktestArtifactStorage implements BacktestArtifactPublisher {
  private readonly root:string;
  constructor(root:string){
    if(!path.isAbsolute(root))throw new Error("backtest_artifact_root_must_be_absolute");
    this.root=path.resolve(root);
  }
  async publish(input:Parameters<BacktestArtifactPublisher["publish"]>[0]){
    const canonical=canonicalizeResearchContract(input.result);
    if(!canonical.ok)return {ok:false as const,reason:"backtest_artifact_invalid"};
    const bytes=Buffer.from(canonical.value,"utf8");
    const contentHash=createHash("sha256").update(bytes).digest("hex");
    const identity=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
      kind:"backtest_result",scope:input.scope,experimentId:input.experimentId,
      executionId:input.executionId,runId:input.runId,contentHash,
      mediaType:"application/json",schemaVersion:input.result.contractVersion,
    });
    if(!identity.ok)return {ok:false as const,reason:"backtest_artifact_identity_invalid"};
    const artifactId=`irart_v1_${identity.value.digest}`;
    const key=`sha256/${contentHash.slice(0,2)}/${contentHash}.json`;
    const destination=path.resolve(this.root,...key.split("/"));
    if(!destination.startsWith(`${this.root}${path.sep}`)){
      return {ok:false as const,reason:"backtest_artifact_path_invalid"};
    }
    await mkdir(path.dirname(destination),{recursive:true});
    const temporary=`${destination}.${randomUUID()}.tmp`;
    try{
      const handle=await open(temporary,"wx");
      try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
      try{await link(temporary,destination);}catch(error){
        if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;
        const existing=await readFile(destination);
        if(createHash("sha256").update(existing).digest("hex")!==contentHash){
          return {ok:false as const,reason:"backtest_artifact_collision"};
        }
      }
      const info=await stat(destination);
      const artifact:ResearchArtifactRef={
        contractVersion:RESEARCH_ARTIFACT_REF_VERSION,artifactId,
        kind:"backtest_result",contentHash,mediaType:"application/json",
        schemaVersion:input.result.contractVersion,sizeBytes:info.size,
        logicalRole:"experiment_result_evidence",
        provenanceRef:{id:input.executionId,version:"v1"},
        retentionClass:"scientific_record",
      };
      const validated=validateResearchArtifactRef(artifact);
      return validated.ok?{ok:true as const,value:validated.value}
        :{ok:false as const,reason:"backtest_artifact_reference_invalid"};
    }catch{
      return {ok:false as const,reason:"backtest_artifact_storage_failed"};
    }finally{await rm(temporary,{force:true});}
  }
  async read(reference:ResearchArtifactRef){
    const validated=validateResearchArtifactRef(reference);
    if(!validated.ok||validated.value.kind!=="backtest_result"){
      return {ok:false as const,reason:"backtest_artifact_reference_invalid"};
    }
    const hash=validated.value.contentHash;
    const destination=path.resolve(this.root,"sha256",hash.slice(0,2),`${hash}.json`);
    if(!destination.startsWith(`${this.root}${path.sep}`)){
      return {ok:false as const,reason:"backtest_artifact_path_invalid"};
    }
    try{
      const bytes=await readFile(destination);
      if(createHash("sha256").update(bytes).digest("hex")!==hash){
        return {ok:false as const,reason:"backtest_artifact_integrity_failed"};
      }
      return {ok:true as const,value:bytes};
    }catch{return {ok:false as const,reason:"backtest_artifact_read_failed"};}
  }
}
