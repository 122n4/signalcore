import { describe, expect, it } from "vitest";
import { compareShadowParity, validShadowParityCycle } from "@/lib/investing/shadow-parity/comparator.server";
import { SHADOW_PARITY_SNAPSHOT_VERSION, type ShadowParitySnapshot } from "@/lib/investing/shadow-parity/types";

const scope={tenantId:"tenant_a",ownerId:"user_a",portfolioId:"portfolio_a",accountId:"00000000-0000-4000-8000-000000000001",authenticatedUserId:"user_a"};
const snapshot=(source:"legacy"|"canonical",overrides:Partial<ShadowParitySnapshot>={}):ShadowParitySnapshot=>({contractVersion:SHADOW_PARITY_SNAPSHOT_VERSION,source,sourceVersion:`${source}-v1`,scope,observedAt:"2026-08-08T10:00:00.000Z",cashEur:100,positions:[{symbol:"NFLX",quantity:2,valueEur:50}],pending:[],valuationEur:150,...overrides});
const compare=(legacy=snapshot("legacy"),canonical=snapshot("canonical"))=>compareShadowParity({dayKey:"2026-08-08",observedAt:"2026-08-08T10:00:00.000Z",legacy,canonical});

describe("Phase 7 residual shadow parity comparator",()=>{
 it("produces deterministic, cryptographically valid passed evidence",()=>{const a=compare(),b=compare();expect(a.ok).toBe(true);expect(b).toEqual(a);if(a.ok){expect(a.value.state).toBe("passed");expect(a.value.dimensions.map(x=>x.dimension)).toEqual(["identity","cash","positions","pending_state","valuation"]);expect(validShadowParityCycle(a.value)).toBe(true)}});
 it("blocks mismatches and never turns them into readiness",()=>{const result=compare(snapshot("legacy"),snapshot("canonical",{cashEur:99,positions:[{symbol:"NFLX",quantity:1,valueEur:50}]}));expect(result.ok).toBe(true);if(result.ok){expect(result.value.state).toBe("blocked");expect(result.value.dimensions.find(x=>x.dimension==="cash")?.state).toBe("blocked");expect(result.value.dimensions.find(x=>x.dimension==="positions")?.state).toBe("blocked")}});
 it("marks missing trusted values unavailable",()=>{const result=compare(snapshot("legacy",{cashEur:null,valuationEur:null}));expect(result.ok).toBe(true);if(result.ok){expect(result.value.state).toBe("unavailable");expect(result.value.dimensions.find(x=>x.dimension==="cash")?.reason).toBe("source_unavailable")}});
 it("rejects malformed inputs and tampered evidence",()=>{expect(compareShadowParity({dayKey:"08-08-2026",observedAt:"bad",legacy:snapshot("legacy"),canonical:snapshot("canonical")}).ok).toBe(false);const result=compare();if(result.ok)expect(validShadowParityCycle({...result.value,state:"blocked"})).toBe(false)});
});
