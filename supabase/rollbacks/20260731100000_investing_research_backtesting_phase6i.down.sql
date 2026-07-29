begin;
do $$ begin
  if exists(select 1 from public.investing_research_experiments)
    or exists(select 1 from public.investing_research_experiment_runs)
    or exists(select 1 from public.investing_research_jobs) then
    raise exception using errcode='55000',
      message='phase6i_rollback_refused_scientific_history_exists';
  end if;
end $$;
drop function public.investing_research_job_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,integer,text,text,jsonb,text);
drop function public.investing_research_job_retry_v1(uuid,text,text,uuid,text,bigint,text,text,integer);
drop function public.investing_research_job_cancel_v1(uuid,text,text,uuid,text);
drop function public.investing_research_job_start_v1(uuid,text,text,uuid,text,text,text,bigint,integer);
drop function public.investing_research_job_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,integer,integer);
drop function public.investing_research_job_claim_v1(uuid,text,text,uuid,text,text,text,integer);
drop table public.investing_research_jobs;
drop table public.investing_research_experiment_runs;
drop table public.investing_research_experiments;
drop function public.investing_research_experiment_eligibility_guard_v1();
drop function public.investing_research_phase6i_terminal_guard_v1();
commit;
