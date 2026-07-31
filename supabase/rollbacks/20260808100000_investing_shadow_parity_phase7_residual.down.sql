begin;
do $$ begin
  if exists(select 1 from public.investing_shadow_parity_cycles) then
    raise exception using errcode='55000',message='phase7_shadow_parity_rollback_refused_evidence_exists';
  end if;
end $$;
drop table public.investing_shadow_parity_cycles;
drop function public.investing_shadow_parity_immutable_v1();
commit;
