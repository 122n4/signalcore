import { describe, expect, it } from "vitest";

import { buildInvestingHistoricalAudit } from "@/lib/investing/historyAudit";

describe("buildInvestingHistoricalAudit", () => {
  it("summarizes persisted mandate, rebalance and research history", () => {
    const audit = buildInvestingHistoricalAudit({
      mandateSnapshots: [
        {
          as_of: "2026-07-16T08:00:00.000Z",
          mandate_fingerprint: "mandate_a",
          objective: "growth",
          inputs: { benchmarkId: "growth_60_40" },
        },
      ],
      rebalanceLedger: [
        {
          as_of: "2026-07-16T08:00:00.000Z",
          status: "proposed",
          valuation_context: { gross_turnover_pct: 14 },
          reason_codes: ["benchmark aligned", "turnover within band"],
        },
        {
          as_of: "2026-07-17T08:00:00.000Z",
          status: "blocked",
          valuation_context: { gross_turnover_pct: 32 },
          reason_codes: ["manual_review_required"],
        },
      ],
      researchSnapshots: [
        {
          as_of: "2026-07-16T08:00:00.000Z",
          mandate_fingerprint: "mandate_a",
          benchmark_id: "growth_60_40",
          status: "review",
          summary: {
            overlapWeightPct: 74,
            activeSharePct: 18,
            concentrationDriftPct: 11,
            turnoverPct: 12,
          },
          research_payload: {
            benchmarkValidation: {
              activeBets: [{ symbol: "SPY" }, { symbol: "QQQ" }],
            },
            instrumentScorecards: [
              { symbol: "SPY", warnings: [] },
              { symbol: "QQQ", warnings: ["concentration_watch"] },
            ],
          },
        },
        {
          as_of: "2026-07-17T08:00:00.000Z",
          mandate_fingerprint: "mandate_a",
          benchmark_id: "growth_60_40",
          status: "pass",
          summary: {
            overlapWeightPct: 78,
            activeSharePct: 14,
            concentrationDriftPct: 8,
            turnoverPct: 10,
          },
          research_payload: {
            benchmarkValidation: {
              activeBets: [{ symbol: "SPY" }],
            },
            instrumentScorecards: [
              { symbol: "SPY", warnings: [] },
            ],
          },
        },
      ],
    });

    expect(audit.coverage).toMatchObject({
      mandateSnapshots: 1,
      rebalanceLedger: 2,
      researchSnapshots: 2,
    });
    expect(audit.latest).toMatchObject({
      benchmarkId: "growth_60_40",
      objective: "growth",
      researchStatus: "pass",
    });
    expect(audit.summary.validationStatuses).toMatchObject({
      review: 1,
      pass: 1,
    });
    expect(audit.summary.rebalanceStatuses).toMatchObject({
      proposed: 1,
      blocked: 1,
    });
    expect(audit.summary.stabilityStatus).toBe("unstable");
    expect(audit.summary.averageTurnoverPct).toBeGreaterThan(10);
    expect(audit.reasonCodeCounts.manual_review_required).toBe(1);
    expect(audit.topWarnings).toEqual([{ key: "QQQ:concentration_watch", count: 1 }]);
    expect(audit.topActiveBets[0]).toEqual({ symbol: "SPY", count: 2 });
  });
});
