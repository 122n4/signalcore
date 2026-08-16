\set ON_ERROR_STOP on

begin;

do $$
declare
  split_def text;
  account_a uuid;
begin
  select pg_get_functiondef('public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)'::regprocedure)
  into split_def;

  if position('investing_split_effective_at_required' in split_def) = 0
     or position('investing_split_effective_at_invalid' in split_def) = 0
     or position('investing_split_effective_at_future' in split_def) = 0
     or position('v_effective_at_canonical' in split_def) = 0 then
    raise exception 'r6_overlay_split_effective_time_validation_missing';
  end if;
  if position('coalesce(p_effective_at,now())' in replace(split_def, ' ', '')) > 0 then
    raise exception 'r6_overlay_split_null_effective_time_still_defaulted';
  end if;
  if position('''effective_at'',v_effective_at_canonical' in replace(split_def, ' ', '')) = 0 then
    raise exception 'r6_overlay_split_payload_identity_missing_effective_time';
  end if;

  select id
  into account_a
  from public.investing_accounts
  where user_id = 'r6_overlay_user_a'
    and portfolio_id = 'r6-overlay-portfolio-a';

  begin
    perform public.investing_apply_split_v2(
      'r6_overlay_user_a',
      account_a,
      'VWCE',
      2,
      'split',
      'r6-overlay-null-split',
      'r6-overlay-null-split-corr',
      null
    );
    raise exception 'r6_overlay_split_null_effective_time_accepted';
  exception when others then
    if sqlerrm not like '%investing_split_effective_at_required%' then
      raise;
    end if;
  end;

  begin
    perform public.investing_apply_split_v2(
      'r6_overlay_user_a',
      account_a,
      'VWCE',
      2,
      'split',
      'r6-overlay-future-split',
      'r6-overlay-future-split-corr',
      statement_timestamp() + interval '6 minutes'
    );
    raise exception 'r6_overlay_split_future_effective_time_accepted';
  exception when others then
    if sqlerrm not like '%investing_split_effective_at_future%' then
      raise;
    end if;
  end;
end $$;

select r6_overlay_rehearsal.assert_existing_rows_unchanged();
select r6_overlay_rehearsal.capture_object_snapshot('post_20260813201607');

commit;

\echo 'R6 production overlay post-20260813201607 assertions passed'
