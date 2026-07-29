begin;
do $$
begin
  if exists(select 1 from public.investing_research_candidates)
    or exists(select 1 from public.investing_research_hypotheses) then
    raise exception using errcode='55000',
      message='phase6h_rollback_refused_scientific_history_exists';
  end if;
end $$;
drop table public.investing_research_candidates;
drop table public.investing_research_hypotheses;
drop function public.investing_research_candidate_version_guard_v1();
drop function public.investing_research_hypothesis_version_guard_v1();
commit;
