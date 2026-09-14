import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");
const rollbacksRoot = path.join(repoRoot, "supabase", "rollbacks");

const forbiddenPreGenesisInvestingMigrations = [
  "20260707190000_create_investing_core_tables.sql",
  "20260717110000_create_investing_audit_tables.sql",
  "20260719120000_investing_financial_architecture.sql",
  "20260719170000_investing_phase0_containment.sql",
  "20260719180000_investing_persistent_paper.sql",
  "20260719190000_investing_paper_funding.sql",
  "20260719200000_investing_rls_read_model.sql",
  "20260719210000_investing_append_only_reconciliation_fix.sql",
  "20260719220000_investing_cash_and_corporate_actions.sql",
  "20260719230000_investing_corporate_action_reconciliation.sql",
  "20260719240000_investing_recovery_consistency.sql",
  "20260719250000_investing_submit_idempotent_replay.sql",
  "20260719260000_investing_reconciliation_resolutions.sql",
  "20260719270000_investing_resolution_severity_vocabulary.sql",
  "20260719280000_investing_fill_semantic_idempotency.sql",
  "20260719290000_investing_pgcrypto_schema_qualification.sql",
  "20260720100000_investing_engine_v1_persistence.sql",
  "20260721120000_investing_engine_v1_authorization_shape_guard.sql",
  "20260721180000_investing_engine_phase4b_r2_root_sealing.sql",
  "20260721220000_investing_engine_phase4b_r3_boundary_hardening.sql",
  "20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql",
  "20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.sql",
  "20260725120000_investing_identity_schema_recovery.sql",
  "20260728130000_investing_research_dataset_catalog_phase6e.sql",
  "20260728210000_investing_research_dataset_quality_phase6f.sql",
  "20260729100000_investing_research_acquisition_orchestration_phase6g.sql",
  "20260730100000_investing_research_hypotheses_candidates_phase6h.sql",
  "20260731100000_investing_research_backtesting_phase6i.sql",
  "20260801100000_investing_research_scientific_validation_phase6j.sql",
  "20260802100000_investing_research_portfolio_risk_capacity_phase6k.sql",
  "20260803100000_investing_research_scientific_memory_phase6l.sql",
  "20260804100000_investing_research_controlled_promotion_phase6m.sql",
  "20260804150000_investing_real_onboarding.sql",
  "20260805100000_investing_research_beta_readiness_phase7b.sql",
  "20260806100000_investing_release_effective_readiness_phase7e.sql",
  "20260807100000_investing_beta_activation_boundary_phase7g.sql",
  "20260808100000_investing_shadow_parity_phase7_residual.sql",
  "20260808110000_investing_paper_account_identity_scope_fix.sql",
  "20260808120000_investing_legacy_paper_import.sql",
  "20260808121000_investing_legacy_paper_import_fill_scope_fix.sql",
  "20260808122000_investing_legacy_paper_import_digest_fix.sql",
  "20260809200000_investing_dashboard_compact_rpc.sql",
  "20260810120000_investing_market_snapshots.sql",
  "20260811160000_investing_opening_positions.sql",
  "20260811170000_investing_tracking_accounts.sql",
  "20260811171000_investing_dashboard_tracking_account.sql",
  "20260812120000_investing_ui_state.sql",
  "20260812131000_qualify_new_investing_pgcrypto_digest_calls.sql",
  "20260812132000_drop_broken_remote_investing_onboarding_rpcs.sql",
  "20260812133000_investing_db_security_hardening_phase1.sql",
  "20260813201607_investing_split_effective_time_truth.sql",
  "20260816202000_investing_canonical_plan_persistence_schema.sql",
  "20260817023650_investing_canonical_plan_persistence_writer.sql",
] as const;

const forbiddenPreGenesisInvestingRollbacks = [
  "20260720100000_investing_engine_v1_persistence.down.sql",
  "20260721120000_investing_engine_v1_authorization_shape_guard.down.sql",
  "20260721180000_investing_engine_phase4b_r2_root_sealing.down.sql",
  "20260721220000_investing_engine_phase4b_r3_boundary_hardening.down.sql",
  "20260721230000_investing_engine_phase4b_r4_final_conditions_closure.down.sql",
  "20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.down.sql",
] as const;

const requiredZeroGenesisBoundary = [
  "20260822125631_teardown_all_investing_runtime.sql",
  "20260822140357_remove_capitalized_investing_portfolio_residuals.sql",
  "20260822140500_recover_zero_genesis_shared_preconditions.sql",
  "20260822141129_assert_investing_runtime_zero_genesis_boundary.sql",
  "20260822143241_drop_retired_investing_defaults.sql",
  "20260822143442_remove_retired_investing_from_shared_mode_constraints.sql",
  "20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql",
] as const;

const requiredGenesisMigrations = [
  "20260825120000_investing_genesis_i2_authority_materialization.sql",
  "20260825123000_investing_genesis_i2_authorized_context.sql",
  "20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql",
  "20260831221500_investing_genesis_i2_ledger_schema.sql",
  "20260909100000_investing_i5_research_authority_audit_contract.sql",
  "20260910120000_investing_i5_a1_research_investigation_persistence.sql",
  "20260910130000_investing_i5_a2_research_draft_persistence.sql",
  "20260911110000_investing_i5_research_runtime_lock_contract_repair.sql",
  "20260912050000_investing_i5_a3_research_material_revisions.sql",
  "20260912070000_investing_i5_a4_research_spec_persistence.sql",
] as const;

const requiredTradingMigrations = [
  "20260509090000_create_trading_scanner_snapshots.sql",
  "20260517130000_create_trading_followed_positions.sql",
  "20260701110000_enable_rls_on_trading_core_tables.sql",
  "20260713193000_harden_paper_trading_pipeline.sql",
  "20260809190000_trading_paper_history_compact_rpc.sql",
  "20260812130000_enable_rls_on_ops_and_trading_aux_tables.sql",
] as const;

function migrationExists(file: string): boolean {
  return fs.existsSync(path.join(migrationsRoot, file));
}

function rollbackExists(file: string): boolean {
  return fs.existsSync(path.join(rollbacksRoot, file));
}

describe("Investing pre-Genesis source purge", () => {
  it("keeps the deletion contract explicit and complete", () => {
    expect(forbiddenPreGenesisInvestingMigrations).toHaveLength(53);
    expect(forbiddenPreGenesisInvestingRollbacks).toHaveLength(6);
  });

  it("removes every pre-Genesis Investing migration from the current source tree", () => {
    for (const file of forbiddenPreGenesisInvestingMigrations) {
      expect(migrationExists(file), file).toBe(false);
    }
  });

  it("removes every residual pre-Genesis Investing rollback from the current source tree", () => {
    for (const file of forbiddenPreGenesisInvestingRollbacks) {
      expect(rollbackExists(file), file).toBe(false);
    }
  });

  it("preserves the Zero-Genesis retirement boundary", () => {
    for (const file of requiredZeroGenesisBoundary) {
      expect(migrationExists(file), file).toBe(true);
    }
  });

  it("preserves current Genesis and I5 migration authority", () => {
    for (const file of requiredGenesisMigrations) {
      expect(migrationExists(file), file).toBe(true);
    }
  });

  it("does not delete Trading migration history", () => {
    for (const file of requiredTradingMigrations) {
      expect(migrationExists(file), file).toBe(true);
    }
  });
});
