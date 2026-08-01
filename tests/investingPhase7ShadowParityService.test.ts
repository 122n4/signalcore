import { describe, expect, it, vi } from "vitest";
import { ShadowParityService } from "@/lib/investing/shadow-parity/service.server";
import { authorizedOperator } from "@/lib/investing/shadow-parity/composition.server";
import { SHADOW_PARITY_SNAPSHOT_VERSION, type ShadowParitySnapshot } from "@/lib/investing/shadow-parity/types";

const identity={tenantId:"tenant_a",ownerId:"user_a",portfolioId:"portfolio_a",accountId:"00000000-0000-4000-8000-000000000001",authenticatedUserId:"user_a"};
const progress={requiredCycles:30 as const,consecutivePassedCycles:0,readyForCutover:false,latest:null,history:[]};
const snapshots=()=>{const base={contractVersion:SHADOW_PARITY_SNAPSHOT_VERSION,sourceVersion:"source-v1",scope:identity,observedAt:"2026-08-08T10:00:00.000Z",cashEur:0,positions:[],pending:[],valuationEur:0};return {legacy:{...base,source:"legacy"} as ShadowParitySnapshot,canonical:{...base,source:"canonical"} as ShadowParitySnapshot}};

describe("Phase 7 residual shadow parity service",()=>{
 it("fails closed before source I/O when authorization is denied",async()=>{const load=vi.fn(),record=vi.fn(),service=new ShadowParityService({authorize:async()=>({ok:false,reason:"shadow_parity_not_authorized"})},{load},{record,progress:vi.fn()});expect(await service.run({dayKey:"2026-08-08",observedAt:"2026-08-08T10:00:00.000Z"})).toEqual({ok:false,reason:"shadow_parity_not_authorized"});expect(load).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled()});
 it("persists only comparator output and returns non-ready progress",async()=>{const record=vi.fn(async cycle=>({cycle,reused:false})),service=new ShadowParityService({authorize:async()=>({ok:true,identity:identity as never})},{load:async()=>snapshots()},{record,progress:async()=>progress});const result=await service.run({dayKey:"2026-08-08",observedAt:"2026-08-08T10:00:00.000Z"});expect(result.ok).toBe(true);expect(record).toHaveBeenCalledOnce();if(result.ok&&"value" in result)expect(result.value.progress.readyForCutover).toBe(false)});
 it("uses an exact, fail-closed operator allowlist",()=>{expect(authorizedOperator("user_a","user_a,user_b")).toBe(true);expect(authorizedOperator("user_a",undefined)).toBe(false);expect(authorizedOperator("user_a","user_a,user_a")).toBe(false);expect(authorizedOperator("user_a","*")).toBe(false)});
});
