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

savepoint r6_overlay_split_effective_time_behavior;

do $$
declare
  account_a uuid;
  t1 timestamptz := statement_timestamp() - interval '2 hours';
  t2 timestamptz := statement_timestamp() - interval '1 hour';
  t1_canonical text;
  first_result jsonb;
  replay_result jsonb;
  first_action_id uuid;
  recorded_effective_at timestamptz;
  recorded_payload jsonb;
begin
  select id
  into account_a
  from public.investing_accounts
  where user_id = 'r6_overlay_user_a'
    and portfolio_id = 'r6-overlay-portfolio-a';

  if account_a is null then
    raise exception 'r6_overlay_split_behavior_account_missing';
  end if;
  if t1 = t2 or t1 > statement_timestamp() or t2 > statement_timestamp() then
    raise exception 'r6_overlay_split_behavior_times_invalid';
  end if;

  t1_canonical := to_char(t1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

  select public.investing_apply_split_v2(
    'r6_overlay_user_a',
    account_a,
    'VWCE',
    2,
    'split',
    'r6-overlay-effective-time-key',
    'r6-overlay-effective-time-corr-1',
    t1
  )
  into first_result;

  if first_result->>'ok' <> 'true' or first_result->>'replayed' <> 'false' then
    raise exception 'r6_overlay_split_behavior_first_call_unexpected:%', first_result;
  end if;

  first_action_id := (first_result->>'corporate_action_id')::uuid;
  if first_action_id is null then
    raise exception 'r6_overlay_split_behavior_first_action_missing';
  end if;

  select effective_at, payload
  into recorded_effective_at, recorded_payload
  from public.investing_corporate_actions
  where id = first_action_id;

  if recorded_effective_at is distinct from t1 then
    raise exception 'r6_overlay_split_behavior_effective_at_not_recorded:%:%',
      recorded_effective_at, t1;
  end if;
  if recorded_payload->>'effective_at' <> t1_canonical then
    raise exception 'r6_overlay_split_behavior_payload_effective_at_not_canonical:%:%',
      recorded_payload->>'effective_at', t1_canonical;
  end if;

  select public.investing_apply_split_v2(
    'r6_overlay_user_a',
    account_a,
    'VWCE',
    2,
    'split',
    'r6-overlay-effective-time-key',
    'r6-overlay-effective-time-corr-2',
    t1
  )
  into replay_result;

  if replay_result->>'ok' <> 'true'
     or replay_result->>'replayed' <> 'true'
     or (replay_result->>'corporate_action_id')::uuid <> first_action_id then
    raise exception 'r6_overlay_split_behavior_replay_unexpected:%', replay_result;
  end if;

  begin
    perform public.investing_apply_split_v2(
      'r6_overlay_user_a',
      account_a,
      'VWCE',
      2,
      'split',
      'r6-overlay-effective-time-key',
      'r6-overlay-effective-time-corr-3',
      t2
    );
    raise exception 'r6_overlay_split_behavior_effective_time_mismatch_accepted';
  exception when others then
    if sqlerrm not like '%investing_idempotency_payload_mismatch%' then
      raise;
    end if;
  end;
end $$;

rollback to savepoint r6_overlay_split_effective_time_behavior;
release savepoint r6_overlay_split_effective_time_behavior;

select r6_overlay_rehearsal.assert_existing_rows_unchanged();
select r6_overlay_rehearsal.capture_object_snapshot('post_20260813201607');

commit;

\echo 'R6 production overlay post-20260813201607 assertions passed'
