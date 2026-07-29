import { describe,expect,it,vi } from "vitest";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
vi.mock("server-only",() => ({}));
import { runDeterministicBacktest } from "@/lib/investing/research/backtesting/engine.server";
import { BACKTEST_INPUT_VERSION } from "@/lib/investing/research/backtesting";
import {ContentAddressedBacktestArtifactStorage} from
  "@/lib/investing/research/backtesting/artifactStorage.server";

const input = () => ({
  contractVersion: BACKTEST_INPUT_VERSION,
  experimentId: `irexp_v1_${"a".repeat(64)}`,
  executionId: `irexec_v1_${"b".repeat(64)}`,
  datasetVersionId: "dataset-v1",
  bars: [
    { timestamp: "2026-01-01T00:00:00.000Z",open: 100,high: 111,low: 99,close: 110,volume: 10 },
    { timestamp: "2026-01-02T00:00:00.000Z",open: 120,high: 121,low: 118,close: 119,volume: 12 },
    { timestamp: "2026-01-03T00:00:00.000Z",open: 130,high: 132,low: 128,close: 131,volume: 14 },
  ],
  configuration: { initialCapital: 1000,transactionCostBps: 0,
    slippageBps: 0,maximumPositionWeight: 1 },
});

describe("Phase 6I deterministic backtest engine", () => {
  it("executes a decision only at the next bar open", () => {
    const result=runDeterministicBacktest(input(),{ contractVersion: "strategy/v1",decide: () => 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fills[0]).toMatchObject({
      timestamp: "2026-01-02T00:00:00.000Z",price: 120,
    });
    expect(result.value.fills.some((fill) => fill.price === 110)).toBe(false);
  });
  it("is byte-deterministic for equivalent executions", () => {
    const strategy={ contractVersion: "strategy/v1",decide: () => 0.5 };
    expect(runDeterministicBacktest(input(),strategy))
      .toEqual(runDeterministicBacktest(input(),strategy));
  });
  it("reconstructs input and rejects accessors without invoking them", () => {
    let calls=0;
    const malicious={ ...input(),get bars(){ calls+=1; return []; } };
    expect(runDeterministicBacktest(malicious,{ contractVersion: "strategy/v1",decide:()=>0 }))
      .toEqual({ ok:false,reason:"backtest_input_invalid" });
    expect(calls).toBe(0);
  });
  it.each([
    null,undefined,1,[],Symbol("x"),Object.assign(Object.create({ polluted:true }),input()),
  ])("rejects adversarial input %#", (value) => {
    expect(runDeterministicBacktest(value,{ contractVersion:"strategy/v1",decide:()=>0 }).ok)
      .toBe(false);
  });
  it("rejects non-finite and out-of-bound decisions", () => {
    for (const decision of [Number.NaN,Number.POSITIVE_INFINITY,-0.1,1.1]) {
      expect(runDeterministicBacktest(input(),{
        contractVersion:"strategy/v1",decide:()=>decision,
      })).toEqual({ ok:false,reason:"backtest_strategy_decision_invalid" });
    }
  });
  it("applies costs and slippage deterministically", () => {
    const value=input();
    value.configuration={ ...value.configuration,transactionCostBps:10,slippageBps:20 };
    const result=runDeterministicBacktest(value,{ contractVersion:"strategy/v1",decide:()=>0.5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metrics.totalCosts).toBeGreaterThan(0);
      expect(result.value.fills[0].price).toBe(120.24);
    }
  });
  it("publishes immutable content-addressed result evidence",async()=>{
    const result=runDeterministicBacktest(input(),{
      contractVersion:"strategy/v1",decide:()=>0.5,
    });
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    const root=await mkdtemp(path.join(os.tmpdir(),"phase6i-artifact-"));
    try{
      const storage=new ContentAddressedBacktestArtifactStorage(root);
      const published=await storage.publish({
        scope:{tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",accountId:"account"},
        experimentId:result.value.experimentId,executionId:result.value.executionId,
        runId:"run",result:result.value,
      });
      expect(published.ok).toBe(true);
      if(!published.ok)return;
      expect(published.value).toMatchObject({
        kind:"backtest_result",contentHash:expect.stringMatching(/^[a-f0-9]{64}$/),
        provenanceRef:{id:result.value.executionId,version:"v1"},
      });
      const key=`sha256/${published.value.contentHash.slice(0,2)}/`
        +`${published.value.contentHash}.json`;
      await expect(readFile(path.join(root,...key.split("/")),"utf8"))
        .resolves.toContain(result.value.executionId);
      const read=await storage.read(published.value);
      expect(read.ok).toBe(true);
      if(read.ok)expect(read.value.toString("utf8")).toContain(result.value.executionId);
      const reused=await storage.publish({
        scope:{tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",accountId:"account"},
        experimentId:result.value.experimentId,executionId:result.value.executionId,
        runId:"run",result:result.value,
      });
      expect(reused).toEqual(published);
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
