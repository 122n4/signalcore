import { describe, expect, it } from "vitest";
import { isPlanActiveRecord, pickActivePlan } from "../lib/signalcore/planRepo";

describe("planRepo", () => {
  it("prefers active status plan even when a newer draft exists first", () => {
    const rows = [
      { id: "p3", status: "draft", created_at: "2026-02-25T10:00:00Z" },
      { id: "p2", status: "active", created_at: "2026-02-24T10:00:00Z" },
      { id: "p1", status: "draft", created_at: "2026-02-23T10:00:00Z" },
    ];
    expect(pickActivePlan(rows)?.id).toBe("p2");
  });

  it("accepts boolean active flags for legacy rows", () => {
    const rows = [
      { id: "newer-draft", is_active: false },
      { id: "legacy-active", is_active: true },
    ];
    expect(pickActivePlan(rows)?.id).toBe("legacy-active");
  });

  it("falls back to the first row when no active plan exists", () => {
    const rows = [
      { id: "latest-draft", status: "draft" },
      { id: "older-archived", status: "archived" },
    ];
    expect(pickActivePlan(rows)?.id).toBe("latest-draft");
  });

  it("handles empty input safely", () => {
    expect(pickActivePlan([])).toBe(null);
    expect(pickActivePlan(null)).toBe(null);
    expect(pickActivePlan(undefined)).toBe(null);
  });

  it("treats explicit active states as active and ignores invalid rows", () => {
    expect(isPlanActiveRecord({ status: "active" })).toBe(true);
    expect(isPlanActiveRecord({ is_active: true })).toBe(true);
    expect(isPlanActiveRecord({ active: true })).toBe(true);
    expect(isPlanActiveRecord({ status: "draft", id: "p1" })).toBe(false);
    expect(isPlanActiveRecord(null)).toBe(false);
    expect(isPlanActiveRecord(undefined)).toBe(false);
  });
});

