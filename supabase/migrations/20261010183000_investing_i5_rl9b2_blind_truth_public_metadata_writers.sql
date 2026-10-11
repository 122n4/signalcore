begin;

do $$
begin
  if current_user <> 'postgres' then raise exception 'RL-9B2 precondition failed: expected postgres, got %', current_user; end if;
end $$;

grant investing_rl9_writer to postgres;
grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;

create or replace function investing.rl9b_assert_writer_authority_v1(p_expected_operation text)
returns table (tenant_id uuid, principal_id uuid, tenant_membership_id uuid, research_investigation_id uuid)
language plpgsql stable set search_path = pg_catalog as $$
declare v_count integer;
begin
  if p_expected_operation not in (
    'RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1',
    'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1',
    'RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1',
    'RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1',
    'RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1',
    'RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1'
  ) then
    raise exception 'FORBIDDEN_OPERATION';
  end if;
  if current_setting('syntrake.investing.operation', true) <> p_expected_operation
    or current_setting('syntrake.investing.capability', true) <> 'RESEARCH_MUTATE'
    or current_setting('syntrake.investing.operation_scope', true) <> 'TENANT_SCOPE'
    or current_setting('syntrake.investing.source_context', true) <> 'PURE_RESEARCH'
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
  if v_count <> 1 then raise exception 'AUTHORITY_FAILURE'; end if;
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

create or replace function investing.rl9b_hash_hex_at_v1(p_payload jsonb, p_path text[]) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when p_payload #>> p_path ~ '^[0-9A-F]{64}$' then p_payload #>> p_path else null end
$$;

create or replace function investing.rl9b_assert_current_promotion_leaf_v1(
  p_tenant_id uuid,
  p_research_investigation_id uuid,
  p_subject_experiment_hash_hex text,
  p_subject_experiment_parameters_hash_hex text,
  p_subject_research_ir_hash_hex text,
  p_promotion_protocol_hash_hex text,
  p_promotion_transition_hash_hex text
) returns investing.research_scientific_promotion_transitions_scientific_identities
language plpgsql stable set search_path = pg_catalog as $$
declare v_transition investing.research_scientific_promotion_transitions_scientific_identities;
begin
  select * into v_transition
  from investing.research_scientific_promotion_transitions_scientific_identities t
  where t.tenant_id = p_tenant_id
    and t.research_investigation_id = p_research_investigation_id
    and t.protocol_hash_hex = p_promotion_protocol_hash_hex
    and t.transition_hash_hex = p_promotion_transition_hash_hex
    and t.subject_experiment_hash_hex = p_subject_experiment_hash_hex
    and t.subject_experiment_parameters_hash_hex = p_subject_experiment_parameters_hash_hex
    and t.subject_research_ir_hash_hex = p_subject_research_ir_hash_hex
    and t.resulting_state = 'PROMOTION_ELIGIBLE';
  if v_transition.research_scientific_promotion_transition_identity_id is null then
    raise exception 'WRONG_PROMOTION_STATE';
  end if;
  if exists (
    select 1 from investing.research_scientific_promotion_transitions_scientific_identities successor
    where successor.tenant_id = p_tenant_id
      and successor.research_investigation_id = p_research_investigation_id
      and successor.predecessor_transition_identity_id = v_transition.research_scientific_promotion_transition_identity_id
  ) then
    raise exception 'STALE_PROMOTION_TRANSITION';
  end if;
  return v_transition;
end;
$$;

create or replace function investing.persist_research_blind_truth_protocol_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_auth record; v_existing record; v_id uuid; v_computed_hash text;
begin
  select * into v_auth from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1');
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1', p_canonical_payload);
  if p_hash_hex <> 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C'
    or v_computed_hash <> p_hash_hex
    or p_canonical_payload->>'protocolId' <> 'BLIND_TRUTH_PROTOCOL_V20261009'
  then
    raise exception 'INCOMPATIBLE_PROTOCOL_VERSION';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_PROTOCOL:' || p_hash_hex, 0));
  select research_blind_truth_protocol_identity_id, hash_hex, canonical_payload into v_existing
  from investing.research_blind_truth_protocols_scientific_identities
  where canonical_payload->>'protocolId' = 'BLIND_TRUTH_PROTOCOL_V20261009';
  if v_existing.research_blind_truth_protocol_identity_id is not null then
    if v_existing.hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchBlindTruthProtocolIdentityId',v_existing.research_blind_truth_protocol_identity_id,'hashHex',p_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_blind_truth_protocols_scientific_identities (operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)
  values ('RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1','SYNTRAKE_SHA256_V1',p_hash_hex,p_canonical_payload)
  returning research_blind_truth_protocol_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchBlindTruthProtocolIdentityId',v_id,'hashHex',p_hash_hex);
end;
$$;

create or replace function investing.persist_research_blind_truth_registration_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_auth record; v_existing record; v_id uuid; v_computed_hash text;
  v_protocol record; v_promotion record; v_experiment record; v_subject_experiment_hash text; v_subject_parameters_hash text; v_subject_ir_hash text;
  v_promotion_protocol_hash text; v_promotion_transition_hash text; v_hypothesis_hash text; v_metric_hash text; v_execution_hash text;
  v_spec_id uuid; v_ir_id uuid; v_metric_id uuid; v_execution_id uuid;
begin
  select * into v_auth from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1');
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1', p_canonical_payload);
  if v_computed_hash <> p_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  v_subject_experiment_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['subjectExperiment','hashHex']);
  v_subject_parameters_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['subjectExperimentParameters','hashHex']);
  v_subject_ir_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['subjectResearchIr','hashHex']);
  v_promotion_protocol_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['promotionProtocol','hashHex']);
  v_promotion_transition_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['promotionTransition','hashHex']);
  v_hypothesis_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['hypothesis','hashHex']);
  v_metric_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['metricRequestSet','hashHex']);
  v_execution_hash := investing.rl9b_hash_hex_at_v1(p_canonical_payload, array['executionConfig','hashHex']);
  if v_subject_experiment_hash is null or v_subject_parameters_hash is null or v_subject_ir_hash is null or v_promotion_protocol_hash is null or v_promotion_transition_hash is null or v_hypothesis_hash is null or v_metric_hash is null or v_execution_hash is null then
    raise exception 'MALFORMED_HASHREF';
  end if;
  select * into v_protocol from investing.research_blind_truth_protocols_scientific_identities where hash_hex = 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C' and hash_hex = p_canonical_payload#>>'{protocol,hashHex}' and canonical_payload->>'protocolId' = 'BLIND_TRUTH_PROTOCOL_V20261009';
  if v_protocol.research_blind_truth_protocol_identity_id is null then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;
  select * into v_experiment
  from investing.research_experiments
  where tenant_id = v_auth.tenant_id and principal_id = v_auth.principal_id and tenant_membership_id = v_auth.tenant_membership_id
    and research_investigation_id = v_auth.research_investigation_id and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
    and experiment_hash_hex = v_subject_experiment_hash and experiment_parameters_hash_hex = v_subject_parameters_hash and research_ir_hash_hex = v_subject_ir_hash;
  if v_experiment.research_experiment_id is null then raise exception 'WRONG_SUBJECT'; end if;
  select * into v_promotion from investing.rl9b_assert_current_promotion_leaf_v1(v_auth.tenant_id, v_auth.research_investigation_id, v_subject_experiment_hash, v_subject_parameters_hash, v_subject_ir_hash, v_promotion_protocol_hash, v_promotion_transition_hash);
  select research_spec_identity_id into v_spec_id from investing.research_specs_scientific_identities where tenant_id = v_auth.tenant_id and principal_id = v_auth.principal_id and tenant_membership_id = v_auth.tenant_membership_id and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and research_spec_revision_id = v_experiment.research_spec_revision_id and hypothesis_hash_hex = v_hypothesis_hash;
  if v_spec_id is null then raise exception 'WRONG_SUBJECT_HYPOTHESIS'; end if;
  select research_ir_identity_id into v_ir_id from investing.research_ir_scientific_identities where tenant_id = v_auth.tenant_id and principal_id = v_auth.principal_id and tenant_membership_id = v_auth.tenant_membership_id and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and hash_domain = 'SYNTRAKE:RESEARCH_IR:V1' and hash_hex = v_subject_ir_hash;
  if v_ir_id is null then raise exception 'WRONG_SUBJECT_RESEARCH_IR'; end if;
  select metric_request_set_identity_id into v_metric_id from investing.metric_request_sets_scientific_identities where tenant_id = v_auth.tenant_id and principal_id = v_auth.principal_id and tenant_membership_id = v_auth.tenant_membership_id and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and hash_domain = 'SYNTRAKE:METRIC_REQUEST_SET:V1' and hash_hex = v_metric_hash and metric_registry_version = 'METRIC_REGISTRY_V20260927';
  if v_metric_id is null then raise exception 'INCOMPATIBLE_METRIC_REGISTRY'; end if;
  select execution_config_identity_id into v_execution_id from investing.execution_configs_scientific_identities where tenant_id = v_auth.tenant_id and principal_id = v_auth.principal_id and tenant_membership_id = v_auth.tenant_membership_id and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and hash_domain = 'SYNTRAKE:EXECUTION_CONFIG:V1' and hash_hex = v_execution_hash and engine_compatibility_version = 'ENGINE_V20260926';
  if v_execution_id is null then raise exception 'INCOMPATIBLE_ENGINE_VERSION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_REGISTRATION:' || v_auth.tenant_id::text || ':' || v_subject_experiment_hash || ':' || v_subject_parameters_hash || ':' || v_subject_ir_hash, 0));
  select * into v_existing from investing.research_blind_truth_registrations_scientific_identities
  where tenant_id = v_auth.tenant_id and subject_experiment_hash_hex = v_subject_experiment_hash and subject_experiment_parameters_hash_hex = v_subject_parameters_hash and subject_research_ir_hash_hex = v_subject_ir_hash;
  if v_existing.research_blind_truth_registration_identity_id is not null then
    if v_existing.registration_hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload and v_existing.principal_id = v_auth.principal_id and v_existing.tenant_membership_id = v_auth.tenant_membership_id and v_existing.research_investigation_id = v_auth.research_investigation_id then
      return jsonb_build_object('status','REUSED_IDENTICAL','researchBlindTruthRegistrationIdentityId',v_existing.research_blind_truth_registration_identity_id,'hashHex',p_hash_hex);
    end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_blind_truth_registrations_scientific_identities (
    operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id,
    research_blind_truth_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex,
    promotion_protocol_identity_id, promotion_protocol_hash_hex, promotion_transition_identity_id, promotion_transition_hash_hex, research_spec_identity_id, research_ir_identity_id, hypothesis_hash_hex,
    metric_request_set_identity_id, metric_request_set_hash_hex, execution_config_identity_id, execution_config_hash_hex, registration_hash_algorithm, registration_hash_domain, registration_hash_version, registration_hash_hex, canonical_payload
  ) values (
    'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',v_auth.tenant_id,v_auth.principal_id,v_auth.tenant_membership_id,v_auth.research_investigation_id,v_experiment.research_experiment_id,
    v_protocol.research_blind_truth_protocol_identity_id,v_protocol.hash_hex,v_subject_experiment_hash,v_subject_parameters_hash,v_subject_ir_hash,
    v_promotion.research_scientific_promotion_protocol_identity_id,v_promotion.protocol_hash_hex,v_promotion.research_scientific_promotion_transition_identity_id,v_promotion.transition_hash_hex,v_spec_id,v_ir_id,v_hypothesis_hash,
    v_metric_id,v_metric_hash,v_execution_id,v_execution_hash,'SHA-256','SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1','SYNTRAKE_SHA256_V1',p_hash_hex,p_canonical_payload
  ) returning research_blind_truth_registration_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchBlindTruthRegistrationIdentityId',v_id,'hashHex',p_hash_hex);
end;
$$;

create or replace function investing.rl9b_copy_registration_authority_v1(p_registration_hash text)
returns investing.research_blind_truth_registrations_scientific_identities
language plpgsql stable set search_path = pg_catalog as $$
declare v_registration investing.research_blind_truth_registrations_scientific_identities;
begin
  select * into v_registration
  from investing.research_blind_truth_registrations_scientific_identities
  where registration_hash_hex = p_registration_hash
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true);
  if v_registration.research_blind_truth_registration_identity_id is null then raise exception 'DIVERGENT_EXISTING_IDENTITY'; end if;
  return v_registration;
end;
$$;

create or replace function investing.persist_research_blind_truth_vault_seal_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_auth record; v_reg record; v_existing record; v_id uuid; v_computed_hash text;
begin
  select * into v_auth from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1');
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1', p_canonical_payload);
  if v_computed_hash <> p_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  select * into v_reg from investing.rl9b_copy_registration_authority_v1(p_canonical_payload#>>'{registration,hashHex}');
  if p_canonical_payload#>>'{protocol,hashHex}' <> 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C' then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;
  if p_canonical_payload->>'holdoutScopeDigest' <> investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1', v_reg.canonical_payload->'holdoutScope') then raise exception 'DIVERGENT_EXISTING_IDENTITY'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_SEAL:' || v_reg.research_blind_truth_registration_identity_id::text, 0));
  select * into v_existing from investing.research_blind_truth_vault_seals_scientific_identities where registration_identity_id = v_reg.research_blind_truth_registration_identity_id;
  if v_existing.research_blind_truth_vault_seal_identity_id is not null then
    if v_existing.vault_seal_hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then return jsonb_build_object('status','REUSED_IDENTICAL','researchBlindTruthVaultSealIdentityId',v_existing.research_blind_truth_vault_seal_identity_id,'hashHex',p_hash_hex); end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_blind_truth_vault_seals_scientific_identities (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_blind_truth_protocol_identity_id, protocol_hash_hex, registration_identity_id, registration_hash_hex, vault_seal_hash_algorithm, vault_seal_hash_domain, vault_seal_hash_version, vault_seal_hash_hex, canonical_payload)
  values ('RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',v_reg.tenant_id,v_reg.principal_id,v_reg.tenant_membership_id,v_reg.research_investigation_id,v_reg.research_experiment_id,v_reg.research_blind_truth_protocol_identity_id,v_reg.protocol_hash_hex,v_reg.research_blind_truth_registration_identity_id,v_reg.registration_hash_hex,'SHA-256','SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1','SYNTRAKE_SHA256_V1',p_hash_hex,p_canonical_payload)
  returning research_blind_truth_vault_seal_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchBlindTruthVaultSealIdentityId',v_id,'hashHex',p_hash_hex);
end;
$$;

create or replace function investing.persist_research_blind_truth_evaluation_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_auth record; v_reg record; v_seal record; v_existing record; v_id uuid; v_computed_hash text;
begin
  select * into v_auth from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1');
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_EVALUATION:V1', p_canonical_payload);
  if v_computed_hash <> p_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  select * into v_reg from investing.rl9b_copy_registration_authority_v1(p_canonical_payload#>>'{registration,hashHex}');
  if p_canonical_payload#>>'{protocol,hashHex}' <> 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C' then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;
  if p_canonical_payload->'evaluatorProfile' <> v_reg.canonical_payload->'evaluatorProfile' then raise exception 'INCOMPATIBLE_ENGINE_VERSION'; end if;
  perform investing.rl9b_assert_current_promotion_leaf_v1(v_reg.tenant_id, v_reg.research_investigation_id, v_reg.subject_experiment_hash_hex, v_reg.subject_experiment_parameters_hash_hex, v_reg.subject_research_ir_hash_hex, v_reg.promotion_protocol_hash_hex, v_reg.promotion_transition_hash_hex);
  select * into v_seal from investing.research_blind_truth_vault_seals_scientific_identities where vault_seal_hash_hex = p_canonical_payload#>>'{vaultSeal,hashHex}' and registration_identity_id = v_reg.research_blind_truth_registration_identity_id;
  if v_seal.research_blind_truth_vault_seal_identity_id is null then raise exception 'DIVERGENT_EXISTING_IDENTITY'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_EVALUATION:' || v_reg.research_blind_truth_registration_identity_id::text || ':' || v_seal.research_blind_truth_vault_seal_identity_id::text, 0));
  select * into v_existing from investing.research_blind_truth_evaluations_scientific_identities where registration_identity_id = v_reg.research_blind_truth_registration_identity_id and vault_seal_identity_id = v_seal.research_blind_truth_vault_seal_identity_id;
  if v_existing.research_blind_truth_evaluation_identity_id is not null then
    if v_existing.evaluation_hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then return jsonb_build_object('status','REUSED_IDENTICAL','researchBlindTruthEvaluationIdentityId',v_existing.research_blind_truth_evaluation_identity_id,'hashHex',p_hash_hex); end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_blind_truth_evaluations_scientific_identities (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_blind_truth_protocol_identity_id, protocol_hash_hex, registration_identity_id, registration_hash_hex, vault_seal_identity_id, vault_seal_hash_hex, evaluation_hash_algorithm, evaluation_hash_domain, evaluation_hash_version, evaluation_hash_hex, canonical_payload)
  values ('RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',v_reg.tenant_id,v_reg.principal_id,v_reg.tenant_membership_id,v_reg.research_investigation_id,v_reg.research_experiment_id,v_reg.research_blind_truth_protocol_identity_id,v_reg.protocol_hash_hex,v_reg.research_blind_truth_registration_identity_id,v_reg.registration_hash_hex,v_seal.research_blind_truth_vault_seal_identity_id,v_seal.vault_seal_hash_hex,'SHA-256','SYNTRAKE:BLIND_TRUTH_EVALUATION:V1','SYNTRAKE_SHA256_V1',p_hash_hex,p_canonical_payload)
  returning research_blind_truth_evaluation_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchBlindTruthEvaluationIdentityId',v_id,'hashHex',p_hash_hex);
end;
$$;

create or replace function investing.rl9b_insert_event_v1(p_operation text, p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare v_reg record; v_seal record; v_eval record; v_pred record; v_existing record; v_id uuid; v_state text; v_computed_hash text;
begin
  v_computed_hash := investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1', p_canonical_payload);
  if v_computed_hash <> p_hash_hex then raise exception 'MALFORMED_HASHREF'; end if;
  v_state := p_canonical_payload->>'eventState';
  select * into v_reg from investing.rl9b_copy_registration_authority_v1(p_canonical_payload#>>'{registration,hashHex}');
  if p_canonical_payload#>>'{protocol,hashHex}' <> 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C' then raise exception 'INCOMPATIBLE_PROTOCOL_VERSION'; end if;
  select * into v_seal from investing.research_blind_truth_vault_seals_scientific_identities where vault_seal_hash_hex = p_canonical_payload#>>'{vaultSeal,hashHex}' and registration_identity_id = v_reg.research_blind_truth_registration_identity_id;
  select * into v_eval from investing.research_blind_truth_evaluations_scientific_identities where evaluation_hash_hex = p_canonical_payload#>>'{evaluation,hashHex}' and registration_identity_id = v_reg.research_blind_truth_registration_identity_id and vault_seal_identity_id = v_seal.research_blind_truth_vault_seal_identity_id;
  if v_eval.research_blind_truth_evaluation_identity_id is null then raise exception 'DIVERGENT_EXISTING_IDENTITY'; end if;
  if v_state = 'REVEAL_STARTED' then
    perform investing.rl9b_assert_current_promotion_leaf_v1(v_reg.tenant_id, v_reg.research_investigation_id, v_reg.subject_experiment_hash_hex, v_reg.subject_experiment_parameters_hash_hex, v_reg.subject_research_ir_hash_hex, v_reg.promotion_protocol_hash_hex, v_reg.promotion_transition_hash_hex);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_REVEAL_STARTED:' || v_eval.research_blind_truth_evaluation_identity_id::text, 0));
    select * into v_existing from investing.research_blind_truth_reveal_result_events_scientific_identities where evaluation_identity_id = v_eval.research_blind_truth_evaluation_identity_id and event_state = 'REVEAL_STARTED';
  else
    select * into v_pred from investing.research_blind_truth_reveal_result_events_scientific_identities where event_hash_hex = p_canonical_payload#>>'{predecessorEvent,hashHex}' and evaluation_identity_id = v_eval.research_blind_truth_evaluation_identity_id and event_state = 'REVEAL_STARTED';
    if v_pred.research_blind_truth_reveal_result_event_identity_id is null then raise exception 'AMBIGUOUS_EVENT_CHAIN'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_FINAL_EVENT:' || v_pred.research_blind_truth_reveal_result_event_identity_id::text, 0));
    select * into v_existing from investing.research_blind_truth_reveal_result_events_scientific_identities where predecessor_event_identity_id = v_pred.research_blind_truth_reveal_result_event_identity_id;
  end if;
  if v_existing.research_blind_truth_reveal_result_event_identity_id is not null then
    if v_existing.event_hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then return jsonb_build_object('status','REUSED_IDENTICAL','researchBlindTruthRevealResultEventIdentityId',v_existing.research_blind_truth_reveal_result_event_identity_id,'hashHex',p_hash_hex); end if;
    return jsonb_build_object('status','DIVERGENT_EXISTING_IDENTITY');
  end if;
  insert into investing.research_blind_truth_reveal_result_events_scientific_identities (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_blind_truth_protocol_identity_id, protocol_hash_hex, registration_identity_id, registration_hash_hex, vault_seal_identity_id, vault_seal_hash_hex, evaluation_identity_id, evaluation_hash_hex, predecessor_event_identity_id, predecessor_event_hash_hex, event_state, reason, event_hash_algorithm, event_hash_domain, event_hash_version, event_hash_hex, canonical_payload)
  values (p_operation,'RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',v_reg.tenant_id,v_reg.principal_id,v_reg.tenant_membership_id,v_reg.research_investigation_id,v_reg.research_experiment_id,v_reg.research_blind_truth_protocol_identity_id,v_reg.protocol_hash_hex,v_reg.research_blind_truth_registration_identity_id,v_reg.registration_hash_hex,v_seal.research_blind_truth_vault_seal_identity_id,v_seal.vault_seal_hash_hex,v_eval.research_blind_truth_evaluation_identity_id,v_eval.evaluation_hash_hex,case when v_state = 'REVEAL_STARTED' then null else v_pred.research_blind_truth_reveal_result_event_identity_id end,case when v_state = 'REVEAL_STARTED' then null else v_pred.event_hash_hex end,v_state,p_canonical_payload->>'reason','SHA-256','SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1','SYNTRAKE_SHA256_V1',p_hash_hex,p_canonical_payload)
  returning research_blind_truth_reveal_result_event_identity_id into v_id;
  return jsonb_build_object('status','CREATED','researchBlindTruthRevealResultEventIdentityId',v_id,'hashHex',p_hash_hex);
end;
$$;

create or replace function investing.persist_research_blind_truth_reveal_started_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform 1 from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1');
  if p_canonical_payload->>'eventState' <> 'REVEAL_STARTED' then raise exception 'AMBIGUOUS_EVENT_CHAIN'; end if;
  return investing.rl9b_insert_event_v1('RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1', p_hash_hex, p_canonical_payload);
end;
$$;

create or replace function investing.persist_research_blind_truth_final_event_v1(p_hash_hex text, p_canonical_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform 1 from investing.rl9b_assert_writer_authority_v1('RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1');
  if p_canonical_payload->>'eventState' not in ('REVEAL_COMPLETED','REVEAL_FAILED_CLOSED') then raise exception 'AMBIGUOUS_EVENT_CHAIN'; end if;
  return investing.rl9b_insert_event_v1('RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1', p_hash_hex, p_canonical_payload);
end;
$$;

revoke all on function investing.rl9b_assert_writer_authority_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_hash_hex_at_v1(jsonb,text[]) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_assert_current_promotion_leaf_v1(uuid,uuid,text,text,text,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_copy_registration_authority_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_insert_event_v1(text,text,jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.persist_research_blind_truth_protocol_v1(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_blind_truth_registration_v1(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_blind_truth_vault_seal_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.persist_research_blind_truth_evaluation_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.persist_research_blind_truth_reveal_started_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.persist_research_blind_truth_final_event_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.persist_research_blind_truth_protocol_v1(text,jsonb) to investing_app;
grant execute on function investing.persist_research_blind_truth_registration_v1(text,jsonb) to investing_app;

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in ('persist_research_blind_truth_protocol_v1','persist_research_blind_truth_registration_v1','persist_research_blind_truth_vault_seal_v1','persist_research_blind_truth_evaluation_v1','persist_research_blind_truth_reveal_started_v1','persist_research_blind_truth_final_event_v1')
    and p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog'];
  if v_count <> 6 then raise exception 'RL-9B2 postcondition failed: writer SECURITY DEFINER/search_path mismatch'; end if;
  if has_function_privilege('anon','investing.persist_research_blind_truth_protocol_v1(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','investing.persist_research_blind_truth_protocol_v1(text,jsonb)','EXECUTE') or has_function_privilege('service_role','investing.persist_research_blind_truth_protocol_v1(text,jsonb)','EXECUTE') then raise exception 'RL-9B2 postcondition failed: forbidden protocol writer execute'; end if;
  if not has_function_privilege('investing_app','investing.persist_research_blind_truth_protocol_v1(text,jsonb)','EXECUTE') or not has_function_privilege('investing_app','investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE') then raise exception 'RL-9B2 postcondition failed: public writer allowlist missing'; end if;
  if has_function_privilege('investing_app','investing.persist_research_blind_truth_vault_seal_v1(text,jsonb)','EXECUTE') or has_function_privilege('investing_app','investing.persist_research_blind_truth_evaluation_v1(text,jsonb)','EXECUTE') or has_function_privilege('investing_app','investing.persist_research_blind_truth_reveal_started_v1(text,jsonb)','EXECUTE') or has_function_privilege('investing_app','investing.persist_research_blind_truth_final_event_v1(text,jsonb)','EXECUTE') then raise exception 'RL-9B2 postcondition failed: secret/evaluator-dependent writer granted too early'; end if;
  select count(*) into v_count
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in ('persist_research_blind_truth_protocol_v1','persist_research_blind_truth_registration_v1','persist_research_blind_truth_vault_seal_v1','persist_research_blind_truth_evaluation_v1','persist_research_blind_truth_reveal_started_v1','persist_research_blind_truth_final_event_v1')
    and pg_catalog.pg_get_userbyid(p.proowner) = 'investing_rl9_writer';
  if v_count <> 6 then raise exception 'RL-9B2 postcondition failed: writer function owner mismatch'; end if;
end $$;

reset role;
set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
reset role;
revoke investing_rl9_writer from postgres;

do $$
begin
  -- Verify actual grant paths after REVOKE, not the superuser's implicit
  -- ability to act as any role (pg_has_role(..., 'MEMBER') is true for superusers).
  if exists (
    with recursive granted_roles(roleid) as (
      select m.roleid
      from pg_catalog.pg_auth_members m
      where m.member = 'postgres'::regrole
      union
      select m.roleid
      from pg_catalog.pg_auth_members m
      join granted_roles g on g.roleid = m.member
    )
    select 1 from granted_roles
    where roleid = 'investing_rl9_writer'::regrole
  ) or has_schema_privilege('investing_rl9_writer','investing','CREATE') then
    raise exception 'RL-9B2 postcondition failed: residual bootstrap privilege';
  end if;
end $$;

commit;