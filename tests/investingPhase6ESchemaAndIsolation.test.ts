import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260728130000_investing_research_dataset_catalog_phase6e.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "supabase/rollbacks/20260728130000_investing_research_dataset_catalog_phase6e.down.sql"), "utf8");

describe("Phase 6E additive schema and isolation", () => {
  it("uses exactly the five frozen data tables and no attempt/storage table", () => {
    for (const table of ["dataset_requests","acquisition_jobs","datasets","dataset_versions","dataset_lineage"]) expect(migration).toContain(`create table public.investing_research_${table}`);
    expect(migration).not.toContain("create table public.investing_research_acquisition_attempts");
    expect(migration).not.toContain("create table public.investing_research_storage_references");
  });
  it("enforces scoped attempt uniqueness and version foreign keys", () => {
    expect(migration).toContain("request_id, attempt");
    expect(migration).toContain("acquisition_job_id, acquisition_attempt");
    expect(migration.match(/tenant_id, owner_id, portfolio_id, account_id/g)?.length).toBeGreaterThan(15);
    expect(migration).toContain("investing_research_acquisition_stale_state_version");
  });
  it("enforces awaiting_quality and blocks research_ready", () => {
    expect(migration).toContain("quality_state = 'awaiting_quality'");
    expect(migration).toContain("'research_ready'");
    expect(migration).not.toMatch(/quality_state\s+in\s*\([^)]*research_ready/iu);
  });
  it("has RLS, minimum grants and fail-closed rollback", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain("grant select on table");
    expect(migration).not.toContain("grant insert on table public.investing_research");
    expect(rollback).toContain("rollback_refuses_preserved_evidence");
  });
  it("contains no Trading import or forbidden runtime surface", () => {
    const files = fs.readdirSync(path.join(root, "lib/investing/research"), { recursive: true })
      .filter((entry) => typeof entry === "string" && /^(datasets|data-agent|dataset-catalog)[\\/].*\.ts$/u.test(entry))
      .map((entry) => fs.readFileSync(path.join(root, "lib/investing/research", String(entry)), "utf8")).join("\n");
    expect(files).not.toMatch(/@\/lib\/trading|lib\/trading|from\s+["'][^"']*market\//u);
    expect(files).not.toMatch(/orders|positions|fills|accounting|use client|cron|pm2/iu);
  });
  it("does not alter frozen phase files or legacy snapshots", () => {
    expect(migration).not.toContain("investing_research_snapshots");
    expect(migration.match(/alter table public\.investing_accounts/gu)).toHaveLength(1);
  });
});
