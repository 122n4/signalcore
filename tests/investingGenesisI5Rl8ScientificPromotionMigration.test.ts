import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260928195500_investing_i5_rl8_scientific_promotion_v1.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

describe("I5 RL-8 scientific promotion persistence migration", () => {
  it("creates append-only protocol and transition scientific identity tables", () => {
    expect(sql).toContain("create table investing.research_scientific_promotion_protocols");
    expect(sql).toContain("create table investing.research_scientific_promotion_transitions");
    expect(sql).toContain("research_scientific_promotion_protocols_append_only");
    expect(sql).toContain("research_scientific_promotion_transitions_append_only");
    expect(sql).toContain("research scientific promotion transitions are append-only");
  });

  it("binds exact RL-8 domains, non-circular chain keys, root uniqueness and single successor", () => {
    expect(sql).toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
    expect(sql).toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
    expect(sql).toContain("chain_key");
    expect(sql).toContain("research_scientific_promotion_transitions_root_unique");
    expect(sql).toContain("research_scientific_promotion_transitions_root_authority_unique");
    expect(sql).toContain("research_scientific_promotion_transitions_root_authority_fk");
    expect(sql).toContain("research_scientific_promotion_transitions_single_successor");
    expect(sql).toContain("research_scientific_promotion_transitions_one_root_per_chain_key");
    expect(sql).toContain("where predecessor_transition_id is null");
    expect(sql).toContain("research_scientific_promotion_transitions_one_successor_per_predecessor");
    expect(sql).toContain("where predecessor_transition_id is not null");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("DIVERGENT_EXISTING_IDENTITY");
  });

  it("freezes cross-chain supersession storage and fail-closed validation hooks", () => {
    expect(sql).toContain("superseded_by_successor_protocol_hash_hex");
    expect(sql).toContain("superseded_by_successor_root_transition_id");
    expect(sql).toContain("superseded_by_successor_root_hash_hex");
    expect(sql).toContain("research_scientific_promotion_transitions_successor_root_fk");
    expect(sql).toContain("research_scientific_promotion_transitions_single_cross_chain");
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_SUCCESSOR_ROOT_AUTHORITY_FAILURE");
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_SUPERSESSION_CYCLE");
    expect(sql).toContain("predecessor_transition_id is null");
    expect(sql).toContain("predecessor_state is null");
  });

  it("allows protocol reuse by separate Investigations in one tenant without leaking authority", () => {
    expect(sql).toContain("unique (tenant_id, research_investigation_id, hash_algorithm, hash_domain, hash_version, hash_hex)");
    expect(sql).toContain("where tenant_id = v_tenant_id and research_investigation_id = v_research_investigation_id and hash_hex = p_hash_hex");
    expect(sql).toContain("v_tenant_id::text || ':' || v_research_investigation_id::text || ':RL8_PROTOCOL:'");
  });

  it("physically proves predecessor/root relationships before insert", () => {
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_PREDECESSOR_AUTHORITY_FAILURE");
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_PREDECESSOR_STATE_MISMATCH");
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_ROOT_AUTHORITY_FAILURE");
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_CHAIN_KEY_BINDING_FAILURE");
    expect(sql).toContain("p_canonical_payload #>> '{chainKey}' is distinct from p_chain_key");
    expect(sql).toContain("p_canonical_payload #>> '{protocol,hashHex}' is distinct from p_protocol_hash_hex");
    expect(sql).toContain("and chain_key = p_chain_key");
    expect(sql).toContain("and protocol_hash_hex = p_protocol_hash_hex");
  });

  it("requires cross-chain supersession to replace protocol methodology", () => {
    expect(sql).toContain("RL8_SCIENTIFIC_PROMOTION_SUPERSESSION_REQUIRES_PROTOCOL_CHANGE");
    expect(sql).toContain("p_superseded_by_successor_protocol_hash_hex = p_protocol_hash_hex");
  });

  it("enforces owner role, RLS, FORCE RLS and no public mutation authority", () => {
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on investing.research_scientific_promotion_protocols from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on investing.research_scientific_promotion_transitions from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select, insert on investing.research_scientific_promotion_protocols to investing_app");
    expect(sql).toContain("grant select, insert on investing.research_scientific_promotion_transitions to investing_app");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("grant delete");
  });

  it("uses security invoker persistence functions and poststate drift checks", () => {
    expect(sql).toContain("persist_research_scientific_promotion_protocol_v1");
    expect(sql).toContain("record_research_scientific_promotion_transition_v1");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("SECURITY DEFINER function drift");
    expect(sql).toContain("RL-8 scientific promotion table owner drift");
    expect(sql).toContain("RL-8 scientific promotion RLS/FORCE RLS drift");
    expect(sql).toContain("RL-8 scientific promotion forbidden grants drift");
  });
});
