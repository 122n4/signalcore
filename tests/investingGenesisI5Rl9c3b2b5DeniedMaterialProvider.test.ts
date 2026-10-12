import { describe, expect, it, vi } from "vitest";
import { createDeniedAndJournaledResearchMaterialProviderV1 } from "../lib/investing/research/deniedAndJournaledResearchMaterialProvider";
import { loadOrdinaryResearchDatasetSeriesMaterialV1 } from "../lib/investing/research/ordinaryResearchDatasetMaterialRead";
import { hashRefV1 } from "../lib/investing/research/canonical";
import { hashDatasetSeriesV1, type DatasetSeriesHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import type { AuthorizedResearchExecutionContext, InvestingAuthorityDatabase } from "../lib/investing/authority/context";

vi.mock("server-only", () => ({}));

const context = {
  actorKind: "USER_PRINCIPAL", actorId: "actor-from-server",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  tenantMembershipId: "33333333-3333-4333-8333-333333333333",
  researchInvestigationId: "44444444-4444-4444-8444-444444444444",
  correlationId: "corr-denial-001",
  operation: "RESEARCH_EXECUTION_RUN_V1", capability: "RESEARCH_EXECUTE",
  operationScope: "TENANT_SCOPE", sourceContext: "PURE_RESEARCH",
} as unknown as AuthorizedResearchExecutionContext;

const series: DatasetSeriesHashPayloadV1 = {
  schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId: "DENIAL_ONLY_SYNTHETIC_FIXTURE",
  providerDatasetVersion: "V20261012",
  instrumentId: "EURUSD",
  fieldId: "ADJUSTED_CLOSE", fieldVersion: "V1", frequency: "D1",
  timezone: "UTC", calendar: "CALENDAR_24_7_V1", currency: "USD",
  coverageStart: "2026-01-01", coverageEnd: "2026-01-02",
  observationCount: "2", contentSha256: "A".repeat(64),
};
const ref = hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:DATASET_SERIES:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: hashDatasetSeriesV1(series),
});

function fakeDb(answer = "UNPROVEN_NOT_AUTHORIZED") {
  const calls: Array<{ sql: string; args: readonly unknown[] }> = [];
  let released = 0;
  const query = vi.fn(async (sql: string, args: readonly unknown[] = []) => {
    calls.push({sql,args});
    if (sql.includes("rl9c3b2b2_record_unproven_read_v1"))
      return { rows: [{ decision: answer }], rowCount: 1 };
    return {rows: [],rowCount:0};
  });
  const release = vi.fn(() => { released++; });
  const connect = vi.fn(async () => ({query,release}));
  return { database: {connect} as unknown as InvestingAuthorityDatabase,
    connect, query, release, calls, get released() {return released;} };
}

describe("RL-9C3B2B5: fail-closed Research provider journal adapter", () => {
  it("calls the exact persisted denial recorder, commits and still throws without bytes", async () => {
    const f=fakeDb();
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    await expect(loadOrdinaryResearchDatasetSeriesMaterialV1(p,series,ref))
      .rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    const sql=f.calls.map(x=>x.sql);
    expect(sql[0]).toBe("begin");
    expect(sql).toContain("set local statement_timeout = '5000ms'");
    expect(sql).toContain("set local lock_timeout = '2000ms'");
    expect(f.calls.filter(x=>x.sql.startsWith("select set_config"))).toEqual(
      expect.arrayContaining([
        {sql:"select set_config($1,$2,true)",args:["syntrake.investing.tenant_id",context.tenantId]},
        {sql:"select set_config($1,$2,true)",args:["syntrake.investing.operation","RESEARCH_EXECUTION_RUN_V1"]},
        {sql:"select set_config($1,$2,true)",args:["syntrake.investing.account_id",""]},
      ]),
    );
    expect(f.calls.find(x=>x.sql.includes("rl9c3b2b2_record_unproven_read_v1"))?.args)
      .toEqual([ref.hashHex]);
    expect(sql.at(-1)).toBe("commit");
    expect(f.released).toBe(1);
  });

  it("rejects invalid series without opening a DB session", async () => {
    const f=fakeDb();
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    await expect(loadOrdinaryResearchDatasetSeriesMaterialV1(p,{
      ...series,coverageStart:"2026-04-01",coverageEnd:"2026-02-01",
    },ref)).rejects.toThrow();
    expect(f.connect).not.toHaveBeenCalled();
  });

  it("rejects wrong hash domain without calling the DB", async () => {
    const f=fakeDb();
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    const other=hashRefV1({...ref,hashDomain:"SYNTRAKE:DATASET_SNAPSHOT:V1"});
    await expect(p.loadSeriesContent(other)).rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    expect(f.connect).not.toHaveBeenCalled();
  });

  it("rejects any unexpected SQL verdict and rolls back", async () => {
    const f=fakeDb("ALLOW");
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    await expect(p.loadSeriesContent(ref)).rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    const sql=f.calls.map(x=>x.sql);
    expect(sql).toContain("rollback");
    expect(sql).not.toContain("commit");
    expect(f.released).toBe(1);
  });

  it("remains unavailable if DB cannot connect; no fabricated material", async () => {
    const db={connect:vi.fn(async()=>{throw Error("connection failed");})} as unknown as InvestingAuthorityDatabase;
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,db);
    await expect(p.loadSeriesContent(ref)).rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    expect(db.connect).toHaveBeenCalledTimes(1);
  });

  it("rolls back when the audit recorder fails, with zero bypass attempts", async () => {
    const f=fakeDb();
    f.query.mockImplementationOnce(async()=>{throw Error("BEGIN failure");});
    const p=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    await expect(p.loadSeriesContent(ref)).rejects.toThrow("RESEARCH_MATERIAL_ACCESS_UNPROVEN");
    expect(f.calls.map(x=>x.sql)).toContain("rollback");
    expect(f.released).toBe(1);
  });

  it("has no raw provider parameter and exposes no fallback to caller-supplied bytes", () => {
    expect(createDeniedAndJournaledResearchMaterialProviderV1.length).toBe(2);
    const f=fakeDb();
    const denied=createDeniedAndJournaledResearchMaterialProviderV1(context,f.database);
    expect(Object.keys(denied)).toEqual(["loadSeriesContent"]);
  });
});
