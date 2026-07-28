import { describe, expect, it } from "vitest";
import { ACQUISITION_STATES, transitionAcquisitionState } from "@/lib/investing/research/datasets";

describe("Phase 6E acquisition lifecycle", () => {
  it("keeps requested, acquired_raw, normalized and awaiting_quality distinct", () => {
    expect(transitionAcquisitionState("requested", "acquired_raw").ok).toBe(false);
    expect(transitionAcquisitionState("acquiring", "acquired_raw").ok).toBe(true);
    expect(transitionAcquisitionState("acquired_raw", "normalized").ok).toBe(true);
    expect(transitionAcquisitionState("normalized", "awaiting_quality").ok).toBe(true);
  });
  it("separates provider unavailable, no data and failed", () => {
    expect(transitionAcquisitionState("acquiring", "provider_unavailable").ok).toBe(true);
    expect(transitionAcquisitionState("provider_unavailable", "confirmed_no_data").ok).toBe(false);
    expect(transitionAcquisitionState("acquisition_failed", "acquiring").ok).toBe(false);
  });
  it("never exposes later-phase states and never reopens terminals", () => {
    expect(ACQUISITION_STATES).not.toContain("research_ready");
    for (const terminal of ["awaiting_quality","confirmed_no_data","provider_unavailable","acquisition_failed","cancelled"] as const) {
      expect(transitionAcquisitionState(terminal, "acquiring").ok).toBe(false);
    }
  });
});
