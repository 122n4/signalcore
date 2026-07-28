import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = path.join(root, "supabase/migrations/20260728210000_investing_research_dataset_quality_phase6f.sql");
const rollback = path.join(root, "supabase/rollbacks/20260728210000_investing_research_dataset_quality_phase6f.down.sql");

describe("Phase 6F schema and isolation", () => {
  it("uses additive immutable reports, scoped FKs, RLS and fail-closed rollback", async () => {
    const [up, down] = await Promise.all([readFile(migration, "utf8"), readFile(rollback, "utf8")]);
    expect(up).toContain("create table public.investing_research_dataset_quality_reports");
    expect(up).toContain("source_dataset_version_id");
    expect(up).toContain("quality_report_id");
    expect(up).toContain("force row level security");
    expect(up).toContain("investing_research_quality_publication_guard");
    expect(up).toContain("quality_state = 'research_ready'");
    expect(up).not.toMatch(/investing_research_(orders|positions|fills|accounting)/u);
    expect(down).toContain("phase6f_rollback_refused_quality_data_exists");
  });
  it("keeps the neutral barrel free of server implementations and Trading dependencies", async () => {
    const files = [
      "lib/investing/research/dataset-quality/index.ts",
      "lib/investing/research/dataset-quality/gates.server.ts",
      "lib/investing/research/dataset-quality/service.server.ts",
      "lib/investing/research/dataset-quality/composition.server.ts",
    ];
    const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));
    expect(contents[0]).not.toMatch(/\.server/u);
    expect(contents.join("\n")).not.toMatch(/from ["'][^"']*trading/iu);
    expect(contents.join("\n")).not.toMatch(/react|use client|queue|pm2|cron|broker|promotion/iu);
  });
});
