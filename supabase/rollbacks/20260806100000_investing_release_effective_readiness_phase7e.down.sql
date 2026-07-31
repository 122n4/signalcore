begin;
do $$ begin if exists(select 1 from public.investing_release_candidates) then raise exception
 using errcode='55000',message='phase7e_rollback_refused_release_evidence_exists'; end if; end $$;
drop table public.investing_effective_readiness_revocations;
drop table public.investing_effective_beta_readiness;
drop table public.investing_release_candidates;
drop function public.investing_phase7e_immutable_v1();
commit;
