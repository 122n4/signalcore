begin;
do $$ begin
 if exists(select 1 from public.investing_research_promotion_eligibility)
  or exists(select 1 from public.investing_research_promotion_requests)
  or exists(select 1 from public.investing_research_promotion_revocations) then
  raise exception using errcode='55000',
   message='phase6m_rollback_refused_promotion_evidence_exists';
 end if;
end $$;
drop table public.investing_research_promotion_revocations;
drop table public.investing_research_promotion_requests;
drop table public.investing_research_promotion_eligibility;
drop function public.investing_research_phase6m_chain_v1();
drop function public.investing_research_phase6m_immutable_v1();
commit;
