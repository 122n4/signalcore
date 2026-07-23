import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(path.resolve(
  process.cwd(),
  "supabase/migrations/20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.sql",
), "utf8").toLowerCase();
const rollback = readFileSync(path.resolve(
  process.cwd(),
  "supabase/rollbacks/20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.down.sql",
), "utf8").toLowerCase();
const runbook = readFileSync(path.resolve(
  process.cwd(),
  "docs/INVESTING_ENGINE_PHASE4B_R5_EMPTY_STATE_TRANSITION_GATE.md",
), "utf8").toLowerCase();

describe("FASE 4B-R5 empty-state transition gate", () => {
  it("counts every persistence table and makes zero rows the only admission state", () => {
    for (const table of [
      "investing_engine_runs",
      "investing_engine_artifacts",
      "investing_engine_phase_summaries",
      "investing_engine_reason_evidence",
      "investing_engine_shadow_packages",
      "investing_engine_idempotency_keys",
    ]) {
      expect(migration).toContain(`from public.${table}`);
    }
    expect(migration).toContain("when total_relevant_rows = 0 then 'historical_set_empty'");
    expect(migration).toContain("else 'historical_set_blocked'");
    expect(migration).not.toContain("historical_set_canonical");
  });

  it("does not duplicate either canonical verifier", () => {
    expect(migration).not.toContain("investing_engine_canonical_raw_valid_v1");
    expect(migration).not.toContain("investing_engine_authorization_shape_valid_v1");
  });

  it("keeps rollback fail-closed and requires a separately provisioned clean database", () => {
    expect(rollback).toContain("errcode = '55000'");
    expect(rollback).not.toContain("create or replace function public.investing_engine_historical_gate_v1");
    expect(runbook).toContain("new empty database");
    expect(runbook).toContain("do not drop, truncate, convert, or reuse");
    expect(runbook).toContain("historical_set_empty");
  });
});
