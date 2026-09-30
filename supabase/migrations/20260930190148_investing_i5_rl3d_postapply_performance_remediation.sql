-- I5 RL-3D post-apply performance remediation.
-- Scope is intentionally narrow:
--   * five covering indexes for the five RL-3D foreign keys flagged in Production;
--   * initplan-safe current_setting() access for the eleven RL-3D policies.
-- No grants, ownership, RLS mode, trigger, function, scientific state, or financial data changes.

begin;

do $$
declare
  v_mismatches text[];
  v_fk_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'RL-3D postapply performance remediation executor violation: expected postgres, got %', current_user;
  end if;

  if to_regclass('investing.research_validation_assessment_protocols_scientific_identities') is null
     or to_regclass('investing.research_validation_assessment_results_scientific_identities') is null then
    raise exception 'RL-3D postapply performance remediation prestate violation: RL-3D assessment relations missing';
  end if;

  select array_agg(format('%I.%I.%I', expected.schemaname, expected.tablename, expected.policyname) order by expected.policyname)
  into v_mismatches
  from (
    values
      ('investing','principals','principals_rl3d_assessment_read','SELECT','e1229d313cbeb6c089943419af3ba7ec'),
      ('investing','research_evidence_objects_scientific_identities','research_evidence_rl3d_assessment_read','SELECT','755137701bb29c9a36d778e3aee373e7'),
      ('investing','research_result_artifacts','research_result_artifacts_rl3d_assessment_read','SELECT','755137701bb29c9a36d778e3aee373e7'),
      ('investing','research_results_scientific_identities','research_results_rl3d_assessment_read','SELECT','755137701bb29c9a36d778e3aee373e7'),
      ('investing','run_inputs_scientific_identities','research_run_inputs_rl3d_assessment_read','SELECT','bf2a249c985103a6d7d65497d55f8735'),
      ('investing','research_validation_assessment_protocols_scientific_identities','research_validation_assessment_protocol_insert','INSERT','04fb881b66d639c01386764ede5df500'),
      ('investing','research_validation_assessment_protocols_scientific_identities','research_validation_assessment_protocol_select','SELECT','dea6cb398a3ed03630dd1e68f07ebe86'),
      ('investing','research_validation_assessment_results_scientific_identities','research_validation_assessment_result_insert','INSERT','ae33bf3f104244c09c38b17627a992b9'),
      ('investing','research_validation_assessment_results_scientific_identities','research_validation_assessment_result_select','SELECT','1f16136104c1505f0127555a18711d5a'),
      ('investing','tenant_memberships','tenant_memberships_rl3d_assessment_read','SELECT','1f793576c6384ca69a9c5a43be8cf852'),
      ('investing','tenants','tenants_rl3d_assessment_read','SELECT','75578fda15166601318a442fea0b580c')
  ) expected(schemaname, tablename, policyname, cmd, digest)
  left join pg_policies p
    on p.schemaname=expected.schemaname
   and p.tablename=expected.tablename
   and p.policyname=expected.policyname
  where p.policyname is null
     or p.permissive <> 'PERMISSIVE'
     or p.roles::text[] <> array['investing_app']
     or p.cmd <> expected.cmd
     or md5(coalesce(p.qual,'') || '|' || coalesce(p.with_check,'')) <> expected.digest;

  if v_mismatches is not null then
    raise exception 'RL-3D postapply performance remediation prestate violation: policy drift %', v_mismatches;
  end if;

  select count(*)::integer into v_fk_count
  from pg_constraint
  where contype='f'
    and conname in (
      'research_validation_assessment_protocols_authority_tuple_fk',
      'research_validation_assessment_protocols_validation_protocol_fk',
      'research_validation_assessment_results_authority_tuple_fk',
      'research_validation_assessment_results_protocol_fk',
      'research_validation_assessment_results_validation_result_fk'
    );

  if v_fk_count <> 5 then
    raise exception 'RL-3D postapply performance remediation prestate violation: expected 5 target foreign keys, got %', v_fk_count;
  end if;

  if to_regclass('investing.rl3d_assessment_protocols_authority_fk_idx') is not null
     or to_regclass('investing.rl3d_assessment_protocols_validation_fk_idx') is not null
     or to_regclass('investing.rl3d_assessment_results_authority_fk_idx') is not null
     or to_regclass('investing.rl3d_assessment_results_protocol_fk_idx') is not null
     or to_regclass('investing.rl3d_assessment_results_validation_result_fk_idx') is not null then
    raise exception 'RL-3D postapply performance remediation prestate violation: remediation index already exists';
  end if;
end $$;

set local role investing_owner;

create index rl3d_assessment_protocols_authority_fk_idx
  on investing.research_validation_assessment_protocols_scientific_identities (
    tenant_membership_id,
    tenant_id,
    principal_id
  );

create index rl3d_assessment_protocols_validation_fk_idx
  on investing.research_validation_assessment_protocols_scientific_identities (
    research_validation_protocol_identity_id,
    research_investigation_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create index rl3d_assessment_results_authority_fk_idx
  on investing.research_validation_assessment_results_scientific_identities (
    tenant_membership_id,
    tenant_id,
    principal_id
  );

create index rl3d_assessment_results_protocol_fk_idx
  on investing.research_validation_assessment_results_scientific_identities (
    research_validation_assessment_protocol_identity_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create index rl3d_assessment_results_validation_result_fk_idx
  on investing.research_validation_assessment_results_scientific_identities (
    research_validation_result_identity_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

alter policy principals_rl3d_assessment_read
on investing.principals
using (
  (select current_setting('syntrake.investing.operation', true)) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and external_provider = 'CLERK'
  and external_subject = (select current_setting('syntrake.investing.external_subject', true))
);


alter policy tenants_rl3d_assessment_read
on investing.tenants
using (
  (select current_setting('syntrake.investing.operation', true)) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and state = 'ACTIVE'
);


alter policy tenant_memberships_rl3d_assessment_read
on investing.tenant_memberships
using (
  (select current_setting('syntrake.investing.operation', true)) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and role = 'OWNER'
  and state = 'ACTIVE'
);


alter policy research_validation_assessment_protocol_select
on investing.research_validation_assessment_protocols_scientific_identities
using (
  (
    (
      (select current_setting('syntrake.investing.operation', true)) in (
        'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
        'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
      )
      and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    )
    or (
      (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
      and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    )
  )
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
);


alter policy research_validation_assessment_protocol_insert
on investing.research_validation_assessment_protocols_scientific_identities
with check (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
);


alter policy research_validation_assessment_result_select
on investing.research_validation_assessment_results_scientific_identities
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
);


alter policy research_validation_assessment_result_insert
on investing.research_validation_assessment_results_scientific_identities
with check (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
);


alter policy research_run_inputs_rl3d_assessment_read
on investing.run_inputs_scientific_identities
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and account_id is null
);


alter policy research_results_rl3d_assessment_read
on investing.research_results_scientific_identities
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and account_id is null
);


alter policy research_result_artifacts_rl3d_assessment_read
on investing.research_result_artifacts
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and account_id is null
);


alter policy research_evidence_rl3d_assessment_read
on investing.research_evidence_objects_scientific_identities
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and account_id is null
);


do $$
declare
  v_bad_policy text[];
  v_bad_index text[];
begin
  select array_agg(p.policyname order by p.policyname)
  into v_bad_policy
  from pg_policies p
  where p.schemaname='investing'
    and p.policyname in (
      'principals_rl3d_assessment_read',
      'tenants_rl3d_assessment_read',
      'tenant_memberships_rl3d_assessment_read',
      'research_validation_assessment_protocol_select',
      'research_validation_assessment_protocol_insert',
      'research_validation_assessment_result_select',
      'research_validation_assessment_result_insert',
      'research_run_inputs_rl3d_assessment_read',
      'research_results_rl3d_assessment_read',
      'research_result_artifacts_rl3d_assessment_read',
      'research_evidence_rl3d_assessment_read'
    )
    and regexp_count(lower(coalesce(p.qual,'') || '|' || coalesce(p.with_check,'')), 'current_setting[(]')
      <> regexp_count(lower(coalesce(p.qual,'') || '|' || coalesce(p.with_check,'')), 'select[[:space:]]+current_setting[(]');

  if v_bad_policy is not null then
    raise exception 'RL-3D postapply performance remediation poststate violation: non-initplan-safe policies %', v_bad_policy;
  end if;

  select array_agg(expected.index_name order by expected.index_name)
  into v_bad_index
  from (
    values
      ('rl3d_assessment_protocols_authority_fk_idx'),
      ('rl3d_assessment_protocols_validation_fk_idx'),
      ('rl3d_assessment_results_authority_fk_idx'),
      ('rl3d_assessment_results_protocol_fk_idx'),
      ('rl3d_assessment_results_validation_result_fk_idx')
  ) expected(index_name)
  left join pg_class c on c.oid=to_regclass('investing.' || expected.index_name)
  left join pg_index i on i.indexrelid=c.oid
  where c.oid is null
     or pg_get_userbyid(c.relowner) <> 'investing_owner'
     or not i.indisvalid
     or not i.indisready;

  if v_bad_index is not null then
    raise exception 'RL-3D postapply performance remediation poststate violation: invalid indexes %', v_bad_index;
  end if;
end $$;

commit;
