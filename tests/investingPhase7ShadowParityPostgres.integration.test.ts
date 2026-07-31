import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { compareShadowParity } from "@/lib/investing/shadow-parity/comparator.server";
import { PostgresShadowParityRepository } from "@/lib/investing/shadow-parity/postgresRepository.server";
import { SHADOW_PARITY_SNAPSHOT_VERSION, type ShadowParitySnapshot } from "@/lib/investing/shadow-parity/types";

const url=process.env.INVESTING_7_SHADOW_TEST_DATABASE_URL;
const pgDescribe=url?describe:describe.skip;
pgDescribe("Phase 7 residual shadow parity PostgreSQL",()=>{
 it("persists once under concurrency, enforces RLS and remains immutable",async()=>{const pool=new Pool({connectionString:url,max:5});try{
  const tenantId="00000000-0000-4000-8000-000000000071",accountId="00000000-0000-4000-8000-000000000072",userId="user_shadow_a",portfolioId="portfolio_shadow_a";
  await pool.query("insert into public.investing_tenants(id,owner_user_id) values($1::uuid,$2) on conflict do nothing",[tenantId,userId]);
  await pool.query("insert into public.investing_tenant_memberships(tenant_id,user_id,permissions) values($1::uuid,$2,array['investing:read','investing:create','investing:verify','investing:replay']) on conflict do nothing",[tenantId,userId]);
  await pool.query("insert into public.investing_accounts(id,user_id,owner_user_id,tenant_id,portfolio_id,environment,status) values($1::uuid,$2,$2,$3::uuid,$4,'paper','active') on conflict do nothing",[accountId,userId,tenantId,portfolioId]);
  const scope={tenantId,ownerId:userId,portfolioId,accountId,authenticatedUserId:userId},base={contractVersion:SHADOW_PARITY_SNAPSHOT_VERSION,sourceVersion:"qa-v1",scope,observedAt:"2026-08-08T10:00:00.000Z",cashEur:100,positions:[],pending:[],valuationEur:100};
  const compared=compareShadowParity({dayKey:"2026-08-08",observedAt:base.observedAt,legacy:{...base,source:"legacy"} as ShadowParitySnapshot,canonical:{...base,source:"canonical"} as ShadowParitySnapshot});expect(compared.ok).toBe(true);if(!compared.ok)throw 0;
  const repository=new PostgresShadowParityRepository(pool),results=await Promise.all([repository.record(compared.value),repository.record(compared.value)]);expect(results.filter(x=>!x.reused)).toHaveLength(1);expect(results.filter(x=>x.reused)).toHaveLength(1);
  const progress=await repository.progress(scope);expect(progress).toMatchObject({consecutivePassedCycles:1,readyForCutover:false});
  await expect(pool.query("update public.investing_shadow_parity_cycles set state='blocked' where cycle_id=$1",[compared.value.cycleId])).rejects.toThrow(/immutable/u);
  const own=await pool.connect();try{await own.query("begin");await own.query("set local role authenticated");await own.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:userId})]);expect((await own.query("select count(*)::int count from public.investing_shadow_parity_cycles")).rows[0].count).toBe(1);await own.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:"user_shadow_b"})]);expect((await own.query("select count(*)::int count from public.investing_shadow_parity_cycles")).rows[0].count).toBe(0);await own.query("rollback")}finally{own.release()}
 }finally{await pool.end()}});
});
