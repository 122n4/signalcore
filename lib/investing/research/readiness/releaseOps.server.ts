import "server-only";import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
export type ReleaseReadinessOpsRow=Readonly<{candidateId:string;commitSha:string;environment:string;
 buildId:string;assessmentId:string;state:string;reason:string|null;evaluatedAt:string;
 supersedesAssessmentId:string|null;revokedAt:string|null;revocationReason:string|null}>;
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(v);
const instant=(v:unknown)=>{if(v===null)return null;const d=v instanceof Date?v:new Date(String(v));return Number.isFinite(d.valueOf())?d.toISOString():null};
export class ReleaseReadinessOpsRepository{constructor(private readonly pool:ScopedSqlPool){}
 async read():Promise<readonly ReleaseReadinessOpsRow[]>{const client=await this.pool.connect();try{const result=await client.query(
  `select c.candidate_id,c.commit_sha,c.target_environment,c.build_id,
   a.assessment_id,a.state,a.reason,a.evaluated_at,a.supersedes_assessment_id,
   r.revoked_at,r.reason as revocation_reason
   from public.investing_effective_beta_readiness a join public.investing_release_candidates c
    on c.candidate_id=a.candidate_id left join public.investing_effective_readiness_revocations r
    on r.assessment_id=a.assessment_id order by a.evaluated_at desc,a.assessment_id desc limit 50`);
  return result.rows.map(row=>{const evaluatedAt=instant(row.evaluated_at),revokedAt=instant(row.revoked_at);
   if(!id(row.candidate_id)||!id(row.assessment_id)||!id(row.build_id)||!evaluatedAt
    ||typeof row.commit_sha!=="string"||!/^[a-f0-9]{40}$/u.test(row.commit_sha)
    ||!["preview","staging","production"].includes(String(row.target_environment))
    ||!["effective_beta_ready","blocked"].includes(String(row.state)))throw new Error("release_readiness_ops_integrity_failed");
   return {candidateId:String(row.candidate_id),commitSha:row.commit_sha,environment:String(row.target_environment),
    buildId:String(row.build_id),assessmentId:String(row.assessment_id),state:revokedAt?"revoked":String(row.state),
    reason:typeof row.reason==="string"?row.reason:null,evaluatedAt,supersedesAssessmentId:
     typeof row.supersedes_assessment_id==="string"?row.supersedes_assessment_id:null,revokedAt,
    revocationReason:typeof row.revocation_reason==="string"?row.revocation_reason:null}})}finally{client.release?.()}}
}
export interface ReleaseReadinessOpsAuthorization{authorize():Promise<{ok:true}|{ok:false;reason:string}>}
export class ReleaseReadinessOpsService{constructor(private readonly repository:ReleaseReadinessOpsRepository,
 private readonly authorization:ReleaseReadinessOpsAuthorization,private readonly now:()=>string){}
 async load(){const access=await this.authorization.authorize();if("reason" in access)return access;
  try{const history=(await this.repository.read()).map(v=>({...v}));return {ok:true as const,value:{
   contractVersion:"investing-release-readiness-ops/v1" as const,generatedAt:this.now(),current:history[0]??null,
   history,notices:["read_only","no_canonical_payload","no_activation_controls"] as const}}}
  catch{return {ok:false as const,reason:"release_readiness_ops_read_failed"}}}}
