-- Phase 6H: append-only hypotheses and candidates. No experiments or execution.
begin;
create table public.investing_research_hypotheses (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  hypothesis_id text not null,
  hypothesis_version text not null,
  version_sequence integer generated always as
    ((substring(hypothesis_version from 2))::integer) stored,
  state text not null,
  material_hash text not null,
  contract_version text not null,
  created_at timestamptz not null,
  canonical_payload jsonb not null,
  primary key (tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,hypothesis_version),
  unique (tenant_id,owner_id,portfolio_id,account_id,material_hash),
  unique (tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,version_sequence),
  constraint investing_research_hypothesis_id check
    (hypothesis_id ~ '^irhyp_v1_[a-f0-9]{64}$'),
  constraint investing_research_hypothesis_version check
    (hypothesis_version ~ '^v[1-9][0-9]*$'),
  constraint investing_research_hypothesis_state check
    (state in ('draft','active','retired')),
  constraint investing_research_hypothesis_material check (
    material_hash ~ '^[a-f0-9]{64}$'
    and contract_version = 'investing-research-hypothesis/v1'
    and jsonb_typeof(canonical_payload)='object'
    and canonical_payload->>'hypothesisId'=hypothesis_id
    and canonical_payload->>'hypothesisVersion'=hypothesis_version
    and canonical_payload->>'state'=state
    and canonical_payload->>'contractVersion'=contract_version
  ),
  foreign key (tenant_id,owner_id,portfolio_id,account_id)
    references public.investing_accounts(tenant_id,owner_user_id,portfolio_id,id)
    on delete restrict
);
create table public.investing_research_candidates (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  candidate_id text not null,
  candidate_version text not null,
  version_sequence integer generated always as
    ((substring(candidate_version from 2))::integer) stored,
  hypothesis_id text not null,
  hypothesis_version text not null,
  state text not null,
  material_hash text not null,
  strategy_contract_version text not null,
  parent_candidate_id text,
  created_at timestamptz not null,
  canonical_payload jsonb not null,
  primary key (tenant_id,owner_id,portfolio_id,account_id,candidate_id,candidate_version),
  unique (tenant_id,owner_id,portfolio_id,account_id,material_hash),
  unique (tenant_id,owner_id,portfolio_id,account_id,candidate_id,version_sequence),
  constraint investing_research_candidate_id check
    (candidate_id ~ '^ircand_v1_[a-f0-9]{64}$'),
  constraint investing_research_candidate_version check
    (candidate_version ~ '^v[1-9][0-9]*$'),
  constraint investing_research_candidate_state check
    (state in ('draft','ready','retired')),
  constraint investing_research_candidate_parent check
    (parent_candidate_id is null or parent_candidate_id <> candidate_id),
  constraint investing_research_candidate_material check (
    material_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(canonical_payload)='object'
    and canonical_payload->>'contractVersion'='investing-strategy-candidate/v1'
    and canonical_payload->>'candidateId'=candidate_id
    and canonical_payload->>'candidateVersion'=candidate_version
    and canonical_payload->>'hypothesisId'=hypothesis_id
    and canonical_payload->>'hypothesisVersion'=hypothesis_version
    and canonical_payload->>'state'=state
    and canonical_payload#>>'{strategyContract,version}'=strategy_contract_version
    and canonical_payload#>>'{generation,parentCandidateId}'
      is not distinct from parent_candidate_id
  ),
  foreign key (tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,hypothesis_version)
    references public.investing_research_hypotheses(
      tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,hypothesis_version
    ) on delete restrict
);
create function public.investing_research_hypothesis_version_guard_v1()
returns trigger language plpgsql
set search_path=pg_catalog,public
as $$
declare prior public.investing_research_hypotheses%rowtype;
declare new_sequence integer := (substring(new.hypothesis_version from 2))::integer;
begin
  if new_sequence=1 then
    if new.state<>'draft' then raise exception using errcode='23514',
      message='investing_research_hypothesis_initial_state_invalid'; end if;
    return new;
  end if;
  select * into prior from public.investing_research_hypotheses
  where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and hypothesis_id=new.hypothesis_id
    and version_sequence=new_sequence-1 for key share;
  if not found
    or (prior.state='draft' and new.state not in ('active','retired'))
    or (prior.state='active' and new.state<>'retired')
    or prior.state='retired'
    or (prior.canonical_payload-'state'-'hypothesisVersion')
      is distinct from (new.canonical_payload-'state'-'hypothesisVersion') then
    raise exception using errcode='23514',
      message='investing_research_hypothesis_version_transition_invalid';
  end if;
  return new;
end $$;
create function public.investing_research_candidate_version_guard_v1()
returns trigger language plpgsql
set search_path=pg_catalog,public
as $$
declare prior public.investing_research_candidates%rowtype;
declare hypothesis_state text;
declare latest_hypothesis_version text;
declare new_sequence integer := (substring(new.candidate_version from 2))::integer;
begin
  select state,hypothesis_version into hypothesis_state,latest_hypothesis_version
  from public.investing_research_hypotheses
  where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and hypothesis_id=new.hypothesis_id
  order by version_sequence desc limit 1;
  if (
    new.state='retired'
    and (
      hypothesis_state not in ('active','retired')
      or (
        hypothesis_state='active'
        and latest_hypothesis_version is distinct from new.hypothesis_version
      )
    )
  ) or (
    new.state<>'retired'
    and (
      hypothesis_state is distinct from 'active'
      or latest_hypothesis_version is distinct from new.hypothesis_version
    )
  ) then
    raise exception using errcode='23514',
      message='investing_research_candidate_hypothesis_ineligible';
  end if;
  if new.parent_candidate_id is not null and not exists (
    select 1 from public.investing_research_candidates
    where tenant_id=new.tenant_id and owner_id=new.owner_id
      and portfolio_id=new.portfolio_id and account_id=new.account_id
      and candidate_id=new.parent_candidate_id
  ) then raise exception using errcode='23503',
    message='investing_research_candidate_parent_not_found';
  end if;
  if new_sequence=1 then
    if new.state<>'draft' then raise exception using errcode='23514',
      message='investing_research_candidate_initial_state_invalid'; end if;
    return new;
  end if;
  select * into prior from public.investing_research_candidates
  where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and candidate_id=new.candidate_id
    and version_sequence=new_sequence-1 for key share;
  if not found
    or (prior.state='draft' and new.state not in ('ready','retired'))
    or (prior.state='ready' and new.state<>'retired')
    or prior.state='retired'
    or (prior.canonical_payload-'state'-'candidateVersion')
      is distinct from (new.canonical_payload-'state'-'candidateVersion') then
    raise exception using errcode='23514',
      message='investing_research_candidate_version_transition_invalid';
  end if;
  return new;
end $$;
create trigger investing_research_hypothesis_version_guard
before insert on public.investing_research_hypotheses
for each row execute function public.investing_research_hypothesis_version_guard_v1();
create trigger investing_research_candidate_version_guard
before insert on public.investing_research_candidates
for each row execute function public.investing_research_candidate_version_guard_v1();
create trigger investing_research_hypothesis_immutable
before update or delete on public.investing_research_hypotheses
for each row execute function public.investing_research_immutable_guard_v1();
create trigger investing_research_candidate_immutable
before update or delete on public.investing_research_candidates
for each row execute function public.investing_research_immutable_guard_v1();
alter table public.investing_research_hypotheses enable row level security;
alter table public.investing_research_hypotheses force row level security;
alter table public.investing_research_candidates enable row level security;
alter table public.investing_research_candidates force row level security;
create policy investing_research_hypotheses_select_member
on public.investing_research_hypotheses for select to authenticated using (
  public.investing_research_has_exact_scope_v1(
    tenant_id,owner_id,portfolio_id,account_id
  )
);
create policy investing_research_candidates_select_member
on public.investing_research_candidates for select to authenticated using (
  public.investing_research_has_exact_scope_v1(
    tenant_id,owner_id,portfolio_id,account_id
  )
);
revoke all on public.investing_research_hypotheses from public,anon,authenticated,service_role;
revoke all on public.investing_research_candidates from public,anon,authenticated,service_role;
grant select on public.investing_research_hypotheses,public.investing_research_candidates
  to authenticated;
grant select,insert on public.investing_research_hypotheses,public.investing_research_candidates
  to service_role;
revoke all on function public.investing_research_hypothesis_version_guard_v1()
  from public,anon,authenticated,service_role;
revoke all on function public.investing_research_candidate_version_guard_v1()
  from public,anon,authenticated,service_role;
comment on table public.investing_research_hypotheses is
  'Phase 6H append-only scientific hypotheses; transitions append versions.';
comment on table public.investing_research_candidates is
  'Phase 6H append-only pre-execution candidates; testing belongs to Phase 6I.';
commit;
