begin;

do $$
begin
  if exists (select 1 from public.investing_research_dataset_quality_reports)
    or exists (select 1 from public.investing_research_dataset_versions where quality_report_id is not null) then
    raise exception using errcode='55000', message='phase6f_rollback_refused_quality_data_exists';
  end if;
end $$;

drop trigger investing_research_quality_publication_guard on public.investing_research_dataset_versions;
drop function public.investing_research_quality_publication_guard_v1();
drop trigger investing_research_quality_report_immutable on public.investing_research_dataset_quality_reports;
drop trigger investing_research_quality_report_guard on public.investing_research_dataset_quality_reports;
drop function public.investing_research_quality_report_guard_v1();
drop function public.investing_research_quality_sha256_v1(text);

alter table public.investing_research_dataset_versions
  drop constraint investing_research_dataset_version_quality_report_fk,
  drop constraint investing_research_dataset_version_source_fk,
  drop constraint investing_research_dataset_version_state,
  drop constraint investing_research_dataset_version_payload;

alter table public.investing_research_dataset_versions
  drop column quality_report_id,
  drop column source_dataset_version_id,
  add constraint investing_research_dataset_version_state check (
    quality_state = 'awaiting_quality' and qualified_at is null
  ),
  add constraint investing_research_dataset_version_payload check (
    jsonb_typeof(canonical_payload) = 'object'
    and canonical_payload ->> 'state' = 'awaiting_quality'
    and canonical_payload ->> 'requirementId' = request_id
    and canonical_payload ->> 'acquisitionJobId' = acquisition_job_id
    and (canonical_payload ->> 'acquisitionAttempt')::integer = acquisition_attempt
    and canonical_payload #>> '{storage,integrityState}' = 'verified'
    and canonical_payload #>> '{storage,normalizedContentHash}' = content_hash
    and canonical_payload #>> '{storage,key}' !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
  );

drop table public.investing_research_dataset_quality_reports;
comment on column public.investing_research_dataset_versions.quality_state is
  'Phase 6E permits awaiting_quality only; Phase 6F owns future qualification.';

commit;
