begin;
do $$ begin
  if exists(select 1 from
    public.investing_research_portfolio_risk_capacity_assessments)
    or exists(select 1 from
    public.investing_research_portfolio_risk_capacity_members) then
    raise exception using errcode='55000',
      message='phase6k_rollback_refused_risk_capacity_evidence_exists';
  end if;
end $$;
drop table public.investing_research_portfolio_risk_capacity_members;
drop table public.investing_research_portfolio_risk_capacity_assessments;
drop function public.investing_research_phase6k_member_chain_v1();
drop function public.investing_research_phase6k_immutable_v1();
commit;
