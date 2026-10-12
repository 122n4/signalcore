import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const root=path.resolve(__dirname,"..");
const url=process.env.PG17_RECONCILIATION_URL ?? "";
const pg=url?describe:describe.skip;
const migration="20261012200000_investing_i5_rl9c3b2b7a_mapping_candidate_evidence.sql";
const migrations=fs.readdirSync(path.join(root,"supabase","migrations"))
  .filter(n=>n.endsWith(".sql")&&n>="20260825120000_investing_genesis_i2_authority_materialization.sql"
    && n<=migration).sort();
const candidateTable="investing.research_dataset_mapping_candidates_v1";
const deniedTable="investing.research_blind_truth_denied_read_attempts_v1";
const fn="investing.rl9c3b2b7a_record_mapping_assessment_v1";
const a={
  tenant_id:"11111111-1111-4111-8111-111111111111",
  principal_id:"22222222-2222-4222-8222-222222222222",
  tenant_membership_id:"33333333-3333-4333-8333-333333333333",
  research_investigation_id:"44444444-4444-4444-8444-444444444444",
};
const b={
  tenant_id:"55555555-5555-4555-8555-555555555555",
  principal_id:"66666666-6666-4666-8666-666666666666",
  tenant_membership_id:"77777777-7777-4777-8777-777777777777",
  research_investigation_id:"88888888-8888-4888-8888-888888888888",
};
const hash="A".repeat(64);
const evidence="B".repeat(64);
const fixture={
  series_hash_hex:hash,evidence_sha256_hex:evidence,
  provider_dataset_id:"DATASET_FIXTURE",
  provider_dataset_version:"V20261012",
  instrument_id:"EURUSD_FEED_A",
  field_id:"ADJUSTED_CLOSE",
  field_version:"V1",
  canonical_market_id:"EURUSD",
  canonical_field_id:"close",
  coverage_start:"2026-01-01",
  coverage_end:"2026-06-30",
};
let db:Pool|null=null;
async function context(client:PoolClient,identity:typeof a,role:"investing_app"|"investing_rl9_writer"="investing_app"){
  await client.query("set local role "+role);
  for(const [k,v] of Object.entries({
    ...identity,actor_kind:"USER_PRINCIPAL",
    operation:"RESEARCH_EXECUTION_RUN_V1",
    capability:"RESEARCH_EXECUTE",operation_scope:"TENANT_SCOPE",
    source_context:"PURE_RESEARCH",
  }))await client.query("select set_config($1,$2,true)",["syntrake.investing."+k,v]);
}
async function assess(identity:typeof a,series=hash){
  const client=await db!.connect();
  try{
    await client.query("begin");
    await context(client,identity);
    const result=await client.query<{decision:string}>(
      "select "+fn+"($1) as decision",[series]);
    await client.query("commit");
    return result.rows[0]!.decision;
  } finally {
    await client.query("rollback").catch(()=>undefined);
    client.release();
  }
}
async function seed(identity:typeof a,overrides:Record<string,unknown>={}){
  const row={...identity,...fixture,...overrides};
  const keys=Object.keys(row);
  const names=keys.map((_,i)=>"$"+(i+1)).join(",");
  return db!.query(
    "insert into "+candidateTable+" ("+keys.join(",")+") values ("+names+")",
    Object.values(row),
  );
}

pg("RL-9C3B2B7A: immutable cross-tenant mapping candidates are NEVER a read grant",()=>{
  beforeAll(async()=>{
    db=new Pool({connectionString:url,max:4});
    for(const name of migrations){
      await db.query(fs.readFileSync(path.join(root,"supabase","migrations",name),"utf8"));
    }
  },180_000);
  afterAll(async()=>{await db?.end();db=null;});

  it("replays through B7A with zero invented mappings and registration still locked",async()=>{
    expect(migrations.at(-1)).toBe(migration);
    const check=await db!.query(
      "select (select count(*)::int from "+candidateTable+") as candidates,"+
      "(select count(*)::int from investing.research_blind_truth_registrations_scientific_identities) as registered,"+
      "has_function_privilege('investing_app',"+
      "'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE') as admission");
    expect(check.rows).toEqual([{candidates:0,registered:0,admission:false}]);
  });

  it("forces RLS and denies all direct app/browser/service table reads and writes",async()=>{
    const r=await db!.query(
      "select c.relrowsecurity as rls,c.relforcerowsecurity as forced,"+
      "pg_get_userbyid(c.relowner) as owner from pg_class c "+
      "where c.oid='"+candidateTable+"'::regclass");
    expect(r.rows).toEqual([{rls:true,forced:true,owner:"investing_owner"}]);
    const perms=await db!.query(
      "select role_name,has_table_privilege(role_name,'"+candidateTable+"','SELECT') as rd,"+
      "has_table_privilege(role_name,'"+candidateTable+"','INSERT') as wr,"+
      "has_function_privilege(role_name,'"+fn+"(text)','EXECUTE') as call "+
      "from (values ('investing_app'),('anon'),('authenticated'),('service_role'),"+
      "('investing_rl9_writer')) p(role_name)");
    expect(perms.rows).toEqual([
      {role_name:"investing_app",rd:false,wr:false,call:true},
      {role_name:"anon",rd:false,wr:false,call:false},
      {role_name:"authenticated",rd:false,wr:false,call:false},
      {role_name:"service_role",rd:false,wr:false,call:false},
      {role_name:"investing_rl9_writer",rd:true,wr:false,call:false},
    ]);
  });

  it("records MAPPING_UNAVAILABLE but externally returns only UNPROVEN",async()=>{
    expect(await assess(a)).toBe("UNPROVEN_NOT_AUTHORIZED");
    const r=await db!.query(
      "select mapping_observation,decision from "+deniedTable+" order by recorded_at desc limit 1");
    expect(r.rows).toEqual([{mapping_observation:"MAPPING_UNAVAILABLE",
      decision:"UNPROVEN_NOT_AUTHORIZED"}]);
  });

  it("a single explicitly UNVERIFIED fixture assertion still cannot authorize",async()=>{
    await seed(a);
    expect(await assess(a)).toBe("UNPROVEN_NOT_AUTHORIZED");
    const r=await db!.query(
      "select mapping_observation,decision from "+deniedTable+" "+
      "where tenant_id=$1 order by recorded_at desc limit 1",[a.tenant_id]);
    expect(r.rows).toEqual([{mapping_observation:"MAPPING_CANDIDATE_UNVERIFIED",
      decision:"UNPROVEN_NOT_AUTHORIZED"}]);
  });

  it("a duplicate or conflicting canonical mapping is AMBIGUOUS, never silently chosen",async()=>{
    await seed(a,{canonical_market_id:"BTCUSD",evidence_sha256_hex:"C".repeat(64)});
    expect(await assess(a)).toBe("UNPROVEN_NOT_AUTHORIZED");
    const r=await db!.query("select mapping_observation from "+deniedTable+
      " where tenant_id=$1 order by recorded_at desc limit 1",[a.tenant_id]);
    expect(r.rows).toEqual([{mapping_observation:"MAPPING_AMBIGUOUS"}]);
  });

  it("same series SHA in another tenant never inherits another tenant's mappings",async()=>{
    expect(await assess(b)).toBe("UNPROVEN_NOT_AUTHORIZED");
    let r=await db!.query("select mapping_observation from "+deniedTable+
      " where tenant_id=$1 order by recorded_at desc limit 1",[b.tenant_id]);
    expect(r.rows).toEqual([{mapping_observation:"MAPPING_UNAVAILABLE"}]);
    await seed(b);
    expect(await assess(b)).toBe("UNPROVEN_NOT_AUTHORIZED");
    r=await db!.query("select mapping_observation from "+deniedTable+
      " where tenant_id=$1 order by recorded_at desc limit 1",[b.tenant_id]);
    expect(r.rows).toEqual([{mapping_observation:"MAPPING_CANDIDATE_UNVERIFIED"}]);
  });

  it("the restricted writer sees only the exact tenant AND scientific investigation context",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");await context(client,a,"investing_rl9_writer");
      let r=await client.query("select count(*)::int as n from "+candidateTable);
      expect(r.rows).toEqual([{n:2}]);
      await client.query("rollback");
      await client.query("begin");await context(client,b,"investing_rl9_writer");
      r=await client.query("select count(*)::int as n from "+candidateTable);
      expect(r.rows).toEqual([{n:1}]);
      await client.query("rollback");
      await client.query("begin");await context(client,{...a,
        research_investigation_id:b.research_investigation_id},"investing_rl9_writer");
      r=await client.query("select count(*)::int as n from "+candidateTable);
      expect(r.rows).toEqual([{n:0}]);
      await client.query("rollback");
    } finally {await client.query("rollback").catch(()=>undefined);client.release();}
  });

  it("rejects malformed hash, fake VERIFIED status, invalid ranges and evidence hashes",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");await context(client,a);
      await expect(client.query("select "+fn+"($1)",["not-a-sha"]))
        .rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
    } finally{await client.query("rollback").catch(()=>undefined);client.release();}
    for(const overrides of [
      {evidence_state:"VERIFIED"},
      {coverage_start:"2026-07-01",coverage_end:"2026-06-30"},
      {evidence_sha256_hex:"bogus"},
      {canonical_field_id:""},
    ])await expect(seed(a,overrides)).rejects.toMatchObject({code:"23514"});
  });

  it("rejects SQL UPDATE and DELETE on committed candidate evidence",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");
      await expect(client.query("update "+candidateTable+" set canonical_market_id='BTCUSD'"))
        .rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
      await client.query("begin");
      await expect(client.query("delete from "+candidateTable))
        .rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
  });

  it("leaves no temporary CREATE rights or admin writer membership",async()=>{
    const r=await db!.query(
      "select has_schema_privilege('investing_rl9_writer','investing','CREATE') as can_create,"+
      "exists(select 1 from pg_catalog.pg_auth_members m where "+
      "m.member='postgres'::regrole and "+
      "m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole) "+
      "and (m.set_option or m.inherit_option)) as temp_membership");
    expect(r.rows).toEqual([{can_create:false,temp_membership:false}]);
  });
});
