import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readInvestingPaperConfig } from "@/lib/investing/server/config";

const paperMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260719180000_investing_persistent_paper.sql"), "utf8");
const fundingMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260719190000_investing_paper_funding.sql"), "utf8");
const rlsMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260719200000_investing_rls_read_model.sql"), "utf8");

describe("Investing persistent Paper architecture", () => {
  it("fails configuration closed for Live and invalid environments", () => {
    expect(() => readInvestingPaperConfig({ NODE_ENV: "test", INVESTING_EXECUTION_ENVIRONMENT: "live" } as NodeJS.ProcessEnv)).toThrow("investing_live_execution_blocked");
    expect(() => readInvestingPaperConfig({ NODE_ENV: "test", INVESTING_EXECUTION_ENVIRONMENT: "simulation" } as NodeJS.ProcessEnv)).toThrow("investing_execution_environment_invalid");
    expect(readInvestingPaperConfig({ NODE_ENV: "test", INVESTING_EXECUTION_ENVIRONMENT: "paper" } as NodeJS.ProcessEnv).environment).toBe("paper");
  });

  it("defines persistent submit, fill, cancel, reconciliation and recovery callers", () => {
    for (const rpc of [
      "investing_submit_paper_order_v2",
      "investing_ack_paper_order_v2",
      "investing_record_paper_fill_v2",
      "investing_cancel_paper_order_v2",
      "investing_start_paper_reconciliation_v2",
      "investing_reconcile_paper_order_v2",
      "investing_recover_stuck_paper_v2",
    ]) {
      expect(paperMigration).toContain(`create or replace function public.${rpc}`);
      expect(paperMigration).toMatch(new RegExp(`revoke all on function public\\.${rpc}\\([^;]+ from public,anon,authenticated;`));
      expect(paperMigration).toMatch(new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to service_role;`));
    }
    expect(paperMigration).toContain("for update");
    expect(paperMigration).toContain("pg_advisory_xact_lock");
    expect(paperMigration).toContain("cumulative_filled_quantity");
    expect(paperMigration).toContain("investing_fill_exceeds_order_quantity");
    expect(paperMigration).toContain("investing_insufficient_cash");
    expect(paperMigration).toContain("investing_insufficient_position");
  });

  it("provisions Paper cash explicitly and keeps browser writes revoked", () => {
    expect(fundingMigration).toContain("investing_open_paper_account_v2");
    expect(fundingMigration).toContain("paper_funding_equity");
    expect(rlsMigration).toContain("from anon,authenticated");
    expect(rlsMigration).not.toContain("for insert to authenticated");
  });
});
