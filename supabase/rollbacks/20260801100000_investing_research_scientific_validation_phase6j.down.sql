begin;
do $$ begin
  if exists(select 1 from public.investing_research_validation_reports)
    or exists(select 1 from public.investing_research_scientific_decisions) then
    raise exception using errcode='55000',
      message='phase6j_rollback_refused_scientific_evidence_exists';
  end if;
end $$;
drop function public.investing_research_validation_persist_v1(
  uuid,text,text,uuid,text,text,jsonb,text,text,jsonb);
drop table public.investing_research_scientific_decisions;
drop table public.investing_research_validation_reports;
drop function public.investing_research_phase6j_immutable_v1();
commit;
