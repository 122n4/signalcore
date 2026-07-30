begin;
do $$ begin
 if exists(select 1 from public.investing_research_audit_events) then
  raise exception using errcode='55000',
   message='phase6l_rollback_refused_scientific_memory_exists';
 end if;
end $$;
drop table public.investing_research_audit_events;
drop function public.investing_research_phase6l_event_chain_v1();
drop function public.investing_research_phase6l_immutable_v1();
commit;
