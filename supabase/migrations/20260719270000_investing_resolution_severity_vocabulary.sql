-- Align the resolution RPC with the pre-existing reconciliation severity
-- vocabulary (`informational`, not execution-event severity `info`).
create or replace function public.investing_resolve_reconciliation_item_v2(
  p_actor_user_id text,
  p_item_id uuid,
  p_resolution_type text,
  p_note text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_item public.investing_reconciliation_items%rowtype;
  v_run public.investing_reconciliation_runs%rowtype;
  v_existing public.investing_reconciliation_resolutions%rowtype;
  v_id uuid;
begin
  if p_resolution_type not in ('corrected','accepted_informational') then
    raise exception 'investing_resolution_type_invalid';
  end if;
  if coalesce(length(btrim(p_note)),0)<3 or coalesce(length(btrim(p_correlation_id)),0)<8 then
    raise exception 'investing_resolution_context_invalid';
  end if;

  select i.* into v_item
  from public.investing_reconciliation_items i
  join public.investing_reconciliation_runs r on r.id=i.run_id
  where i.id=p_item_id and r.user_id=p_actor_user_id and r.environment='paper'
  for update of i;
  if not found then raise exception 'investing_reconciliation_item_not_found_or_forbidden'; end if;
  select * into v_run from public.investing_reconciliation_runs where id=v_item.run_id;

  if p_resolution_type='accepted_informational' and v_item.severity<>'informational' then
    raise exception 'investing_material_break_cannot_be_accepted';
  end if;

  select * into v_existing
  from public.investing_reconciliation_resolutions
  where account_id=v_run.account_id and correlation_id=p_correlation_id;
  if found then
    if v_existing.item_id<>p_item_id
       or v_existing.resolution_type<>p_resolution_type
       or v_existing.note<>btrim(p_note) then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object('ok',true,'replayed',true,'resolution_id',v_existing.id,'item_id',p_item_id);
  end if;

  insert into public.investing_reconciliation_resolutions(
    item_id,user_id,account_id,resolution_type,note,correlation_id
  ) values (
    p_item_id,p_actor_user_id,v_run.account_id,p_resolution_type,btrim(p_note),p_correlation_id
  ) returning id into v_id;

  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,event_type,severity,environment,
    correlation_id,engine_version,payload
  ) values (
    v_run.user_id,v_run.portfolio_id,v_run.account_id,'reconciliation_break_resolution_recorded',
    'info','paper',p_correlation_id,'investing_v2',
    jsonb_build_object('resolution_id',v_id,'item_id',p_item_id,'run_id',v_run.id,
      'resolution_type',p_resolution_type,'original_severity',v_item.severity)
  );

  return jsonb_build_object('ok',true,'replayed',false,'resolution_id',v_id,'item_id',p_item_id);
end;
$$;

revoke all on function public.investing_resolve_reconciliation_item_v2(text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.investing_resolve_reconciliation_item_v2(text,uuid,text,text,text)
  to service_role;
