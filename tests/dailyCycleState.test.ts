import { describe, expect, it } from "vitest";
import { resolveDoneToday } from "../lib/signalcore/dailyCycleState";

describe("dailyCycleState", () => {
  it("keeps doneToday true immediately after close day using optimistic day key", () => {
    const out = resolveDoneToday({
      serverDoneToday: false,
      optimisticClosedDayKey: "2026-02-28",
      nowIso: "2026-02-28T10:05:00.000Z",
    });
    expect(out).toBe(true);
  });

  it("expires optimistic close override when UTC day changes", () => {
    const out = resolveDoneToday({
      serverDoneToday: false,
      optimisticClosedDayKey: "2026-02-27",
      nowIso: "2026-02-28T00:01:00.000Z",
    });
    expect(out).toBe(false);
  });

  it("respects server doneToday even without optimistic override", () => {
    const out = resolveDoneToday({
      serverDoneToday: true,
      optimisticClosedDayKey: null,
      nowIso: "2026-02-28T10:05:00.000Z",
    });
    expect(out).toBe(true);
  });
});

