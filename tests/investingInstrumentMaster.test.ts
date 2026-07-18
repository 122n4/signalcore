import { describe, expect, it } from "vitest";

import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing";

describe("investing instrument master", () => {
  it("exposes a canonical approved universe with governance metadata", () => {
    const instruments = getCanonicalInvestingInstrumentMaster();
    const symbols = instruments.map((instrument) => instrument.symbol);

    expect(symbols).toEqual(["VWCE", "SPY", "AGGH", "GLD"]);
    expect(instruments.every((instrument) => instrument.enabled === true)).toBe(true);
    expect(instruments.every((instrument) => instrument.qualityStatus === "approved")).toBe(true);
    expect(instruments.every((instrument) => instrument.taxTreatment)).toBe(true);
  });
});

