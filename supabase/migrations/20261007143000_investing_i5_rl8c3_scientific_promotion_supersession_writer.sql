begin;

set local role investing_owner;

create or replace function investing.rl8c_assert_writer_authority_v1(p_expected_operation text)
returns table (
  tenant_id uuid,
  principal_id uuid,
  tenant_membership_id uuid,
  research_investigation_id uuid
)
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  if p_expected_operation not in (
    'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1'
  ) then
    raise exception 'FORBIDDEN_OPERATION';
  end if;

  if current_setting('syntrake.investing.operation', true) <> p_expected_operation
    or current_setting('syntrake.investing.capability', true) <> 'RESEARCH_MUTATE'
  then
    raise exception 'AUTHORITY_FAILURE';
  end if;

  select count(*) into v_count
  from investing.tenant_memberships tm
  join investing.research_investigations ri
    on ri.tenant_id = tm.tenant_id
   and ri.principal_id = tm.principal_id
   and ri.tenant_membership_id = tm.tenant_membership_id
   and ri.operation_scope = 'TENANT_SCOPE'
   and ri.source_context = 'PURE_RESEARCH'
  where tm.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tm.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tm.principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tm.role = 'OWNER'
    and tm.state = 'ACTIVE'
    and ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true);

  if v_count <> 1 then
    raise exception 'AUTHORITY_FAILURE';
  end if;

  return query
  select tm.tenant_id, tm.principal_id, tm.tenant_membership_id, ri.research_investigation_id
  from investing.tenant_memberships tm
  join investing.research_investigations ri
    on ri.tenant_id = tm.tenant_id
   and ri.principal_id = tm.principal_id
   and ri.tenant_membership_id = tm.tenant_membership_id
   and ri.operation_scope = 'TENANT_SCOPE'
   and ri.source_context = 'PURE_RESEARCH'
  where tm.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tm.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tm.principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tm.role = 'OWNER'
    and tm.state = 'ACTIVE'
    and ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true);
end;
$$;

create or replace function investing.rl8c_supersession_cycle_reaches_v1(
  p_start_transition_identity_id uuid,
  p_forbidden_transition_identity_id uuid
) returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  with recursive walk(transition_id, depth) as (
    select p_start_transition_identity_id, 0
    union all
    select next_node.transition_id, walk.depth + 1
    from walk
    join lateral (
      select successor.research_scientific_promotion_transition_identity_id as transition_id
      from investing.research_scientific_promotion_transitions_scientific_identities successor
      where successor.predecessor_transition_identity_id = walk.transition_id
      union
      select superseded.superseded_by_successor_root_transition_identity_id as transition_id
      from investing.research_scientific_promotion_transitions_scientific_identities superseded
      where superseded.research_scientific_promotion_transition_identity_id = walk.transition_id
        and superseded.resulting_state = 'SUPERSEDED'
        and superseded.superseded_by_successor_root_transition_identity_id is not null
    ) next_node on walk.depth < 64
  )
  select exists(select 1 from walk where transition_id = p_forbidden_transition_identity_id)
$$;

revoke all on function investing.rl8c_supersession_cycle_reaches_v1(uuid, uuid) from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.rl8c_supersession_cycle_reaches_v1(uuid, uuid) to investing_rl8_writer;

reset role;

grant investing_rl8_writer to postgres with inherit false, set true;

set local role investing_owner;
grant create on schema investing to investing_rl8_writer;
reset role;

set local role investing_rl8_writer;

drop function if exists investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb);

create or replace function investing.persist_research_scientific_promotion_supersession_v1(
  p_predecessor_transition_identity_id uuid,
  p_superseded_transition_hash_hex text,
  p_superseded_canonical_payload jsonb,
  p_successor_protocol_identity_id uuid,
  p_successor_root_transition_identity_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth record;
  v_predecessor record;
  v_existing_successor record;
  v_existing_by_hash record;
  v_successor_protocol record;
  v_successor_root record;
  v_transition_id uuid;
  v_computed_hash text;
  v_successor_protocol_hash text;
  v_successor_root_hash text;
begin
  select * into v_auth from investing.rl8c_assert_writer_authority_v1('RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1');

  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', p_superseded_canonical_payload);
  if v_computed_hash <> p_superseded_transition_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;


  select * into v_predecessor
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = p_predecessor_transition_identity_id
    and tenant_id = v_auth.tenant_id
    and research_investigation_id = v_auth.research_investigation_id
    and principal_id = v_auth.principal_id
    and tenant_membership_id = v_auth.tenant_membership_id;
  if v_predecessor.research_scientific_promotion_transition_identity_id is null then raise exception 'WRONG_LINEAGE'; end if;
  if v_predecessor.resulting_state not in ('EXECUTED','INSUFFICIENT_EVIDENCE','PROMOTION_ELIGIBLE','REJECTED') then raise exception 'FORBIDDEN_TRANSITION'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL8C_PROTOCOL:' || v_predecessor.research_scientific_promotion_protocol_identity_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL8C_ROOT:' || v_predecessor.tenant_id::text || ':' || v_predecessor.research_investigation_id::text || ':' || v_predecessor.protocol_hash_hex || ':' || v_predecessor.subject_experiment_hash_hex || ':' || v_predecessor.subject_experiment_parameters_hash_hex || ':' || v_predecessor.subject_research_ir_hash_hex, 0));

  if p_superseded_canonical_payload->>'predecessorState' <> v_predecessor.resulting_state
    or p_superseded_canonical_payload->>'resultingState' <> 'SUPERSEDED'
    or p_superseded_canonical_payload->'predecessorTransition'->>'hashHex' <> v_predecessor.transition_hash_hex
    or p_superseded_canonical_payload->'supersedes'->>'hashHex' <> v_predecessor.transition_hash_hex
    or p_superseded_canonical_payload->'rejectedTransition' <> 'null'::jsonb
    or p_superseded_canonical_payload->'evidenceSnapshot' <> v_predecessor.canonical_payload->'evidenceSnapshot'
    or p_superseded_canonical_payload->'gateOutcomes' <> v_predecessor.canonical_payload->'gateOutcomes'
    or p_superseded_canonical_payload->'transitionReasons' <> '["SUPERSEDED_EVIDENCE"]'::jsonb
    or p_superseded_canonical_payload->'supersededByChain' is null
    or p_superseded_canonical_payload->'supersededByChain' = 'null'::jsonb
  then
    raise exception 'WRONG_LINEAGE';
  end if;

  v_successor_protocol_hash := investing.rl8c_required_hash_v1(p_superseded_canonical_payload, array['supersededByChain','successorProtocol','hashHex']);
  v_successor_root_hash := investing.rl8c_required_hash_v1(p_superseded_canonical_payload, array['supersededByChain','successorRootTransition','hashHex']);
  if v_successor_protocol_hash is null or v_successor_root_hash is null then raise exception 'WRONG_LINEAGE'; end if;

  if v_successor_protocol_hash = v_predecessor.protocol_hash_hex then raise exception 'FORBIDDEN_TRANSITION'; end if;
  if v_successor_root_hash = v_predecessor.transition_hash_hex or v_successor_root_hash = p_superseded_transition_hash_hex then raise exception 'FORBIDDEN_TRANSITION'; end if;

  select * into v_successor_protocol
  from investing.research_scientific_promotion_protocols_scientific_identities
  where research_scientific_promotion_protocol_identity_id = p_successor_protocol_identity_id
    and hash_hex = v_successor_protocol_hash;
  if v_successor_protocol.research_scientific_promotion_protocol_identity_id is null then raise exception 'WRONG_SUCCESSOR_PROTOCOL'; end if;

  select * into v_successor_root
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = p_successor_root_transition_identity_id
    and transition_hash_hex = v_successor_root_hash
    and tenant_id = v_predecessor.tenant_id
    and research_investigation_id = v_predecessor.research_investigation_id
    and research_scientific_promotion_protocol_identity_id = v_successor_protocol.research_scientific_promotion_protocol_identity_id
    and protocol_hash_hex = v_successor_protocol.hash_hex
    and subject_experiment_hash_hex = v_predecessor.subject_experiment_hash_hex
    and subject_experiment_parameters_hash_hex = v_predecessor.subject_experiment_parameters_hash_hex
    and subject_research_ir_hash_hex = v_predecessor.subject_research_ir_hash_hex;
  if v_successor_root.research_scientific_promotion_transition_identity_id is null then raise exception 'WRONG_SUCCESSOR_ROOT'; end if;
  if v_successor_root.predecessor_transition_identity_id is not null or v_successor_root.predecessor_state <> 'DRAFT_RESEARCH' or v_successor_root.resulting_state <> 'EXECUTED' then raise exception 'WRONG_SUCCESSOR_ROOT'; end if;
  if v_successor_root.research_scientific_promotion_transition_identity_id = v_predecessor.research_scientific_promotion_transition_identity_id then raise exception 'FORBIDDEN_TRANSITION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL8C_SUCCESSOR:' || v_predecessor.research_scientific_promotion_transition_identity_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL8C_SUPERSEDE:' || v_predecessor.research_scientific_promotion_transition_identity_id::text || ':' || p_successor_protocol_identity_id::text || ':' || p_successor_root_transition_identity_id::text, 0));
  if investing.rl8c_supersession_cycle_reaches_v1(v_successor_root.research_scientific_promotion_transition_identity_id, v_predecessor.research_scientific_promotion_transition_identity_id) then raise exception 'SUPERSESSION_CYCLE'; end if;

  select research_scientific_promotion_transition_identity_id, transition_hash_hex, canonical_payload into v_existing_successor
  from investing.research_scientific_promotion_transitions_scientific_identities
  where predecessor_transition_identity_id = v_predecessor.research_scientific_promotion_transition_identity_id;
  if v_existing_successor.research_scientific_promotion_transition_identity_id is not null then
    if v_existing_successor.transition_hash_hex = p_superseded_transition_hash_hex and v_existing_successor.canonical_payload = p_superseded_canonical_payload then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchScientificPromotionTransitionIdentityId',v_existing_successor.research_scientific_promotion_transition_identity_id,'transitionHashHex',p_superseded_transition_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;

  select research_scientific_promotion_transition_identity_id, canonical_payload into v_existing_by_hash
  from investing.research_scientific_promotion_transitions_scientific_identities
  where tenant_id = v_auth.tenant_id
    and research_investigation_id = v_auth.research_investigation_id
    and transition_hash_hex = p_superseded_transition_hash_hex;
  if v_existing_by_hash.research_scientific_promotion_transition_identity_id is not null then
    if v_existing_by_hash.canonical_payload = p_superseded_canonical_payload then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchScientificPromotionTransitionIdentityId',v_existing_by_hash.research_scientific_promotion_transition_identity_id,'transitionHashHex',p_superseded_transition_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;

  insert into investing.research_scientific_promotion_transitions_scientific_identities (
    operation, capability, operation_scope, source_context,
    tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id,
    research_scientific_promotion_protocol_identity_id, protocol_hash_hex,
    subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex,
    predecessor_transition_identity_id, predecessor_transition_hash_hex, predecessor_state, resulting_state,
    transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex,
    supersedes_transition_identity_id, supersedes_transition_hash_hex,
    superseded_by_successor_protocol_identity_id, superseded_by_successor_protocol_hash_hex,
    superseded_by_successor_root_transition_identity_id, superseded_by_successor_root_transition_hash_hex,
    run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, evidence_object_identity_id, evidence_object_hash_hex,
    validation_protocol_identity_id, validation_protocol_hash_hex, validation_result_identity_id, validation_result_hash_hex,
    validation_assessment_protocol_identity_id, validation_assessment_protocol_hash_hex, validation_assessment_result_identity_id, validation_assessment_result_hash_hex,
    robustness_comparison_protocol_identity_id, robustness_comparison_protocol_hash_hex, robustness_comparison_result_identity_id, robustness_comparison_result_hash_hex,
    canonical_payload
  ) values (
    'RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
    v_predecessor.tenant_id, v_predecessor.principal_id, v_predecessor.tenant_membership_id, v_predecessor.research_investigation_id, v_predecessor.research_experiment_id,
    v_predecessor.research_scientific_promotion_protocol_identity_id, v_predecessor.protocol_hash_hex,
    v_predecessor.subject_experiment_hash_hex, v_predecessor.subject_experiment_parameters_hash_hex, v_predecessor.subject_research_ir_hash_hex,
    v_predecessor.research_scientific_promotion_transition_identity_id, v_predecessor.transition_hash_hex, v_predecessor.resulting_state, 'SUPERSEDED',
    'SHA-256','SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1','SYNTRAKE_SHA256_V1',p_superseded_transition_hash_hex,
    v_predecessor.research_scientific_promotion_transition_identity_id, v_predecessor.transition_hash_hex,
    v_successor_protocol.research_scientific_promotion_protocol_identity_id, v_successor_protocol.hash_hex,
    v_successor_root.research_scientific_promotion_transition_identity_id, v_successor_root.transition_hash_hex,
    v_predecessor.run_input_identity_id, v_predecessor.run_input_hash_hex, v_predecessor.result_identity_id, v_predecessor.result_hash_hex, v_predecessor.evidence_object_identity_id, v_predecessor.evidence_object_hash_hex,
    v_predecessor.validation_protocol_identity_id, v_predecessor.validation_protocol_hash_hex, v_predecessor.validation_result_identity_id, v_predecessor.validation_result_hash_hex,
    v_predecessor.validation_assessment_protocol_identity_id, v_predecessor.validation_assessment_protocol_hash_hex, v_predecessor.validation_assessment_result_identity_id, v_predecessor.validation_assessment_result_hash_hex,
    v_predecessor.robustness_comparison_protocol_identity_id, v_predecessor.robustness_comparison_protocol_hash_hex, v_predecessor.robustness_comparison_result_identity_id, v_predecessor.robustness_comparison_result_hash_hex,
    p_superseded_canonical_payload
  ) returning research_scientific_promotion_transition_identity_id into v_transition_id;

  return jsonb_build_object('status','CREATED','researchScientificPromotionTransitionIdentityId',v_transition_id,'transitionHashHex',p_superseded_transition_hash_hex);
end;
$$;

create or replace function investing.rl8c_validate_supersession_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_predecessor record;
  v_successor_protocol record;
  v_successor_root record;
begin
  if new.resulting_state <> 'SUPERSEDED' then
    return null;
  end if;

  select * into v_predecessor
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = new.predecessor_transition_identity_id
    and transition_hash_hex = new.predecessor_transition_hash_hex
    and tenant_id = new.tenant_id
    and research_investigation_id = new.research_investigation_id
    and research_scientific_promotion_protocol_identity_id = new.research_scientific_promotion_protocol_identity_id
    and protocol_hash_hex = new.protocol_hash_hex
    and subject_experiment_hash_hex = new.subject_experiment_hash_hex
    and subject_experiment_parameters_hash_hex = new.subject_experiment_parameters_hash_hex
    and subject_research_ir_hash_hex = new.subject_research_ir_hash_hex;
  if v_predecessor.research_scientific_promotion_transition_identity_id is null then raise exception 'RL-8C3 supersession integrity violation: predecessor missing'; end if;
  if v_predecessor.resulting_state not in ('EXECUTED','INSUFFICIENT_EVIDENCE','PROMOTION_ELIGIBLE','REJECTED') then raise exception 'RL-8C3 supersession integrity violation: forbidden predecessor state'; end if;
  if new.supersedes_transition_identity_id <> v_predecessor.research_scientific_promotion_transition_identity_id or new.supersedes_transition_hash_hex <> v_predecessor.transition_hash_hex then raise exception 'RL-8C3 supersession integrity violation: supersedes mismatch'; end if;
  if new.canonical_payload->'predecessorTransition'->>'hashHex' <> v_predecessor.transition_hash_hex
    or new.canonical_payload->'supersedes'->>'hashHex' <> v_predecessor.transition_hash_hex
    or new.canonical_payload->'evidenceSnapshot' <> v_predecessor.canonical_payload->'evidenceSnapshot'
    or new.canonical_payload->'gateOutcomes' <> v_predecessor.canonical_payload->'gateOutcomes'
    or new.canonical_payload->'transitionReasons' <> '["SUPERSEDED_EVIDENCE"]'::jsonb
    or new.canonical_payload->'rejectedTransition' <> 'null'::jsonb
    or new.canonical_payload->'supersededByChain' is null
    or new.canonical_payload->'supersededByChain' = 'null'::jsonb
  then
    raise exception 'RL-8C3 supersession integrity violation: canonical payload mismatch';
  end if;

  select * into v_successor_protocol
  from investing.research_scientific_promotion_protocols_scientific_identities
  where research_scientific_promotion_protocol_identity_id = new.superseded_by_successor_protocol_identity_id
    and hash_hex = new.superseded_by_successor_protocol_hash_hex;
  if v_successor_protocol.research_scientific_promotion_protocol_identity_id is null then raise exception 'RL-8C3 supersession integrity violation: successor protocol missing'; end if;
  if v_successor_protocol.hash_hex = new.protocol_hash_hex then raise exception 'RL-8C3 supersession integrity violation: same protocol'; end if;

  select * into v_successor_root
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = new.superseded_by_successor_root_transition_identity_id
    and transition_hash_hex = new.superseded_by_successor_root_transition_hash_hex
    and tenant_id = new.tenant_id
    and research_investigation_id = new.research_investigation_id
    and research_scientific_promotion_protocol_identity_id = v_successor_protocol.research_scientific_promotion_protocol_identity_id
    and protocol_hash_hex = v_successor_protocol.hash_hex
    and subject_experiment_hash_hex = new.subject_experiment_hash_hex
    and subject_experiment_parameters_hash_hex = new.subject_experiment_parameters_hash_hex
    and subject_research_ir_hash_hex = new.subject_research_ir_hash_hex;
  if v_successor_root.research_scientific_promotion_transition_identity_id is null then raise exception 'RL-8C3 supersession integrity violation: successor root missing'; end if;
  if v_successor_root.predecessor_transition_identity_id is not null or v_successor_root.predecessor_state <> 'DRAFT_RESEARCH' or v_successor_root.resulting_state <> 'EXECUTED' then raise exception 'RL-8C3 supersession integrity violation: successor root shape'; end if;
  if v_successor_root.research_scientific_promotion_transition_identity_id in (new.research_scientific_promotion_transition_identity_id, v_predecessor.research_scientific_promotion_transition_identity_id) then raise exception 'RL-8C3 supersession integrity violation: self-reference'; end if;
  return null;
end;
$$;

create or replace function investing.reconstruct_research_scientific_promotion_chain_v1(
  p_root_transition_identity_id uuid
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  v_auth record;
  v_current record;
  v_successor record;
  v_successor_count integer;
  v_successor_root record;
  v_successor_protocol record;
  v_visited uuid[] := array[]::uuid[];
  v_traversal jsonb := '[]'::jsonb;
  v_cross_chain_hops jsonb := '[]'::jsonb;
  v_depth integer := 0;
  v_operation text;
begin
  v_operation := current_setting('syntrake.investing.operation', true);
  if v_operation not in (
    'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1'
  ) then
    raise exception 'FORBIDDEN_OPERATION';
  end if;
  select * into v_auth from investing.rl8c_assert_writer_authority_v1(v_operation);

  select * into v_current
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = p_root_transition_identity_id
    and tenant_id = v_auth.tenant_id
    and principal_id = v_auth.principal_id
    and tenant_membership_id = v_auth.tenant_membership_id
    and research_investigation_id = v_auth.research_investigation_id;
  if v_current.research_scientific_promotion_transition_identity_id is null then
    raise exception 'AUTHORITY_FAILURE';
  end if;
  if v_current.predecessor_transition_identity_id is not null or v_current.predecessor_state <> 'DRAFT_RESEARCH' or v_current.resulting_state <> 'EXECUTED' then
    return jsonb_build_object('status','CORRUPT_HISTORY','reason','ROOT_INVALID','rootTransitionIdentityId',p_root_transition_identity_id);
  end if;

  loop
    v_depth := v_depth + 1;
    if v_depth > 128 then
      return jsonb_build_object('status','CORRUPT_HISTORY','reason','RECONSTRUCTION_DEPTH_LIMIT','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
    end if;
    if v_current.research_scientific_promotion_transition_identity_id = any(v_visited) then
      return jsonb_build_object('status','CORRUPT_HISTORY','reason','CYCLE','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
    end if;
    v_visited := v_visited || v_current.research_scientific_promotion_transition_identity_id;
    v_traversal := v_traversal || jsonb_build_array(jsonb_build_object(
      'transitionIdentityId', v_current.research_scientific_promotion_transition_identity_id,
      'transitionHashHex', v_current.transition_hash_hex,
      'predecessorState', v_current.predecessor_state,
      'resultingState', v_current.resulting_state,
      'protocolHashHex', v_current.protocol_hash_hex
    ));

    select count(*) into v_successor_count
    from investing.research_scientific_promotion_transitions_scientific_identities
    where predecessor_transition_identity_id = v_current.research_scientific_promotion_transition_identity_id;
    if v_successor_count > 1 then
      return jsonb_build_object('status','CORRUPT_HISTORY','reason','MULTIPLE_SUCCESSORS','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
    end if;

    if v_successor_count = 1 then
      select * into v_successor
      from investing.research_scientific_promotion_transitions_scientific_identities
      where predecessor_transition_identity_id = v_current.research_scientific_promotion_transition_identity_id;
      v_current := v_successor;
      continue;
    end if;

    if v_current.resulting_state in ('VALIDATION_PASSED','VALIDATION_FAILED') then
      return jsonb_build_object('status','CORRUPT_HISTORY','reason','ORPHAN_INTERMEDIATE_LEAF','rootTransitionIdentityId',p_root_transition_identity_id,'leafTransitionIdentityId',v_current.research_scientific_promotion_transition_identity_id,'leafTransitionHashHex',v_current.transition_hash_hex,'leafState',v_current.resulting_state,'traversal',v_traversal);
    end if;

    if v_current.resulting_state = 'SUPERSEDED' then
      if v_current.superseded_by_successor_protocol_identity_id is null or v_current.superseded_by_successor_root_transition_identity_id is null then
        return jsonb_build_object('status','CORRUPT_HISTORY','reason','DANGLING_SUPERSESSION','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
      end if;
      select * into v_successor_protocol
      from investing.research_scientific_promotion_protocols_scientific_identities
      where research_scientific_promotion_protocol_identity_id = v_current.superseded_by_successor_protocol_identity_id
        and hash_hex = v_current.superseded_by_successor_protocol_hash_hex;
      if v_successor_protocol.research_scientific_promotion_protocol_identity_id is null or v_successor_protocol.hash_hex = v_current.protocol_hash_hex then
        return jsonb_build_object('status','CORRUPT_HISTORY','reason','WRONG_SUCCESSOR_PROTOCOL','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
      end if;
      select * into v_successor_root
      from investing.research_scientific_promotion_transitions_scientific_identities
      where research_scientific_promotion_transition_identity_id = v_current.superseded_by_successor_root_transition_identity_id
        and transition_hash_hex = v_current.superseded_by_successor_root_transition_hash_hex
        and tenant_id = v_current.tenant_id
        and research_investigation_id = v_current.research_investigation_id
        and research_scientific_promotion_protocol_identity_id = v_successor_protocol.research_scientific_promotion_protocol_identity_id
        and protocol_hash_hex = v_successor_protocol.hash_hex
        and subject_experiment_hash_hex = v_current.subject_experiment_hash_hex
        and subject_experiment_parameters_hash_hex = v_current.subject_experiment_parameters_hash_hex
        and subject_research_ir_hash_hex = v_current.subject_research_ir_hash_hex;
      if v_successor_root.research_scientific_promotion_transition_identity_id is null
        or v_successor_root.predecessor_transition_identity_id is not null
        or v_successor_root.predecessor_state <> 'DRAFT_RESEARCH'
        or v_successor_root.resulting_state <> 'EXECUTED'
      then
        return jsonb_build_object('status','CORRUPT_HISTORY','reason','WRONG_SUCCESSOR_ROOT','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
      end if;
      if v_successor_root.research_scientific_promotion_transition_identity_id = any(v_visited) then
        return jsonb_build_object('status','CORRUPT_HISTORY','reason','CYCLE','rootTransitionIdentityId',p_root_transition_identity_id,'traversal',v_traversal);
      end if;
      v_cross_chain_hops := v_cross_chain_hops || jsonb_build_array(jsonb_build_object(
        'fromSupersededTransitionIdentityId', v_current.research_scientific_promotion_transition_identity_id,
        'fromProtocolHashHex', v_current.protocol_hash_hex,
        'successorProtocolHashHex', v_successor_protocol.hash_hex,
        'successorRootTransitionIdentityId', v_successor_root.research_scientific_promotion_transition_identity_id,
        'successorRootTransitionHashHex', v_successor_root.transition_hash_hex
      ));
      v_current := v_successor_root;
      continue;
    end if;

    return jsonb_build_object(
      'status','OK',
      'rootTransitionIdentityId',p_root_transition_identity_id,
      'activeLeafTransitionIdentityId',v_current.research_scientific_promotion_transition_identity_id,
      'activeLeafTransitionHashHex',v_current.transition_hash_hex,
      'activeLeafState',v_current.resulting_state,
      'traversal',v_traversal,
      'crossChainHops',v_cross_chain_hops
    );
  end loop;
end;
$$;

reset role;

set local role investing_owner;
drop trigger if exists research_scientific_promotion_supersession_integrity on investing.research_scientific_promotion_transitions_scientific_identities;
create constraint trigger research_scientific_promotion_supersession_integrity
after insert on investing.research_scientific_promotion_transitions_scientific_identities
deferrable initially deferred
for each row execute function investing.rl8c_validate_supersession_integrity_v1();

reset role;

set local role investing_rl8_writer;

revoke all on function investing.rl8c_validate_supersession_integrity_v1() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function investing.reconstruct_research_scientific_promotion_chain_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb, uuid, uuid) to investing_app;
grant execute on function investing.reconstruct_research_scientific_promotion_chain_v1(uuid) to investing_app;

reset role;

set local role investing_owner;
revoke create on schema investing from investing_rl8_writer;
reset role;

revoke investing_rl8_writer from postgres granted by postgres;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='research_scientific_promotion_supersession_integrity' and tgdeferrable and tginitdeferred) then raise exception 'RL-8C3 postcondition failed: supersession integrity trigger missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='investing' and p.proname='rl8c_validate_supersession_integrity_v1'
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog'] and pg_catalog.pg_get_userbyid(p.proowner)='investing_rl8_writer'
  ) then raise exception 'RL-8C3 postcondition failed: supersession trigger authority mismatch'; end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='investing' and p.proname='persist_research_scientific_promotion_supersession_v1'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_predecessor_transition_identity_id uuid, p_superseded_transition_hash_hex text, p_superseded_canonical_payload jsonb, p_successor_protocol_identity_id uuid, p_successor_root_transition_identity_id uuid'
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog'] and pg_catalog.pg_get_userbyid(p.proowner)='investing_rl8_writer'
  ) then raise exception 'RL-8C3 postcondition failed: supersession writer surface mismatch'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='investing' and p.proname='persist_research_scientific_promotion_supersession_v1' and p.pronargs = 3
  ) then raise exception 'RL-8C3 postcondition failed: obsolete supersession writer overload remains'; end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='investing' and p.proname='reconstruct_research_scientific_promotion_chain_v1'
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog'] and pg_catalog.pg_get_userbyid(p.proowner)='investing_rl8_writer'
  ) then raise exception 'RL-8C3 postcondition failed: reconstruction helper surface mismatch'; end if;
  if not has_function_privilege('investing_app','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)','EXECUTE') or not has_function_privilege('investing_app','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') then raise exception 'RL-8C3 postcondition failed: investing_app execute missing'; end if;
  if has_function_privilege('service_role','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)','EXECUTE') or has_function_privilege('anon','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)','EXECUTE') or has_function_privilege('service_role','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') or has_function_privilege('anon','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') or has_function_privilege('authenticated','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') then raise exception 'RL-8C3 postcondition failed: forbidden execute grant exists'; end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname='investing_rl8_writer' and (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then raise exception 'RL-8C3 postcondition failed: writer role drift'; end if;
  if pg_catalog.pg_has_role('investing_owner','investing_rl8_writer','member') or pg_catalog.pg_has_role('investing_app','investing_rl8_writer','member') or pg_catalog.pg_has_role('service_role','investing_rl8_writer','member') then raise exception 'RL-8C3 postcondition failed: forbidden role membership'; end if;
  if pg_catalog.has_schema_privilege('investing_rl8_writer','investing','CREATE') then raise exception 'RL-8C3 postcondition failed: writer schema CREATE leaked'; end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles role_r on role_r.oid = m.roleid
    join pg_catalog.pg_roles member_r on member_r.oid = m.member
    where role_r.rolname = 'investing_rl8_writer'
      and member_r.rolname = 'postgres'
      and (m.set_option or m.inherit_option)
  ) then raise exception 'RL-8C3 postcondition failed: postgres writer membership option leaked'; end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles role_r on role_r.oid = m.roleid
    join pg_catalog.pg_roles member_r on member_r.oid = m.member
    join pg_catalog.pg_roles grantor_r on grantor_r.oid = m.grantor
    where role_r.rolname = 'investing_rl8_writer'
      and member_r.rolname = 'postgres'
      and grantor_r.rolname = 'postgres'
  ) then raise exception 'RL-8C3 postcondition failed: postgres self-granted writer membership leaked'; end if;
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='investing' and c.relname in ('research_scientific_promotion_protocols_scientific_identities','research_scientific_promotion_transitions_scientific_identities') and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'RL-8C3 postcondition failed: RLS/FORCE RLS drift'; end if;
end $$;

commit;
