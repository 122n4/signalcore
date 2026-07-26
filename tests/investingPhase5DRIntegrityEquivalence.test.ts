import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  INVESTING_ENGINE_PHASE4C_INTEGRITY_REASON_CODES as runtimeReasons,
  InvestingEnginePhase4CIntegrityScanner as RuntimeScanner,
  analyzeInvestingEnginePhase4CInventory as runtimeAnalyze,
} from "@/lib/investing/engine/v1/integrity/scanner.server";
import {
  INVESTING_ENGINE_PHASE4C_INTEGRITY_REASON_CODES as qaReasons,
  InvestingEnginePhase4CIntegrityScanner as QaScanner,
  analyzeInvestingEnginePhase4CInventory as qaAnalyze,
} from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";

describe("FASE 5D-R integrity core equivalence", () => {
  it("makes QA consume the exact runtime implementation", () => {
    expect(QaScanner).toBe(RuntimeScanner);
    expect(qaAnalyze).toBe(runtimeAnalyze);
    expect(qaReasons).toBe(runtimeReasons);
  });
});
