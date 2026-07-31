begin;
do $$ begin if exists(select 1 from public.investing_research_beta_readiness_reports) then
 raise exception using errcode='55000',message='phase7b_rollback_refused_readiness_evidence_exists';
end if; end $$;
drop table public.investing_research_beta_readiness_reports;
drop function public.investing_research_phase7b_immutable_v1();
commit;
