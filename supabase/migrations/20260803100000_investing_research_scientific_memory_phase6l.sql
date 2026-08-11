-- Phase 6L: append-only scientific memory and negative knowledge.
begin;
create table public.investing_research_audit_events(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,event_id text not null,aggregate_type text not null,
 aggregate_id text not null,event_type text not null,event_version text not null,
 event_hash text not null,occurred_at timestamptz not null,decision_id text not null,
 report_id text not null,outcome text not null,knowledge text not null,
 family_state text not null,attempt_ordinal integer not null,
 profile_version text not null,
 created_at timestamptz not null default statement_timestamp(),
 canonical_payload jsonb not null,
 primary key(tenant_id,owner_id,portfolio_id,account_id,event_id),
 unique(event_hash),
 unique(tenant_id,owner_id,portfolio_id,account_id,decision_id),
 unique(tenant_id,owner_id,portfolio_id,account_id,aggregate_id,attempt_ordinal),
 foreign key(tenant_id,owner_id,portfolio_id,account_id,decision_id)
  references public.investing_research_scientific_decisions(
   tenant_id,owner_id,portfolio_id,account_id,decision_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,report_id)
  references public.investing_research_validation_reports(
   tenant_id,owner_id,portfolio_id,account_id,report_id) on delete restrict,
 constraint investing_research_phase6l_event_identity check(
  event_id='irmem_v1_'||event_hash and event_hash~'^[a-f0-9]{64}$'
  and aggregate_type='hypothesis_family'
  and event_type='scientific_result_recorded'
  and event_version='investing-scientific-memory-event/v1'
  and outcome in('validated','rejected','inconclusive','blocked','invalid')
  and knowledge in('positive','negative','inconclusive','blocked','invalid')
  and family_state in('active','saturated')
  and attempt_ordinal>0
  and ((outcome='validated' and knowledge='positive')
   or (outcome='rejected' and knowledge='negative')
   or (outcome not in('validated','rejected') and knowledge=outcome))
  and canonical_payload->>'contractVersion'=event_version
  and canonical_payload->>'eventId'=event_id
  and canonical_payload->>'eventHash'=event_hash
  and canonical_payload->>'aggregateType'=aggregate_type
  and canonical_payload->>'aggregateId'=aggregate_id
  and canonical_payload->>'eventType'=event_type
  and canonical_payload->>'decisionId'=decision_id
  and canonical_payload->>'reportId'=report_id
  and canonical_payload->>'outcome'=outcome
  and canonical_payload->>'knowledge'=knowledge
  and canonical_payload->>'familyState'=family_state
  and (canonical_payload->>'attemptOrdinal')::integer=attempt_ordinal
  and canonical_payload#>>'{profile,version}'=profile_version
  and canonical_payload#>>'{scope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scope,ownerId}'=owner_id
  and canonical_payload#>>'{scope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scope,accountId}'=account_id::text
  and canonical_payload#>>'{scientificScope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scientificScope,ownerId}'=owner_id
  and canonical_payload#>>'{scientificScope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scientificScope,accountId}'=account_id::text)
);
create index investing_research_audit_events_family
 on public.investing_research_audit_events(
 tenant_id,owner_id,portfolio_id,account_id,aggregate_id,occurred_at,event_id);
create function public.investing_research_phase6l_event_chain_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare decision jsonb;
begin
 select canonical_payload into decision from public.investing_research_scientific_decisions
 where tenant_id=new.tenant_id and owner_id=new.owner_id
  and portfolio_id=new.portfolio_id and account_id=new.account_id
  and decision_id=new.decision_id;
 if decision is null
  or decision#>>'{validationReport,reportId}'<>new.report_id
  or decision->>'outcome'<>new.outcome
  or decision->>'hypothesisId'<>new.canonical_payload->>'hypothesisId'
  or decision->>'hypothesisVersion'<>new.canonical_payload->>'hypothesisVersion'
  or decision->>'candidateId'<>new.canonical_payload->>'candidateId'
  or decision->>'candidateVersion'<>new.canonical_payload->>'candidateVersion'
  or decision->>'experimentId'<>new.canonical_payload->>'experimentId'
  or decision->>'runId'<>new.canonical_payload->>'runId'
  or new.aggregate_id<>(('irfamily_v1_'||
   length(decision->>'hypothesisId')::text||'_'||
   (decision->>'hypothesisId')||'_'||(decision->>'hypothesisVersion')))
 then raise exception using errcode='23514',
  message='investing_research_phase6l_event_chain_mismatch';
 end if;
 return new;
end $$;
create trigger investing_research_audit_events_chain
before insert on public.investing_research_audit_events for each row
execute function public.investing_research_phase6l_event_chain_v1();
create function public.investing_research_phase6l_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception using errcode='55000',
 message='investing_research_phase6l_event_immutable'; end $$;
create trigger investing_research_audit_events_immutable
before update or delete on public.investing_research_audit_events
for each row execute function public.investing_research_phase6l_immutable_v1();
alter table public.investing_research_audit_events enable row level security;
alter table public.investing_research_audit_events force row level security;
create policy investing_research_audit_events_select_member
on public.investing_research_audit_events for select to authenticated
using(public.investing_research_has_exact_scope_v1(
 tenant_id,owner_id,portfolio_id,account_id));
revoke all on public.investing_research_audit_events
 from public,anon,authenticated,service_role;
grant select on public.investing_research_audit_events to authenticated;
grant select,insert on public.investing_research_audit_events to service_role;
commit;
