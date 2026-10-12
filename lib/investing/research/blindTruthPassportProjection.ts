import type {
  AuthorizedResearchPassportReadContext,
  InvestingAuthorityTransactionClient,
} from "../authority/context";

/**
 * RL-9 operational Passport public metadata. Never reads a Vault object,
 * confidential locator/salt, or metric plaintext. An absent migration is
 * DEFERRED, never interpreted as an empty successfully-audited history.
 */
export type BlindTruthPassportProjectionV1 = Readonly<{
  availability: "PUBLIC_METADATA_ONLY";
  episodes: readonly Readonly<{
    registration: string;
    vaultSeal: string | null;
    evaluation: string | null;
    state:
      | "REGISTERED" | "SEALED" | "EVALUATION_ARMED"
      | "REVEAL_CONSUMED_RESULT_UNAVAILABLE" | "REVEAL_FAILED_CLOSED";
    latestEvent: string | null;
    reason: string | null;
    overallOutcome: null;
  }>[];
}> | Readonly<{ availability: "DEFERRED_RL9"; episodes: readonly [] }>;

export type BlindTruthPassportReadV1 =
  | { ok: true; projection: BlindTruthPassportProjectionV1 }
  | { ok: false; code: "PASSPORT_SOURCE_INTEGRITY_FAILURE" | "DATABASE_ERROR" };

type Row = {
  registration_hash_hex: string;
  vault_seal_hash_hex: string | null;
  evaluation_hash_hex: string | null;
  event_state: string | null;
  event_hash_hex: string | null;
  predecessor_event_hash_hex: string | null;
  reason: string | null;
};
const hash = /^[0-9A-F]{64}$/u;
const allowedReasons = new Set([
  "AUTHORITY_FAILURE", "WRONG_TENANT", "WRONG_INVESTIGATION",
  "WRONG_SUBJECT", "WRONG_PROMOTION_STATE", "STALE_PROMOTION_TRANSITION",
  "SUPERSEDED_PROMOTION_AUTHORITY", "DIVERGENT_EXISTING_IDENTITY",
  "REGISTRATION_ALREADY_EXISTS", "VAULT_SEAL_ALREADY_EXISTS",
  "EVALUATION_ALREADY_EXISTS", "REVEAL_ALREADY_STARTED",
  "FINAL_EVENT_ALREADY_EXISTS", "MISSING_VAULT_CAPABILITY",
  "VAULT_UNAVAILABLE", "ANTI_REUSE_INDEX_UNAVAILABLE",
  "ANTI_REUSE_KEY_ROTATION_INCOMPLETE", "HOLDOUT_REUSE_DETECTED",
  "HOLDOUT_ALREADY_EXPOSED", "EMBARGO_VIOLATION",
  "ACCESS_AUDIT_UNAVAILABLE", "MALFORMED_COMMITMENT",
  "COMMITMENT_MISMATCH", "PLAINTEXT_LENGTH_MISMATCH",
  "HOLDOUT_SCOPE_MISMATCH", "PROVIDER_VERSION_MISMATCH",
  "MALFORMED_HOLDOUT", "INCOMPATIBLE_ENGINE_VERSION",
  "INCOMPATIBLE_METRIC_REGISTRY", "INCOMPATIBLE_CRITERIA",
  "WRONG_HASHREF_DOMAIN", "MALFORMED_HASHREF", "AMBIGUOUS_EVENT_CHAIN",
]);
const integrity = (): BlindTruthPassportReadV1 => ({
  ok: false, code: "PASSPORT_SOURCE_INTEGRITY_FAILURE",
});

/** Derived projection. No scientific PASS can originate from public metadata. */
export function projectBlindTruthPublicEventRowsV1(rows: readonly Row[]): BlindTruthPassportReadV1 {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row || !hash.test(row.registration_hash_hex) ||
        (row.vault_seal_hash_hex !== null && !hash.test(row.vault_seal_hash_hex)) ||
        (row.evaluation_hash_hex !== null && !hash.test(row.evaluation_hash_hex))) return integrity();
    const existing = groups.get(row.registration_hash_hex) ?? [];
    existing.push(row);
    groups.set(row.registration_hash_hex, existing);
  }
  const episodes: Array<BlindTruthPassportProjectionV1 extends { episodes: readonly (infer E)[] } ? E : never> = [];
  for (const [registration, members] of [...groups].sort(([a], [b])=>a.localeCompare(b))) {
    const first = members[0];
    if (!first) return integrity();
    for (const item of members) {
      if (item.vault_seal_hash_hex !== first.vault_seal_hash_hex ||
          item.evaluation_hash_hex !== first.evaluation_hash_hex) return integrity();
    }
    const seal = first.vault_seal_hash_hex;
    const evaluation = first.evaluation_hash_hex;
    if (evaluation !== null && seal === null) return integrity();
    const events = members.filter(item=>item.event_state!==null);
    if (events.length !== members.length && events.length > 0) return integrity();
    const started = events.filter(item=>item.event_state==="REVEAL_STARTED");
    const finals = events.filter(item=>item.event_state==="REVEAL_FAILED_CLOSED");
    // REVEAL_COMPLETED cannot be shown as scientifically authoritative
    // until verified metrics and the dedicated Vault evaluator are admitted.
    if (events.some(item=>item.event_state==="REVEAL_COMPLETED" ||
      !hash.test(item.event_hash_hex??"")) ||
      started.length>1 || finals.length>1 || events.length>2 ||
      (events.length>0 && (started.length!==1 || evaluation===null))) return integrity();
    const root = started[0];
    if (root && (root.predecessor_event_hash_hex!==null || root.reason!==null)) return integrity();
    const terminal = finals[0];
    if (terminal && (!root ||
       terminal.predecessor_event_hash_hex !== root.event_hash_hex ||
       terminal.reason===null || !allowedReasons.has(terminal.reason) ||
       terminal.event_hash_hex===root.event_hash_hex)) return integrity();
    if (events.length!==started.length+finals.length) return integrity();
    const state = terminal ? "REVEAL_FAILED_CLOSED" :
      root ? "REVEAL_CONSUMED_RESULT_UNAVAILABLE" :
      evaluation ? "EVALUATION_ARMED" : seal ? "SEALED" : "REGISTERED";
    episodes.push({
      registration,vaultSeal:seal,evaluation,
      state,latestEvent:terminal?.event_hash_hex??root?.event_hash_hex??null,
      reason:terminal?.reason??null,overallOutcome:null,
    });
  }
  return {ok:true,projection:{availability:"PUBLIC_METADATA_ONLY",episodes}};
}

export async function readBlindTruthPassportProjectionV1(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchPassportReadContext,
): Promise<BlindTruthPassportReadV1> {
  if (context.operationScope!=="TENANT_SCOPE" ||
      context.sourceContext!=="PURE_RESEARCH") {
    // RL-9 V1 registration never applies to Portfolio-linked scopes.
    return {ok:true,projection:{availability:"DEFERRED_RL9",episodes:[]}};
  }
  try {
    const readiness = await client.query<{ready:boolean}>(`
      select (
        pg_catalog.to_regclass('investing.research_blind_truth_registrations_scientific_identities') is not null
        and (select count(*) from pg_catalog.pg_policies
          where schemaname='investing' and
           (tablename,policyname) in (
             ('research_blind_truth_registrations_scientific_identities','research_blind_truth_registrations_passport_select_v1'),
             ('research_blind_truth_vault_seals_scientific_identities','research_blind_truth_vault_seals_passport_select_v1'),
             ('research_blind_truth_evaluations_scientific_identities','research_blind_truth_evaluations_passport_select_v1'),
             ('research_blind_truth_reveal_result_events_scientific_identities','research_blind_truth_events_passport_select_v1')
           ))=4
      ) as ready
    `);
    if (readiness.rows.length!==1) return integrity();
    if (!readiness.rows[0]?.ready) return {
      ok:true,projection:{availability:"DEFERRED_RL9",episodes:[]},
    };
    const data = await client.query<Row>(`
      select r.registration_hash_hex,s.vault_seal_hash_hex,v.evaluation_hash_hex,
       e.event_state,e.event_hash_hex,e.predecessor_event_hash_hex,e.reason
      from investing.research_blind_truth_registrations_scientific_identities r
      left join investing.research_blind_truth_vault_seals_scientific_identities s
       on s.registration_identity_id=r.research_blind_truth_registration_identity_id
       and s.tenant_id=r.tenant_id
      left join investing.research_blind_truth_evaluations_scientific_identities v
       on v.registration_identity_id=r.research_blind_truth_registration_identity_id
       and v.tenant_id=r.tenant_id
      left join investing.research_blind_truth_reveal_result_events_scientific_identities e
       on e.registration_identity_id=r.research_blind_truth_registration_identity_id
       and e.tenant_id=r.tenant_id
       and e.evaluation_identity_id=v.research_blind_truth_evaluation_identity_id
      where r.research_investigation_id=$1 and r.tenant_id=$2
       and r.principal_id=$3 and r.tenant_membership_id=$4
      order by r.registration_hash_hex,e.event_hash_hex
    `,[context.researchInvestigationId,context.tenantId,
      context.principalId,context.tenantMembershipId]);
    return projectBlindTruthPublicEventRowsV1(data.rows);
  } catch {
    return {ok:false,code:"DATABASE_ERROR"};
  }
}
