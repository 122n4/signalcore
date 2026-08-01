import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260808120000_investing_legacy_paper_import.sql"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/investing/paper/import-legacy/route.ts"), "utf8");

describe("controlled legacy Paper import", () => {
  it("is service-role-only, idempotent and fail-closed over existing canonical activity", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("legacy-import:");
    expect(sql).toContain("investing_legacy_import_canonical_not_empty");
    expect(sql).toContain("investing_legacy_import_activity_exists");
    expect(sql).toContain("revoke all on function");
    expect(sql).toContain("grant execute on function");
  });

  it("records balanced opening equity without activating Live", () => {
    expect(sql).toContain("'investment_asset_import','debit'");
    expect(sql).toContain("'paper_import_equity','credit'");
    expect(sql).toContain("'paper'");
    expect(sql).not.toContain("'live'");
  });

  it("requires an authenticated explicit confirmation boundary", () => {
    expect(route).toContain("getRequestUserId");
    expect(route).toContain('confirmation !== "IMPORT_LEGACY_PAPER"');
    expect(route).toContain('action !== "import_legacy_paper"');
  });
});
