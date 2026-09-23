-- Phase 6M: controlled preparation boundary. No Engine submission or Live target.
begin;
create table public.investing_research_promotion_eligibility(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,eligibility_id text not null,decision_id text not null,
 experiment_id text not null,candidate_id text not null,candidate_version text not null,
 risk_assessment_id text not null,risk_assessment_hash text not null,
 memory_event_id text not null,memory_event_hash text not null,evidence_hash text not null,
 evaluated_at timestamptz not null,canonical_payload jsonb not null,
 created_at timestamptz not null default statement_timestamp(),
 primary key(tenant_id,owner_id,portfolio_id,account_id,eligibility_id),
 unique(evidence_hash),
 foreign key(tenant_id,owner_id,portfolio_id,account_id,decision_id)
  references public.investing_research_scientific_decisions(
   tenant_id,owner_id,portfolio_id,account_id,decision_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,risk_assessment_id)
  references public.investing_research_portfolio_risk_capacity_assessments(
   tenant_id,owner_id,portfolio_id,account_id,assessment_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,memory_event_id)
  references public.investing_research_audit_events(
   tenant_id,owner_id,portfolio_id,account_id,event_id) on delete restrict,
 constraint investing_research_phase6m_eligibility_identity check(
  eligibility_id='irelig_v1_'||evidence_hash and evidence_hash~'^[a-f0-9]{64}$'
  and canonical_payload#>>'{eligibility,eligibilityId}'=eligibility_id
  and canonical_payload#>>'{eligibility,state}'='promotion_eligible'
  and canonical_payload#>>'{eligibility,validationDecision,decisionId}'=decision_id
  and canonical_payload#>>'{eligibility,experimentId}'=experiment_id
  and canonical_payload#>>'{eligibility,candidateId}'=candidate_id
  and canonical_payload#>>'{eligibility,candidateVersion}'=candidate_version
  and canonical_payload->>'riskAssessmentId'=risk_assessment_id
  and canonical_payload->>'riskAssessmentHash'=risk_assessment_hash
  and canonical_payload->>'memoryEventId'=memory_event_id
  and canonical_payload->>'memoryEventHash'=memory_event_hash
  and canonical_payload->>'evidenceHash'=evidence_hash
  and canonical_payload#>>'{eligibility,scientificScope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{eligibility,scientificScope,ownerId}'=owner_id
  and canonical_payload#>>'{eligibility,scientificScope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{eligibility,scientificScope,accountId}'=account_id::text)
);
create table public.investing_research_promotion_requests(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,request_id text not null,request_hash text not null,
 eligibility_id text not null,decision_id text not null,risk_assessment_id text not null,
 memory_event_id text not null,target text not null,state text not null,
 idempotency_key text not null,prepared_at timestamptz not null,
 canonical_payload jsonb not null,created_at timestamptz not null default statement_timestamp(),
 primary key(tenant_id,owner_id,portfolio_id,account_id,request_id),
 unique(request_hash),
 unique(tenant_id,owner_id,portfolio_id,account_id,idempotency_key),
 unique(tenant_id,owner_id,portfolio_id,account_id,eligibility_id,target),
 foreign key(tenant_id,owner_id,portfolio_id,account_id,eligibility_id)
  references public.investing_research_promotion_eligibility(
   tenant_id,owner_id,portfolio_id,account_id,eligibility_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,decision_id)
  references public.investing_research_scientific_decisions(
   tenant_id,owner_id,portfolio_id,account_id,decision_id) on delete restrict,
 constraint investing_research_phase6m_request_identity check(
  request_id='irpromo_v1_'||request_hash and request_hash~'^[a-f0-9]{64}$'
  and target in('shadow','investing_paper') and state='promotion_prepared'
  and canonical_payload->>'requestId'=request_id
  and canonical_payload->>'requestHash'=request_hash
  and canonical_payload->>'eligibilityId'=eligibility_id
  and canonical_payload->>'decisionId'=decision_id
  and canonical_payload->>'riskAssessmentId'=risk_assessment_id
  and canonical_payload->>'memoryEventId'=memory_event_id
  and canonical_payload->>'target'=target and canonical_payload->>'state'=state
  and canonical_payload->>'idempotencyKey'=idempotency_key
  and canonical_payload#>>'{scientificScope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scientificScope,ownerId}'=owner_id
  and canonical_payload#>>'{scientificScope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scientificScope,accountId}'=account_id::text)
);
create table public.investing_research_promotion_revocations(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,revocation_id text not null,revocation_hash text not null,
 request_id text not null,reason_code text not null,revoked_at timestamptz not null,
 canonical_payload jsonb not null,created_at timestamptz not null default statement_timestamp(),
 primary key(tenant_id,owner_id,portfolio_id,account_id,revocation_id),
 unique(revocation_hash),unique(tenant_id,owner_id,portfolio_id,account_id,request_id),
 foreign key(tenant_id,owner_id,portfolio_id,account_id,request_id)
  references public.investing_research_promotion_requests(
   tenant_id,owner_id,portfolio_id,account_id,request_id) on delete restrict,
 constraint investing_research_phase6m_revocation_identity check(
  revocation_id='irprev_v1_'||revocation_hash and revocation_hash~'^[a-f0-9]{64}$'
  and reason_code in('scientific_evidence_invalidated','risk_capacity_invalidated',
   'dataset_invalidated','operator_revoked')
  and canonical_payload->>'requestId'=request_id
  and canonical_payload->>'revocationId'=revocation_id
  and canonical_payload->>'revocationHash'=revocation_hash
  and canonical_payload->>'state'='promotion_revoked'
  and canonical_payload->>'reasonCode'=reason_code
  and canonical_payload#>>'{scientificScope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scientificScope,ownerId}'=owner_id
  and canonical_payload#>>'{scientificScope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scientificScope,accountId}'=account_id::text)
);
create function public.investing_research_phase6m_chain_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare linked jsonb;
begin
 if tg_table_name='investing_research_promotion_eligibility' then
  select canonical_payload into linked from
   public.investing_research_portfolio_risk_capacity_assessments
   where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and assessment_id=new.risk_assessment_id;
  if linked is null or linked->>'outcome'<>'passed'
   or linked->>'assessmentHash'<>new.risk_assessment_hash
   or not (linked->'members' @> jsonb_build_array(jsonb_build_object(
    'decisionId',new.decision_id,'experimentId',new.experiment_id,
    'candidateId',new.candidate_id,'candidateVersion',new.candidate_version))) then
   raise exception using errcode='23514',
    message='investing_research_phase6m_risk_chain_mismatch';
  end if;
  select canonical_payload into linked from public.investing_research_audit_events
   where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and event_id=new.memory_event_id;
  if linked is null or linked->>'decisionId'<>new.decision_id
   or linked->>'eventHash'<>new.memory_event_hash
   or linked->>'knowledge'<>'positive' or linked->>'outcome'<>'validated' then
   raise exception using errcode='23514',
    message='investing_research_phase6m_memory_chain_mismatch';
  end if;
 elsif tg_table_name='investing_research_promotion_requests' then
  select canonical_payload into linked from
   public.investing_research_promotion_eligibility
   where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and eligibility_id=new.eligibility_id;
  if linked is null
   or linked#>>'{eligibility,validationDecision,decisionId}'<>new.decision_id
   or linked->>'riskAssessmentId'<>new.risk_assessment_id
   or linked->>'memoryEventId'<>new.memory_event_id then
   raise exception using errcode='23514',
    message='investing_research_phase6m_request_chain_mismatch';
  end if;
 end if;
 return new;
end $$;
create trigger investing_research_promotion_eligibility_chain before insert on
 public.investing_research_promotion_eligibility for each row execute function
 public.investing_research_phase6m_chain_v1();
create trigger investing_research_promotion_requests_chain before insert on
 public.investing_research_promotion_requests for each row execute function
 public.investing_research_phase6m_chain_v1();
create function public.investing_research_phase6m_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception using errcode='55000',
 message='investing_research_phase6m_evidence_immutable'; end $$;
create trigger investing_research_promotion_eligibility_immutable before update or delete
 on public.investing_research_promotion_eligibility for each row execute function
 public.investing_research_phase6m_immutable_v1();
create trigger investing_research_promotion_requests_immutable before update or delete
 on public.investing_research_promotion_requests for each row execute function
 public.investing_research_phase6m_immutable_v1();
create trigger investing_research_promotion_revocations_immutable before update or delete
 on public.investing_research_promotion_revocations for each row execute function
 public.investing_research_phase6m_immutable_v1();
alter table public.investing_research_promotion_eligibility enable row level security;
alter table public.investing_research_promotion_eligibility force row level security;
alter table public.investing_research_promotion_requests enable row level security;
alter table public.investing_research_promotion_requests force row level security;
alter table public.investing_research_promotion_revocations enable row level security;
alter table public.investing_research_promotion_revocations force row level security;
create policy investing_research_promotion_eligibility_select on
 public.investing_research_promotion_eligibility for select to authenticated using(
 public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_promotion_requests_select on
 public.investing_research_promotion_requests for select to authenticated using(
 public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_promotion_revocations_select on
 public.investing_research_promotion_revocations for select to authenticated using(
 public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
revoke all on public.investing_research_promotion_eligibility,
 public.investing_research_promotion_requests,
 public.investing_research_promotion_revocations from public,anon,authenticated,service_role;
grant select on public.investing_research_promotion_eligibility,
 public.investing_research_promotion_requests,
 public.investing_research_promotion_revocations to authenticated;
grant select,insert on public.investing_research_promotion_eligibility,
 public.investing_research_promotion_requests,
 public.investing_research_promotion_revocations to service_role;
commit;
