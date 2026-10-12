import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const root=path.resolve(__dirname,"..");
const url=process.env.PG17_RECONCILIATION_URL ?? "";
const pg=url?describe:describe.skip;
const file="20261012190000_investing_i5_rl9c3b2b4_persisted_fence_deny_preflight.sql";
const migrations=fs.readdirSync(path.join(root,"supabase","migrations"))
  .filter(name=>name.endsWith(".sql") &&
    name>="20260825120000_investing_genesis_i2_authority_materialization.sql" &&
    name<=file).sort();
const recorder="investing.rl9c3b2b4_record_persisted_fence_preflight_v1";
const journal="investing.research_blind_truth_denied_read_attempts_v1";
const tenant="11111111-1111-4111-8111-111111111111";
const principal="22222222-2222-4222-8222-222222222222";
const membership="33333333-3333-4333-8333-333333333333";
const investigation="44444444-4444-4444-8444-444444444444";
const hash="A".repeat(64);
let db: Pool | null=null;
async function appContext(client:PoolClient, tenantId=tenant) {
  await client.query("set local role investing_app");
  const config:Record<string,string>={
    actor_kind:"USER_PRINCIPAL", tenant_id:tenantId, principal_id:principal,
    tenant_membership_id:membership,research_investigation_id:investigation,
    operation:"RESEARCH_EXECUTION_RUN_V1",capability:"RESEARCH_EXECUTE",
    operation_scope:"TENANT_SCOPE",source_context:"PURE_RESEARCH",
  };
  for(const [key,value] of Object.entries(config))
    await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
}
async function call(client:PoolClient, markets:string[]|null=["EURUSD"],
  fields:string[]|null=["close"],start="2026-03-01",end="2026-06-30") {
  return client.query<{decision:string}>(
    "select "+recorder+"($1,$2::text[],$3::text[],$4::date,$5::date) as decision",
    [hash,markets,fields,start,end],
  );
}

pg("RL-9C3B2B4: real PG17 persisted-fence denial-only preflight",()=>{
  beforeAll(async()=>{
    db=new Pool({connectionString:url,max:3});
    for(const name of migrations){
      await db.query(fs.readFileSync(path.join(root,"supabase","migrations",name),"utf8"));
    }
  },180_000);
  afterAll(async()=>{await db?.end();db=null;});

  it("replays through C3B2B4 and keeps registration admission denied",async()=>{
    expect(migrations.at(-1)).toBe(file);
    const r=await db!.query(
      "select has_function_privilege('investing_app',"+
      "'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE') as admitted,"+
      "(select count(*)::int from investing.research_blind_truth_embargo_fences_v1) as fences");
    expect(r.rows).toEqual([{admitted:false,fences:0}]);
  });

  it("never grants SELECT on fences or audit rows to untrusted roles",async()=>{
    const r=await db!.query(
      "select role_name, "+
      "has_table_privilege(role_name,'investing.research_blind_truth_embargo_fences_v1','SELECT') as fence_select,"+
      "has_table_privilege(role_name,'"+journal+"','SELECT') as journal_select,"+
      "has_function_privilege(role_name,'"+recorder+"(text,text[],text[],date,date)','EXECUTE') as invoke "+
      "from (values ('investing_app'),('anon'),('authenticated'),('service_role')) v(role_name)");
    expect(r.rows).toEqual([
      {role_name:"investing_app",fence_select:false,journal_select:false,invoke:true},
      {role_name:"anon",fence_select:false,journal_select:false,invoke:false},
      {role_name:"authenticated",fence_select:false,journal_select:false,invoke:false},
      {role_name:"service_role",fence_select:false,journal_select:false,invoke:false},
    ]);
  });

  it("records a stable blocked result even when no fence is visible",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");await appContext(client);
      const r=await call(client);
      expect(r.rows).toEqual([{decision:"UNPROVEN_NOT_AUTHORIZED"}]);
      await client.query("commit");
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
    const evidence=await db!.query(
      "select decision,preflight_observation from "+journal+" where series_hash_hex=$1",[hash]);
    expect(evidence.rows).toEqual([{
      decision:"UNPROVEN_NOT_AUTHORIZED",
      preflight_observation:"NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION",
    }]);
  });

  it("rejects claimed mapping ambiguity, malformed arrays and invalid coverage instead of pretending clean",async()=>{
    const client=await db!.connect();
    const inputs:[
      string[]|null,string[]|null,string,string
    ][]=[
      [[],["close"],"2026-03-01","2026-06-30"],
      [null,["close"],"2026-03-01","2026-06-30"],
      [["EURUSD","EURUSD"],["close"],"2026-03-01","2026-06-30"],
      [["EURUSD"],["close","close"],"2026-03-01","2026-06-30"],
      [["EURUSD"],["close"],"2026-06-30","2026-03-01"],
      [[""],["close"],"2026-03-01","2026-06-30"],
    ];
    try{
      for(const [markets,fields,start,end] of inputs){
        await client.query("begin");await appContext(client);
        await expect(call(client,markets,fields,start,end)).rejects.toMatchObject({code:"P0001"});
        await client.query("rollback");
      }
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
  });

  it("rejects absent authority context, without spilling tenant-specific data",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(call(client)).rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
  });

  it("proves append-only observation column cannot be rewritten or deleted",async()=>{
    const client=await db!.connect();
    try{
      await client.query("begin");
      await expect(client.query("update "+journal+" set preflight_observation='NOT_EVALUATED'")).rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");await client.query("begin");
      await expect(client.query("delete from "+journal)).rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
  });

  it("does not gain schema CREATE nor retain temporary owner grants",async()=>{
    const r=await db!.query(
      "select has_schema_privilege('investing_rl9_writer','investing','CREATE') as can_create,"+
      "exists(select 1 from pg_catalog.pg_auth_members m "+
      "where m.member='postgres'::regrole and "+
      "m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole) "+
      "and (m.set_option or m.inherit_option)) as leaked_membership");
    expect(r.rows).toEqual([{can_create:false,leaked_membership:false}]);
  });
});
