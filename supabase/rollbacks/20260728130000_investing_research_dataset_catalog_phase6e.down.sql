-- FASE 6E fail-closed rollback: destructive rollback is allowed only before data.
do $$
begin
  if exists (select 1 from public.investing_research_dataset_lineage)
    or exists (select 1 from public.investing_research_dataset_versions)
    or exists (select 1 from public.investing_research_datasets)
    or exists (select 1 from public.investing_research_acquisition_jobs)
    or exists (select 1 from public.investing_research_dataset_requests) then
    raise exception 'investing_research_phase6e_rollback_refuses_preserved_evidence';
  end if;
end $$;

drop table public.investing_research_dataset_lineage;
drop table public.investing_research_dataset_versions;
drop table public.investing_research_datasets;
drop table public.investing_research_acquisition_jobs;
drop table public.investing_research_dataset_requests;
alter table public.investing_accounts
  drop constraint investing_accounts_phase6e_scope_parent_unique;
drop function public.investing_research_has_exact_scope_v1(uuid,text,text,uuid);
drop function public.investing_research_dataset_version_job_guard_v1();
drop function public.investing_research_acquisition_transition_guard_v1();
drop function public.investing_research_acquisition_attempt_guard_v1();
drop function public.investing_research_immutable_guard_v1();
drop function public.investing_research_acquisition_outcome_valid_v1(text,jsonb);
drop function public.investing_research_jsonb_exact_keys_v1(jsonb,text[]);
