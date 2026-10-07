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
    'RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1'
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

create or replace function investing.rl8c_required_hash_v1(p_payload jsonb, p_path text[])
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case when p_payload #>> p_path ~ '^[0-9A-F]{64}$' then p_payload #>> p_path else null end
$$;

create or replace function investing.rl8c_hashref_equals_current_protocol_v1(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_payload->'protocol' = jsonb_build_object(
    'hashAlgorithm','SHA-256',
    'hashDomain','SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1',
    'hashHex','122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C',
    'hashVersion','SYNTRAKE_SHA256_V1'
  )
$$;

create or replace function investing.rl8c_resolve_optional_uuid_v1(p_relation regclass, p_identity_column text, p_hash_column text, p_hash_hex text)
returns uuid
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_identity uuid;
begin
  if p_hash_hex is null then
    return null;
  end if;
  execute format('select %I from %s where %I = $1', p_identity_column, p_relation, p_hash_column)
    into v_identity
    using p_hash_hex;
  if v_identity is null then
    raise exception 'AUTHORITY_FAILURE';
  end if;
  return v_identity;
end;
$$;

create or replace function investing.rl8c_insert_transition_from_payload_v1(
  p_operation text,
  p_transition_hash_hex text,
  p_canonical_payload jsonb,
  p_predecessor_transition_identity_id uuid,
  p_predecessor_transition_hash_hex text,
  p_rejected_transition_identity_id uuid,
  p_rejected_transition_hash_hex text
) returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_auth record;
  v_protocol_id uuid;
  v_experiment_id uuid;
  v_transition_id uuid;
  v_existing record;
  v_subject_experiment_hash text;
  v_subject_experiment_parameters_hash text;
  v_subject_research_ir_hash text;
  v_run_input_hash text;
  v_result_hash text;
  v_evidence_object_hash text;
  v_validation_protocol_hash text;
  v_validation_result_hash text;
  v_validation_assessment_protocol_hash text;
  v_validation_assessment_result_hash text;
  v_robustness_comparison_protocol_hash text;
  v_robustness_comparison_result_hash text;
  v_run_input_id uuid;
  v_result_id uuid;
  v_evidence_object_id uuid;
  v_validation_protocol_id uuid;
  v_validation_result_id uuid;
  v_validation_assessment_protocol_id uuid;
  v_validation_assessment_result_id uuid;
  v_robustness_comparison_protocol_id uuid;
  v_robustness_comparison_result_id uuid;
  v_predecessor_state text;
  v_resulting_state text;
begin
  if investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', p_canonical_payload) <> p_transition_hash_hex then
    raise exception 'MALFORMED_HASHREF';
  end if;
  if not investing.rl8c_hashref_equals_current_protocol_v1(p_canonical_payload) then
    raise exception 'INCOMPATIBLE_PROTOCOL_VERSION';
  end if;

  select * into v_auth from investing.rl8c_assert_writer_authority_v1(p_operation);

  v_predecessor_state := p_canonical_payload->>'predecessorState';
  v_resulting_state := p_canonical_payload->>'resultingState';
  v_subject_experiment_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectExperiment','hashHex']);
  v_subject_experiment_parameters_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectExperimentParameters','hashHex']);
  v_subject_research_ir_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectResearchIr','hashHex']);

  select research_scientific_promotion_protocol_identity_id into v_protocol_id
  from investing.research_scientific_promotion_protocols_scientific_identities
  where hash_hex = '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C'
    and canonical_payload->>'protocolId' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002';
  if v_protocol_id is null then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;

  select research_experiment_id into v_experiment_id
  from investing.research_experiments
  where research_investigation_id = v_auth.research_investigation_id
    and tenant_id = v_auth.tenant_id
    and principal_id = v_auth.principal_id
    and tenant_membership_id = v_auth.tenant_membership_id
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
    and experiment_hash_hex = v_subject_experiment_hash
    and experiment_parameters_hash_hex = v_subject_experiment_parameters_hash
    and research_ir_hash_hex = v_subject_research_ir_hash;
  if v_experiment_id is null then raise exception 'MISSING_SUBJECT'; end if;

  v_run_input_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','runInput','hashHex']);
  v_result_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','result','hashHex']);
  v_evidence_object_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','evidenceObject','hashHex']);
  v_validation_protocol_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','validationProtocol','hashHex']);
  v_validation_result_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','validationResult','hashHex']);
  v_validation_assessment_protocol_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','validationAssessmentProtocol','hashHex']);
  v_validation_assessment_result_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','validationAssessmentResult','hashHex']);
  v_robustness_comparison_protocol_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','robustnessComparisonProtocol','hashHex']);
  v_robustness_comparison_result_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['evidenceSnapshot','robustnessComparisonResult','hashHex']);

  select run_input_identity_id into v_run_input_id from investing.run_inputs_scientific_identities where hash_hex = v_run_input_hash;
  if v_run_input_hash is not null and v_run_input_id is null then raise exception 'MISSING_EVIDENCE'; end if;
  select result_identity_id into v_result_id from investing.research_results_scientific_identities where hash_hex = v_result_hash;
  if v_result_hash is not null and v_result_id is null then raise exception 'MISSING_RESULT'; end if;
  select evidence_identity_id into v_evidence_object_id from investing.research_evidence_objects_scientific_identities where hash_hex = v_evidence_object_hash;
  if v_evidence_object_hash is not null and v_evidence_object_id is null then raise exception 'MISSING_EVIDENCE_OBJECT'; end if;
  select research_validation_protocol_identity_id into v_validation_protocol_id from investing.research_validation_protocols_scientific_identities where hash_hex = v_validation_protocol_hash;
  if v_validation_protocol_hash is not null and v_validation_protocol_id is null then raise exception 'MISSING_VALIDATION_RESULT'; end if;
  select research_validation_result_identity_id into v_validation_result_id from investing.research_validation_results_scientific_identities where hash_hex = v_validation_result_hash;
  if v_validation_result_hash is not null and v_validation_result_id is null then raise exception 'MISSING_VALIDATION_RESULT'; end if;
  select research_validation_assessment_protocol_identity_id into v_validation_assessment_protocol_id from investing.research_validation_assessment_protocols_scientific_identities where hash_hex = v_validation_assessment_protocol_hash;
  if v_validation_assessment_protocol_hash is not null and v_validation_assessment_protocol_id is null then raise exception 'MISSING_VALIDATION_ASSESSMENT_AUTHORITY'; end if;
  select research_validation_assessment_result_identity_id into v_validation_assessment_result_id from investing.research_validation_assessment_results_scientific_identities where hash_hex = v_validation_assessment_result_hash;
  if v_validation_assessment_result_hash is not null and v_validation_assessment_result_id is null then raise exception 'MISSING_VALIDATION_ASSESSMENT_AUTHORITY'; end if;
  select research_experiment_comparison_protocol_identity_id into v_robustness_comparison_protocol_id from investing.research_experiment_comparison_protocols_scientific_identities where hash_hex = v_robustness_comparison_protocol_hash;
  if v_robustness_comparison_protocol_hash is not null and v_robustness_comparison_protocol_id is null then raise exception 'MISSING_RL7_COMPARISON'; end if;
  select research_experiment_comparison_result_identity_id into v_robustness_comparison_result_id from investing.research_experiment_comparison_results_scientific_identities where hash_hex = v_robustness_comparison_result_hash;
  if v_robustness_comparison_result_hash is not null and v_robustness_comparison_result_id is null then raise exception 'MISSING_RL7_COMPARISON'; end if;

  select research_scientific_promotion_transition_identity_id, canonical_payload into v_existing
  from investing.research_scientific_promotion_transitions_scientific_identities
  where tenant_id = v_auth.tenant_id
    and research_investigation_id = v_auth.research_investigation_id
    and transition_hash_hex = p_transition_hash_hex;
  if v_existing.research_scientific_promotion_transition_identity_id is not null then
    if v_existing.canonical_payload = p_canonical_payload then
      return v_existing.research_scientific_promotion_transition_identity_id;
    end if;
    raise exception 'DIVERGENT_EXISTING_IDENTITY';
  end if;

  insert into investing.research_scientific_promotion_transitions_scientific_identities (
    operation, capability, operation_scope, source_context,
    tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id,
    research_scientific_promotion_protocol_identity_id, protocol_hash_hex,
    subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex,
    predecessor_transition_identity_id, predecessor_transition_hash_hex, predecessor_state, resulting_state,
    transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex,
    rejected_transition_identity_id, rejected_transition_hash_hex,
    run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, evidence_object_identity_id, evidence_object_hash_hex,
    validation_protocol_identity_id, validation_protocol_hash_hex, validation_result_identity_id, validation_result_hash_hex,
    validation_assessment_protocol_identity_id, validation_assessment_protocol_hash_hex, validation_assessment_result_identity_id, validation_assessment_result_hash_hex,
    robustness_comparison_protocol_identity_id, robustness_comparison_protocol_hash_hex, robustness_comparison_result_identity_id, robustness_comparison_result_hash_hex,
    canonical_payload
  ) values (
    p_operation, 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
    v_auth.tenant_id, v_auth.principal_id, v_auth.tenant_membership_id, v_auth.research_investigation_id, v_experiment_id,
    v_protocol_id, '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C',
    v_subject_experiment_hash, v_subject_experiment_parameters_hash, v_subject_research_ir_hash,
    p_predecessor_transition_identity_id, p_predecessor_transition_hash_hex, v_predecessor_state, v_resulting_state,
    'SHA-256', 'SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', 'SYNTRAKE_SHA256_V1', p_transition_hash_hex,
    p_rejected_transition_identity_id, p_rejected_transition_hash_hex,
    v_run_input_id, v_run_input_hash, v_result_id, v_result_hash, v_evidence_object_id, v_evidence_object_hash,
    v_validation_protocol_id, v_validation_protocol_hash, v_validation_result_id, v_validation_result_hash,
    v_validation_assessment_protocol_id, v_validation_assessment_protocol_hash, v_validation_assessment_result_id, v_validation_assessment_result_hash,
    v_robustness_comparison_protocol_id, v_robustness_comparison_protocol_hash, v_robustness_comparison_result_id, v_robustness_comparison_result_hash,
    p_canonical_payload
  ) returning research_scientific_promotion_transition_identity_id into v_transition_id;

  return v_transition_id;
end;
$$;

create or replace function investing.rl8c_validate_closure_pair_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.resulting_state = 'VALIDATION_PASSED' and not exists (
    select 1 from investing.research_scientific_promotion_transitions_scientific_identities successor
    where successor.predecessor_transition_identity_id = new.research_scientific_promotion_transition_identity_id
      and successor.predecessor_transition_hash_hex = new.transition_hash_hex
      and successor.tenant_id = new.tenant_id
      and successor.research_investigation_id = new.research_investigation_id
      and successor.resulting_state = 'PROMOTION_ELIGIBLE'
  ) then
    raise exception 'RL-8C2 orphan VALIDATION_PASSED transition requires PROMOTION_ELIGIBLE closure';
  end if;
  if new.resulting_state = 'VALIDATION_FAILED' and not exists (
    select 1 from investing.research_scientific_promotion_transitions_scientific_identities successor
    where successor.predecessor_transition_identity_id = new.research_scientific_promotion_transition_identity_id
      and successor.predecessor_transition_hash_hex = new.transition_hash_hex
      and successor.tenant_id = new.tenant_id
      and successor.research_investigation_id = new.research_investigation_id
      and successor.resulting_state = 'REJECTED'
      and successor.rejected_transition_identity_id = new.research_scientific_promotion_transition_identity_id
      and successor.rejected_transition_hash_hex = new.transition_hash_hex
  ) then
    raise exception 'RL-8C2 orphan VALIDATION_FAILED transition requires REJECTED closure';
  end if;
  return null;
end;
$$;

drop trigger if exists research_scientific_promotion_stage_a_closure_integrity on investing.research_scientific_promotion_transitions_scientific_identities;
create constraint trigger research_scientific_promotion_stage_a_closure_integrity
after insert on investing.research_scientific_promotion_transitions_scientific_identities
deferrable initially deferred
for each row execute function investing.rl8c_validate_closure_pair_v1();

create or replace function investing.persist_research_scientific_promotion_protocol_v1(p_protocol_hash_hex text, p_canonical_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth record;
  v_existing record;
  v_id uuid;
  v_computed_hash text;
begin
  select * into v_auth from investing.rl8c_assert_writer_authority_v1('RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1');
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1', p_canonical_payload);
  if p_protocol_hash_hex <> '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C' or v_computed_hash <> p_protocol_hash_hex or p_canonical_payload->>'protocolId' <> 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002' then
    raise exception 'INCOMPATIBLE_PROTOCOL_VERSION';
  end if;
  select research_scientific_promotion_protocol_identity_id, canonical_payload, hash_hex into v_existing
  from investing.research_scientific_promotion_protocols_scientific_identities
  where canonical_payload->>'protocolId' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002';
  if v_existing.research_scientific_promotion_protocol_identity_id is not null then
    if v_existing.hash_hex = p_protocol_hash_hex and v_existing.canonical_payload = p_canonical_payload then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchScientificPromotionProtocolIdentityId',v_existing.research_scientific_promotion_protocol_identity_id,'hashHex',p_protocol_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_scientific_promotion_protocols_scientific_identities (
    operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
  ) values (
    'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',p_protocol_hash_hex,p_canonical_payload
  ) returning research_scientific_promotion_protocol_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchScientificPromotionProtocolIdentityId',v_id,'hashHex',p_protocol_hash_hex);
end;
$$;

create or replace function investing.persist_research_scientific_promotion_root_v1(p_transition_hash_hex text, p_canonical_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_existing record;
  v_auth record;
  v_computed_hash text;
  v_subject_experiment_hash text;
  v_subject_experiment_parameters_hash text;
  v_subject_research_ir_hash text;
begin
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', p_canonical_payload);
  if v_computed_hash <> p_transition_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  if p_canonical_payload->>'predecessorState' <> 'DRAFT_RESEARCH' or p_canonical_payload->>'resultingState' <> 'EXECUTED' or p_canonical_payload->'predecessorTransition' <> 'null'::jsonb then
    raise exception 'MALFORMED_TRANSITION';
  end if;
  if not investing.rl8c_hashref_equals_current_protocol_v1(p_canonical_payload) then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;

  select * into v_auth from investing.rl8c_assert_writer_authority_v1('RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1');
  v_subject_experiment_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectExperiment','hashHex']);
  v_subject_experiment_parameters_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectExperimentParameters','hashHex']);
  v_subject_research_ir_hash := investing.rl8c_required_hash_v1(p_canonical_payload, array['subject','subjectResearchIr','hashHex']);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_auth.tenant_id::text || ':' || v_auth.research_investigation_id::text || ':122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C:' || v_subject_experiment_hash || ':' || v_subject_experiment_parameters_hash || ':' || v_subject_research_ir_hash, 0));

  select research_scientific_promotion_transition_identity_id, transition_hash_hex, protocol_hash_hex, research_scientific_promotion_protocol_identity_id, canonical_payload into v_existing
  from investing.research_scientific_promotion_transitions_scientific_identities
  where tenant_id = v_auth.tenant_id
    and research_investigation_id = v_auth.research_investigation_id
    and predecessor_transition_identity_id is null
    and protocol_hash_hex = '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C'
    and subject_experiment_hash_hex = v_subject_experiment_hash
    and subject_experiment_parameters_hash_hex = v_subject_experiment_parameters_hash
    and subject_research_ir_hash_hex = v_subject_research_ir_hash;
  if v_existing.research_scientific_promotion_transition_identity_id is not null then
    if v_existing.canonical_payload = p_canonical_payload
      and v_existing.transition_hash_hex = p_transition_hash_hex
      and v_existing.protocol_hash_hex = '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C'
      and v_computed_hash = p_transition_hash_hex
    then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchScientificPromotionTransitionIdentityId',v_existing.research_scientific_promotion_transition_identity_id,'transitionHashHex',p_transition_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  v_id := investing.rl8c_insert_transition_from_payload_v1('RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1', p_transition_hash_hex, p_canonical_payload, null, null, null, null);
  return jsonb_build_object('status','CREATED','researchScientificPromotionTransitionIdentityId',v_id,'transitionHashHex',p_transition_hash_hex);
end;
$$;

create or replace function investing.persist_research_scientific_promotion_evaluation_plan_v1(
  p_predecessor_transition_identity_id uuid,
  p_stage_a_transition_hash_hex text,
  p_stage_a_canonical_payload jsonb,
  p_closure_transition_hash_hex text default null,
  p_closure_canonical_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_predecessor record;
  v_stage_id uuid;
  v_closure_id uuid;
  v_stage_state text;
  v_closure_state text;
  v_existing_successor record;
  v_existing_closure record;
  v_stage_computed_hash text;
  v_closure_computed_hash text;
begin
  perform 1 from investing.rl8c_assert_writer_authority_v1('RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1');
  v_stage_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', p_stage_a_canonical_payload);
  if v_stage_computed_hash <> p_stage_a_transition_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  if p_closure_canonical_payload is not null then
    if p_closure_transition_hash_hex is null then raise exception 'MALFORMED_HASHREF'; end if;
    v_closure_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1', p_closure_canonical_payload);
  elsif p_closure_transition_hash_hex is not null then
    raise exception 'MALFORMED_HASHREF';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL8C2_PLAN:' || p_predecessor_transition_identity_id::text, 0));

  select * into v_predecessor
  from investing.research_scientific_promotion_transitions_scientific_identities
  where research_scientific_promotion_transition_identity_id = p_predecessor_transition_identity_id;
  if v_predecessor.research_scientific_promotion_transition_identity_id is null then raise exception 'WRONG_LINEAGE'; end if;
  if p_stage_a_canonical_payload->'predecessorTransition'->>'hashHex' <> v_predecessor.transition_hash_hex
    or p_stage_a_canonical_payload->>'predecessorState' <> v_predecessor.resulting_state
    or p_stage_a_canonical_payload->>'resultingState' not in ('INSUFFICIENT_EVIDENCE','VALIDATION_FAILED','VALIDATION_PASSED')
  then
    raise exception 'WRONG_LINEAGE';
  end if;

  select research_scientific_promotion_transition_identity_id, transition_hash_hex, canonical_payload, resulting_state into v_existing_successor
  from investing.research_scientific_promotion_transitions_scientific_identities
  where predecessor_transition_identity_id = p_predecessor_transition_identity_id;
  if v_existing_successor.research_scientific_promotion_transition_identity_id is not null then
    if not (v_existing_successor.transition_hash_hex = p_stage_a_transition_hash_hex and v_existing_successor.canonical_payload = p_stage_a_canonical_payload and v_stage_computed_hash = p_stage_a_transition_hash_hex) then
      return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
    end if;
    v_stage_state := v_existing_successor.resulting_state;
    if v_stage_state = 'INSUFFICIENT_EVIDENCE' then
      if p_closure_transition_hash_hex is null and p_closure_canonical_payload is null then
        return jsonb_build_object('status','REUSED_IDENTICAL','stageATransitionIdentityId',v_existing_successor.research_scientific_promotion_transition_identity_id,'closureTransitionIdentityId',null);
      end if;
      return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
    end if;

    select research_scientific_promotion_transition_identity_id, transition_hash_hex, canonical_payload, resulting_state, predecessor_transition_identity_id, predecessor_transition_hash_hex, rejected_transition_identity_id, rejected_transition_hash_hex into v_existing_closure
    from investing.research_scientific_promotion_transitions_scientific_identities
    where predecessor_transition_identity_id = v_existing_successor.research_scientific_promotion_transition_identity_id;
    if p_closure_transition_hash_hex is null or p_closure_canonical_payload is null or v_existing_closure.research_scientific_promotion_transition_identity_id is null then
      return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
    end if;
    if v_stage_state = 'VALIDATION_PASSED' then
      if v_existing_closure.resulting_state = 'PROMOTION_ELIGIBLE'
        and v_existing_closure.predecessor_transition_identity_id = v_existing_successor.research_scientific_promotion_transition_identity_id
        and v_existing_closure.predecessor_transition_hash_hex = v_existing_successor.transition_hash_hex
        and v_existing_closure.transition_hash_hex = p_closure_transition_hash_hex
        and v_existing_closure.canonical_payload = p_closure_canonical_payload
        and v_closure_computed_hash = p_closure_transition_hash_hex
      then
        return jsonb_build_object('status','REUSED_IDENTICAL','stageATransitionIdentityId',v_existing_successor.research_scientific_promotion_transition_identity_id,'closureTransitionIdentityId',v_existing_closure.research_scientific_promotion_transition_identity_id);
      end if;
      return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
    end if;
    if v_stage_state = 'VALIDATION_FAILED' then
      if v_existing_closure.resulting_state = 'REJECTED'
        and v_existing_closure.predecessor_transition_identity_id = v_existing_successor.research_scientific_promotion_transition_identity_id
        and v_existing_closure.predecessor_transition_hash_hex = v_existing_successor.transition_hash_hex
        and v_existing_closure.rejected_transition_identity_id = v_existing_successor.research_scientific_promotion_transition_identity_id
        and v_existing_closure.rejected_transition_hash_hex = v_existing_successor.transition_hash_hex
        and v_existing_closure.transition_hash_hex = p_closure_transition_hash_hex
        and v_existing_closure.canonical_payload = p_closure_canonical_payload
        and v_closure_computed_hash = p_closure_transition_hash_hex
      then
        return jsonb_build_object('status','REUSED_IDENTICAL','stageATransitionIdentityId',v_existing_successor.research_scientific_promotion_transition_identity_id,'closureTransitionIdentityId',v_existing_closure.research_scientific_promotion_transition_identity_id);
      end if;
      return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;

  v_stage_id := investing.rl8c_insert_transition_from_payload_v1('RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1', p_stage_a_transition_hash_hex, p_stage_a_canonical_payload, p_predecessor_transition_identity_id, v_predecessor.transition_hash_hex, null, null);
  v_stage_state := p_stage_a_canonical_payload->>'resultingState';

  if v_stage_state = 'INSUFFICIENT_EVIDENCE' then
    if p_closure_transition_hash_hex is not null or p_closure_canonical_payload is not null then raise exception 'MALFORMED_TRANSITION'; end if;
    return jsonb_build_object('status','CREATED','stageATransitionIdentityId',v_stage_id,'closureTransitionIdentityId',null);
  end if;

  if p_closure_transition_hash_hex is null or p_closure_canonical_payload is null then raise exception 'MALFORMED_TRANSITION'; end if;
  if v_closure_computed_hash <> p_closure_transition_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  v_closure_state := p_closure_canonical_payload->>'resultingState';
  if (v_stage_state = 'VALIDATION_PASSED' and v_closure_state <> 'PROMOTION_ELIGIBLE') or (v_stage_state = 'VALIDATION_FAILED' and v_closure_state <> 'REJECTED') then
    raise exception 'FORBIDDEN_TRANSITION';
  end if;
  if p_closure_canonical_payload->'predecessorTransition'->>'hashHex' <> p_stage_a_transition_hash_hex or p_closure_canonical_payload->>'predecessorState' <> v_stage_state then
    raise exception 'WRONG_LINEAGE';
  end if;
  v_closure_id := investing.rl8c_insert_transition_from_payload_v1(
    'RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1',
    p_closure_transition_hash_hex,
    p_closure_canonical_payload,
    v_stage_id,
    p_stage_a_transition_hash_hex,
    case when v_stage_state = 'VALIDATION_FAILED' then v_stage_id else null end,
    case when v_stage_state = 'VALIDATION_FAILED' then p_stage_a_transition_hash_hex else null end
  );
  return jsonb_build_object('status','CREATED','stageATransitionIdentityId',v_stage_id,'closureTransitionIdentityId',v_closure_id);
end;
$$;

alter function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) owner to investing_rl8_writer;
alter function investing.persist_research_scientific_promotion_root_v1(text, jsonb) owner to investing_rl8_writer;
alter function investing.persist_research_scientific_promotion_evaluation_plan_v1(uuid, text, jsonb, text, jsonb) owner to investing_rl8_writer;

revoke all on function investing.rl8c_assert_writer_authority_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl8c_required_hash_v1(jsonb, text[]) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl8c_hashref_equals_current_protocol_v1(jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl8c_resolve_optional_uuid_v1(regclass, text, text, text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl8c_insert_transition_from_payload_v1(text, text, jsonb, uuid, text, uuid, text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl8c_validate_closure_pair_v1() from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.rl8c_assert_writer_authority_v1(text) to investing_rl8_writer;
grant execute on function investing.rl8c_required_hash_v1(jsonb, text[]) to investing_rl8_writer;
grant execute on function investing.rl8c_hashref_equals_current_protocol_v1(jsonb) to investing_rl8_writer;
grant execute on function investing.rl8c_insert_transition_from_payload_v1(text, text, jsonb, uuid, text, uuid, text) to investing_rl8_writer;

revoke all on function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_scientific_promotion_root_v1(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_scientific_promotion_evaluation_plan_v1(uuid, text, jsonb, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) to investing_app;
grant execute on function investing.persist_research_scientific_promotion_root_v1(text, jsonb) to investing_app;
grant execute on function investing.persist_research_scientific_promotion_evaluation_plan_v1(uuid, text, jsonb, text, jsonb) to investing_app;

do $$
declare
  v_writer_count integer;
begin
  select count(*) into v_writer_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in ('persist_research_scientific_promotion_protocol_v1','persist_research_scientific_promotion_root_v1','persist_research_scientific_promotion_evaluation_plan_v1')
    and p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog']
    and pg_catalog.pg_get_userbyid(p.proowner) = 'investing_rl8_writer';
  if v_writer_count <> 3 then raise exception 'RL-8C2 postcondition failed: writer surface mismatch'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'investing'
      and routine_name in ('persist_research_scientific_promotion_protocol_v1','persist_research_scientific_promotion_root_v1','persist_research_scientific_promotion_evaluation_plan_v1')
      and grantee in ('PUBLIC','anon','authenticated','service_role')
      and privilege_type = 'EXECUTE'
  ) then raise exception 'RL-8C2 postcondition failed: forbidden writer execute grant exists'; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname='investing' and p.proname='persist_research_scientific_promotion_supersession_v1') then
    raise exception 'RL-8C2 postcondition failed: supersession writer is out of scope';
  end if;
  if not exists (select 1 from pg_trigger where tgname='research_scientific_promotion_stage_a_closure_integrity' and tgdeferrable and tginitdeferred) then
    raise exception 'RL-8C2 postcondition failed: closure integrity trigger missing';
  end if;
end $$;

reset role;
commit;