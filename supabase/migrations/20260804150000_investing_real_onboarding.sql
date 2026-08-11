create extension if not exists pgcrypto;
create table if not exists public.investing_onboarding_progress (
  user_id text primary key,
  account_id uuid,
  portfolio_id text,
  locale text not null default 'en' check (locale in ('en','pt-PT','fr-FR')),
  onboarding_version text not null default 'investing-onboarding/v1',
  current_step integer not null default 1 check (current_step between 1 and 9),
  status text not null default 'new' check (status in ('new','in_progress','paused','completed','abandoned')),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  idempotency_key text,
  progress_fingerprint text not null check (progress_fingerprint ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint investing_onboarding_account_scope_fk
    foreign key (account_id) references public.investing_accounts(id),
  constraint investing_onboarding_completed_shape_check check (
    (status = 'completed' and current_step = 9 and account_id is not null and portfolio_id is not null)
    or status <> 'completed'
  )
);
alter table public.investing_onboarding_progress enable row level security;
alter table public.investing_onboarding_progress force row level security;
revoke all on public.investing_onboarding_progress from public, anon, authenticated, service_role;
create or replace function public.read_investing_onboarding_progress_v1(p_user_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select to_jsonb(p) from public.investing_onboarding_progress p where p.user_id = p_user_id), null::jsonb);
$$;
create or replace function public.save_investing_onboarding_progress_v1(
  p_actor_user_id text,
  p_expected_revision integer,
  p_progress jsonb,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  current_row public.investing_onboarding_progress%rowtype;
  next_revision integer;
  fingerprint text;
  requested_step integer;
  requested_status text;
  requested_locale text;
  requested_draft jsonb;
begin
  if coalesce(btrim(p_actor_user_id),'') = '' or p_progress is null or jsonb_typeof(p_progress) <> 'object'
     or coalesce(btrim(p_idempotency_key),'') = '' then
    raise exception 'investing_onboarding_invalid_progress';
  end if;
  requested_step := coalesce((p_progress->>'currentStep')::integer, 1);
  requested_status := coalesce(nullif(p_progress->>'status',''), 'in_progress');
  requested_locale := coalesce(nullif(p_progress->>'locale',''), 'en');
  requested_draft := coalesce(p_progress->'draft', '{}'::jsonb);
  if requested_step not between 1 and 9 or requested_status not in ('new','in_progress','paused','completed','abandoned')
     or requested_locale not in ('en','pt-PT','fr-FR') or jsonb_typeof(requested_draft) <> 'object' then
    raise exception 'investing_onboarding_invalid_progress';
  end if;
  fingerprint := encode(digest(convert_to(public.investing_canonical_json_text_v1(jsonb_build_object(
    'currentStep',requested_step,'status',requested_status,'locale',requested_locale,'draft',requested_draft
  )),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('investing-onboarding:'||p_actor_user_id, 0));
  select * into current_row from public.investing_onboarding_progress where user_id = p_actor_user_id for update;
  if found then
    if current_row.idempotency_key = p_idempotency_key and current_row.progress_fingerprint = fingerprint then
      return to_jsonb(current_row);
    end if;
    if current_row.revision <> coalesce(p_expected_revision, -1) then
      raise exception 'investing_onboarding_version_conflict';
    end if;
    next_revision := current_row.revision + 1;
    update public.investing_onboarding_progress set
      locale=requested_locale,current_step=requested_step,status=requested_status,draft=requested_draft,
      revision=next_revision,idempotency_key=p_idempotency_key,progress_fingerprint=fingerprint,
      updated_at=statement_timestamp(),completed_at=case when requested_status='completed' then coalesce(completed_at,statement_timestamp()) else completed_at end
      where user_id=p_actor_user_id returning * into current_row;
  else
    if coalesce(p_expected_revision, 0) <> 0 then raise exception 'investing_onboarding_version_conflict'; end if;
    insert into public.investing_onboarding_progress(user_id,locale,current_step,status,draft,revision,idempotency_key,progress_fingerprint)
      values(p_actor_user_id,requested_locale,requested_step,requested_status,requested_draft,1,p_idempotency_key,fingerprint)
      returning * into current_row;
  end if;
  return to_jsonb(current_row);
end;
$$;
create or replace function public.complete_investing_onboarding_v1(
  p_actor_user_id text,
  p_portfolio_id text,
  p_locale text,
  p_draft jsonb,
  p_client_request_id text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  account_result jsonb;
  plan_result jsonb;
  account_id uuid;
  effective_at timestamptz := statement_timestamp();
  content jsonb;
  rules jsonb;
  provenance jsonb;
  existing public.investing_onboarding_progress%rowtype;
begin
  if coalesce(btrim(p_actor_user_id),'')='' or coalesce(btrim(p_portfolio_id),'')=''
     or coalesce(btrim(p_client_request_id),'')='' or p_locale not in ('en','pt-PT','fr-FR')
     or p_draft is null or jsonb_typeof(p_draft)<>'object' then
    raise exception 'investing_onboarding_invalid_completion';
  end if;
  select * into existing from public.investing_onboarding_progress where user_id=p_actor_user_id for update;
  if found and existing.status='completed' and existing.idempotency_key=p_client_request_id then
    return jsonb_build_object('ok',true,'replayed',true,'accountId',existing.account_id,'portfolioId',existing.portfolio_id,'progress',to_jsonb(existing));
  end if;
  if coalesce(p_draft->>'objective','') not in ('preservation','growth','income','balanced')
     or coalesce(p_draft->>'riskProfile','') not in ('Conservative','Balanced','Aggressive')
     or coalesce(p_draft->>'horizon','') not in ('Short','Medium','Long') then
    raise exception 'investing_onboarding_invalid_completion';
  end if;
  account_result := public.investing_open_paper_account_v2(p_actor_user_id,p_portfolio_id,'EUR',0,p_client_request_id,'onboarding:'||p_client_request_id);
  account_id := (account_result->>'account_id')::uuid;
  content := jsonb_build_object(
    'objectives',jsonb_build_array(jsonb_build_object('objective',p_draft->>'objective')),
    'limits',jsonb_build_array(),
    'preferences',jsonb_build_array(jsonb_build_object('locale',p_locale,'needsLiquidityReserve',coalesce((p_draft->>'needsLiquidityReserve')::boolean,true))),
    'horizons',jsonb_build_array(jsonb_build_object('horizon',p_draft->>'horizon')),
    'allocationRules',jsonb_build_array(),
    'riskRules',jsonb_build_array(jsonb_build_object('riskProfile',p_draft->>'riskProfile')),
    'restrictions',jsonb_build_array(),
    'mandate',jsonb_build_object('objective',p_draft->>'objective','riskProfile',p_draft->>'riskProfile','horizon',p_draft->>'horizon',
      'monthlyContributionEur',p_draft->'monthlyContributionEur','targetValueEur',p_draft->'targetValueEur','baseCurrency','EUR',
      'allowsGold',coalesce((p_draft->>'allowsGold')::boolean,false),'allowsCrypto',coalesce((p_draft->>'allowsCrypto')::boolean,false),
      'needsLiquidityReserve',coalesce((p_draft->>'needsLiquidityReserve')::boolean,true))
  );
  provenance := jsonb_build_object('origin','user','actorId',p_actor_user_id,'reason','Investing onboarding completed','sourceReference','investing-onboarding/v1');
  rules := jsonb_build_array(
    jsonb_build_object('logicalKey','mandate.risk_profile','ruleType','risk_profile','status','active','revisionNumber',1,'content',jsonb_build_object('riskProfile',p_draft->>'riskProfile'),'provenance',provenance,'effectiveFrom',to_jsonb(effective_at)),
    jsonb_build_object('logicalKey','mandate.horizon','ruleType','horizon','status','active','revisionNumber',1,'content',jsonb_build_object('horizon',p_draft->>'horizon'),'provenance',provenance,'effectiveFrom',to_jsonb(effective_at))
  );
  plan_result := public.replace_investing_canonical_plan_version_v1(p_actor_user_id,account_id,p_portfolio_id,null,effective_at,content,provenance,rules,'onboarding:'||p_client_request_id);
  insert into public.investing_onboarding_progress(user_id,account_id,portfolio_id,locale,current_step,status,draft,revision,idempotency_key,progress_fingerprint,completed_at,updated_at)
    values(p_actor_user_id,account_id,p_portfolio_id,p_locale,9,'completed',p_draft,coalesce(existing.revision,0)+1,p_client_request_id,
      encode(digest(convert_to(public.investing_canonical_json_text_v1(p_draft),'UTF8'),'sha256'),'hex'),statement_timestamp(),statement_timestamp())
    on conflict(user_id) do update set account_id=excluded.account_id,portfolio_id=excluded.portfolio_id,locale=excluded.locale,current_step=9,status='completed',draft=excluded.draft,revision=public.investing_onboarding_progress.revision+1,idempotency_key=excluded.idempotency_key,progress_fingerprint=excluded.progress_fingerprint,completed_at=excluded.completed_at,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'replayed',false,'accountId',account_id,'portfolioId',p_portfolio_id,'plan',plan_result,'progress',(select to_jsonb(x) from public.investing_onboarding_progress x where x.user_id=p_actor_user_id));
end;
$$;
revoke all on function public.read_investing_onboarding_progress_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.save_investing_onboarding_progress_v1(text,integer,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.complete_investing_onboarding_v1(text,text,text,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.read_investing_onboarding_progress_v1(text), public.save_investing_onboarding_progress_v1(text,integer,jsonb,text), public.complete_investing_onboarding_v1(text,text,text,jsonb,text) to service_role;
