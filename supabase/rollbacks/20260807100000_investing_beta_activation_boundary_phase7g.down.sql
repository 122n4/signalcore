begin;
do $$ begin if exists(select 1 from public.investing_beta_activation_decisions) then raise exception
 using errcode='55000',message='phase7g_rollback_refused_activation_evidence_exists'; end if; end $$;
drop table public.investing_beta_activation_decisions;
drop function public.investing_phase7g_immutable_v1();
commit;
