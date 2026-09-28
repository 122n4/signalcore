import { describe, expect, it } from "vitest";
import { aggregateExperimentComparisonV1 } from "../lib/investing/research/experimentComparisonAggregate";

describe("I5 RL-7 comparison aggregate", () => {
  it("wires complete stable evidence into stable classification", () => {
    const aggregate = aggregateExperimentComparisonV1({
      primaryMetricId: "SHARPE_RATIO",
      aggregateOosOrientedDeltaSign: 1,
      folds: [{id:"f1",orientedDeltaSign:1},{id:"f2",orientedDeltaSign:0},{id:"f3",orientedDeltaSign:1}],
      neighborhoodMembers: [{id:"s",orientedDeltaSign:1},{id:"n1",orientedDeltaSign:0},{id:"n2",orientedDeltaSign:1}],
      diagnostics: [], failure: null,
    });
    expect(aggregate.decision.classification).toBe("ROBUSTNESS_STABLE");
    expect(aggregate).toMatchObject({completeFoldCount:3,degradedFoldCount:0,neighborhoodMemberCount:3,degradedMemberCount:0});
  });

  it("turns missing primary OOS metric into insufficient evidence, never zero evidence", () => {
    const aggregate = aggregateExperimentComparisonV1({
      primaryMetricId:"CAGR", aggregateOosOrientedDeltaSign:null,
      folds:[{id:"f1",orientedDeltaSign:1},{id:"f2",orientedDeltaSign:1},{id:"f3",orientedDeltaSign:1}],
      neighborhoodMembers:[{id:"s",orientedDeltaSign:1},{id:"n1",orientedDeltaSign:1},{id:"n2",orientedDeltaSign:1}],
      diagnostics:[], failure:null,
    });
    expect(aggregate.decision.classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(aggregate.decision.diagnostics).toContain("METRIC_UNAVAILABLE");
  });

  it("derives insufficient validation and neighborhood diagnostics from counts", () => {
    const aggregate=aggregateExperimentComparisonV1({primaryMetricId:"CAGR",aggregateOosOrientedDeltaSign:1,folds:[{id:"f1",orientedDeltaSign:1}],neighborhoodMembers:[{id:"s",orientedDeltaSign:1}],diagnostics:[],failure:null});
    expect(aggregate.decision.classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(aggregate.decision.diagnostics).toEqual(expect.arrayContaining(["INCOMPLETE_VALIDATION","INSUFFICIENT_PARAMETER_NEIGHBORHOOD"]));
  });

  it("preserves fail-closed authority failure outside classification", () => {
    const aggregate=aggregateExperimentComparisonV1({primaryMetricId:"CAGR",aggregateOosOrientedDeltaSign:1,folds:[],neighborhoodMembers:[],diagnostics:[],failure:"AUTHORITY_FAILURE"});
    expect(aggregate.decision).toMatchObject({classification:null,failure:"AUTHORITY_FAILURE"});
  });
});
