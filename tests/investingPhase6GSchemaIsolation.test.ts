import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 6G schema and isolation", () => {
  const migration = fs.readFileSync(path.join(process.cwd(),
    "supabase/migrations/20260729100000_investing_research_acquisition_orchestration_phase6g.sql"), "utf8");
  it("extends only acquisition jobs and enforces database-clock fencing", () => {
    expect(migration).toContain("alter table public.investing_research_acquisition_jobs");
    expect(migration).toContain("statement_timestamp()");
    expect(migration).toContain("fencing_token");
    expect(migration).toContain("revoke update on public.investing_research_acquisition_jobs from service_role");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("investing_research_acquisition_retry_v1");
    expect(migration).toContain("retry_backoff_seconds");
    expect(migration).toContain("execution_timeout_seconds");
    expect(migration).toContain("state='acquired_raw' and p_next_state in ('normalized','acquisition_failed')");
    expect(migration).toContain("state='normalized' and p_next_state in ('awaiting_quality','acquisition_failed')");
    expect(migration).not.toMatch(/create table public\.investing_research_/u);
  });
  it("does not materialize future science or touch Trading", () => {
    expect(migration).not.toMatch(/hypotheses|candidates|experiment_runs|investing_research_jobs/u);
    const files = fs.readdirSync(path.join(process.cwd(), "lib/investing/research/orchestration"))
      .map((name) => fs.readFileSync(path.join(process.cwd(), "lib/investing/research/orchestration", name), "utf8"))
      .join("\n");
    expect(files).not.toMatch(/from ["'][^"']*trading|react|use client|pm2|cron|broker/iu);
  });
});
