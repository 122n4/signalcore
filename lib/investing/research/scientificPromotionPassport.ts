import type { AuthorizedResearchPassportReadContext, InvestingAuthorityTransactionClient } from "../authority/context";
import type { HashRefProjectionV1 } from "./researchPassportReader";
import type { ScientificPromotionGateOutcomeV1, ScientificPromotionStateV1 } from "./scientificPromotion";

export type ScientificPromotionTransitionProjectionV1 = Readonly<{
  scientificPromotionTransitionId: string;
  scientificPromotionProtocolIdentityId: string;
  protocol: HashRefProjectionV1;
  transition: HashRefProjectionV1;
  chainKey: string;
  rootTransitionId: string;
  predecessorTransitionId: string | null;
  predecessorState: ScientificPromotionStateV1 | null;
  resultingState: ScientificPromotionStateV1;
  gateOutcomes: readonly ScientificPromotionGateOutcomeV1[];
  transitionReasons: readonly string[];
  supersededByChain: { successorProtocolHashHex: string; successorRootTransitionId: string; successorRootTransitionHashHex: string } | null;
  createdAt: string;
}>;

export type ScientificPromotionPassportProjectionV1 =
  | { availability: "UNAVAILABLE"; transitions: readonly [] }
  | {
      availability: "MATERIALIZED";
      protocol: HashRefProjectionV1;
      latestTransition: HashRefProjectionV1;
      currentState: ScientificPromotionStateV1;
      transitions: readonly ScientificPromotionTransitionProjectionV1[];
      gateOutcomes: readonly ScientificPromotionGateOutcomeV1[];
      evidence: readonly HashRefProjectionV1[];
    };

export type ScientificPromotionPassportReadResult =
  | { ok: true; scientificPromotion: ScientificPromotionPassportProjectionV1; ledgerEvents: readonly ScientificPromotionLedgerEventV1[] }
  | { ok: false; code: "PASSPORT_SOURCE_INTEGRITY_FAILURE" | "DATABASE_ERROR" };

export type ScientificPromotionLedgerEventV1 = Readonly<{
  eventKind: "SCIENTIFIC_PROMOTION_PROTOCOL_AVAILABLE" | "SCIENTIFIC_PROMOTION_TRANSITION_RECORDED";
  sourceTable: string;
  sourceRecordId: string;
  researchInvestigationId: string;
  relevantParentIds: Readonly<Record<string, string>>;
  scientificHashRefs: readonly HashRefProjectionV1[];
  eventSequence: number | null;
  reasonCode: string | null;
  occurredAt: string;
}>;

type PromotionRow = {
  scientific_promotion_transition_id: string;
  scientific_promotion_protocol_identity_id: string;
  tenant_id: string;
  research_investigation_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  protocol_hash_hex: string;
  chain_key: string;
  root_transition_id: string;
  predecessor_transition_id: string | null;
  predecessor_state: ScientificPromotionStateV1 | null;
  resulting_state: ScientificPromotionStateV1;
  gate_outcomes: readonly ScientificPromotionGateOutcomeV1[];
  evidence_hash_refs: readonly HashRefProjectionV1[];
  transition_reasons: readonly string[];
  superseded_by_successor_protocol_hash_hex: string | null;
  superseded_by_successor_root_transition_id: string | null;
  superseded_by_successor_root_hash_hex: string | null;
  created_at: string;
};

export async function readScientificPromotionPassportProjectionV1(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchPassportReadContext,
): Promise<ScientificPromotionPassportReadResult> {
  try {
    let exists: { rows: { exists: boolean }[] };
    try {
      exists = await client.query<{ exists: boolean }>(
        "select to_regclass('investing.research_scientific_promotion_transitions') is not null as exists",
      );
    } catch (error) {
      if (error instanceof Error && /unexpected query|not implemented|unsupported/i.test(error.message)) {
        return { ok: true, scientificPromotion: { availability: "UNAVAILABLE", transitions: [] }, ledgerEvents: [] };
      }
      throw error;
    }
    if (!exists.rows[0]?.exists) return { ok: true, scientificPromotion: { availability: "UNAVAILABLE", transitions: [] }, ledgerEvents: [] };
    const rows = (await client.query<PromotionRow>(
      [
        "select scientific_promotion_transition_id, scientific_promotion_protocol_identity_id, tenant_id,",
        "research_investigation_id, hash_algorithm, hash_domain, hash_version, hash_hex, protocol_hash_hex,",
        "chain_key, root_transition_id, predecessor_transition_id, predecessor_state, resulting_state, gate_outcomes,",
        "evidence_hash_refs, transition_reasons, superseded_by_successor_protocol_hash_hex,",
        "superseded_by_successor_root_transition_id, superseded_by_successor_root_hash_hex, created_at",
        "from investing.research_scientific_promotion_transitions",
        "where tenant_id = $1 and research_investigation_id = $2",
        "order by chain_key asc, created_at asc, scientific_promotion_transition_id asc",
      ].join(" "),
      [context.tenantId, context.researchInvestigationId],
    )).rows;
    const scientificPromotion = reconstructScientificPromotionProjectionV1(rows);
    return { ok: true, scientificPromotion, ledgerEvents: buildScientificPromotionLedgerEventsV1(scientificPromotion, context.researchInvestigationId) };
  } catch {
    return { ok: false, code: "DATABASE_ERROR" };
  }
}

export function buildScientificPromotionLedgerEventsV1(
  scientificPromotion: ScientificPromotionPassportProjectionV1,
  researchInvestigationId: string,
): readonly ScientificPromotionLedgerEventV1[] {
  if (scientificPromotion.availability !== "MATERIALIZED") return [];
  const protocol = scientificPromotion.protocol;
  const protocolEvent: ScientificPromotionLedgerEventV1 = {
    eventKind: "SCIENTIFIC_PROMOTION_PROTOCOL_AVAILABLE",
    sourceTable: "investing.research_scientific_promotion_protocols",
    sourceRecordId: scientificPromotion.transitions[0]?.scientificPromotionProtocolIdentityId ?? scientificPromotion.protocol.hashHex,
    researchInvestigationId,
    relevantParentIds: {},
    scientificHashRefs: [protocol],
    eventSequence: null,
    reasonCode: null,
    occurredAt: scientificPromotion.transitions[0]?.createdAt ?? "",
  };
  return [
    protocolEvent,
    ...scientificPromotion.transitions.map((transition, index): ScientificPromotionLedgerEventV1 => ({
      eventKind: "SCIENTIFIC_PROMOTION_TRANSITION_RECORDED",
      sourceTable: "investing.research_scientific_promotion_transitions",
      sourceRecordId: transition.scientificPromotionTransitionId,
      researchInvestigationId,
      relevantParentIds: {
        rootTransitionId: transition.rootTransitionId,
        chainKey: transition.chainKey,
        ...(transition.predecessorTransitionId ? { predecessorTransitionId: transition.predecessorTransitionId } : {}),
        ...(transition.supersededByChain ? { successorRootTransitionId: transition.supersededByChain.successorRootTransitionId } : {}),
      },
      scientificHashRefs: [protocol, transition.transition],
      eventSequence: index,
      reasonCode: transition.transitionReasons[0] ?? null,
      occurredAt: transition.createdAt,
    })),
  ];
}

export function reconstructScientificPromotionProjectionV1(rows: readonly PromotionRow[]): ScientificPromotionPassportProjectionV1 {
  if (rows.length === 0) return { availability: "UNAVAILABLE", transitions: [] };
  const byId = new Map(rows.map((row) => [row.scientific_promotion_transition_id, row]));
  if (byId.size !== rows.length) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  for (const row of rows) {
    const root = byId.get(row.root_transition_id);
    if (!root || root.predecessor_transition_id !== null || root.predecessor_state !== null || root.chain_key !== row.chain_key) {
      throw new Error("DIVERGENT_EXISTING_IDENTITY");
    }
    if (row.predecessor_transition_id !== null) {
      const predecessor = byId.get(row.predecessor_transition_id);
      if (!predecessor || predecessor.chain_key !== row.chain_key || predecessor.protocol_hash_hex !== row.protocol_hash_hex) {
        throw new Error("DIVERGENT_EXISTING_IDENTITY");
      }
      if (row.predecessor_state !== predecessor.resulting_state) throw new Error("DIVERGENT_EXISTING_IDENTITY");
    }
  }
  const roots = rows.filter((row) => row.predecessor_transition_id === null && row.predecessor_state === null);
  const rootsByChain = groupBy(roots, (row) => row.chain_key);
  for (const group of rootsByChain.values()) if (group.length !== 1) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  const successors = groupBy(rows.filter((row) => row.predecessor_transition_id !== null), (row) => row.predecessor_transition_id!);
  const referencedSuccessorRoots = new Set(
    rows
      .map((row) => row.superseded_by_successor_root_transition_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const initialRoots = roots.filter((row) => !referencedSuccessorRoots.has(row.scientific_promotion_transition_id));
  if (initialRoots.length !== 1) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  const firstRoot = initialRoots.slice().sort(byCreatedThenId)[0];
  if (!firstRoot) return { availability: "UNAVAILABLE", transitions: [] };
  const ordered = followChain(firstRoot, byId, successors, new Set<string>());
  const leaf = ordered.at(-1)!;
  const projected = ordered.map(projectRow);
  return {
    availability: "MATERIALIZED",
    protocol: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", leaf.protocol_hash_hex),
    latestTransition: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", leaf.hash_hex),
    currentState: leaf.resulting_state,
    transitions: projected,
    gateOutcomes: leaf.gate_outcomes,
    evidence: leaf.evidence_hash_refs,
  };
}

function followChain(
  root: PromotionRow,
  byId: Map<string, PromotionRow>,
  successors: Map<string, PromotionRow[]>,
  seenChains: Set<string>,
): PromotionRow[] {
  if (seenChains.has(root.chain_key)) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  seenChains.add(root.chain_key);
  const result: PromotionRow[] = [];
  let cursor: PromotionRow | undefined = root;
  while (cursor) {
    result.push(cursor);
    const next = successors.get(cursor.scientific_promotion_transition_id) ?? [];
    if (next.length > 1) throw new Error("DIVERGENT_EXISTING_IDENTITY");
    if (next.length === 1) {
      cursor = next[0];
      continue;
    }
    if (cursor.resulting_state === "SUPERSEDED" && cursor.superseded_by_successor_root_transition_id) {
      const successorRoot = byId.get(cursor.superseded_by_successor_root_transition_id);
      if (!successorRoot || successorRoot.predecessor_transition_id !== null || successorRoot.predecessor_state !== null) {
        throw new Error("DIVERGENT_EXISTING_IDENTITY");
      }
      if (cursor.superseded_by_successor_protocol_hash_hex !== successorRoot.protocol_hash_hex) {
        throw new Error("DIVERGENT_EXISTING_IDENTITY");
      }
      if (cursor.superseded_by_successor_root_hash_hex !== successorRoot.hash_hex) {
        throw new Error("DIVERGENT_EXISTING_IDENTITY");
      }
      if (successorRoot.scientific_promotion_transition_id === cursor.scientific_promotion_transition_id || successorRoot.chain_key === cursor.chain_key) {
        throw new Error("DIVERGENT_EXISTING_IDENTITY");
      }
      result.push(...followChain(successorRoot, byId, successors, seenChains));
    }
    cursor = undefined;
  }
  return result;
}

function projectRow(row: PromotionRow): ScientificPromotionTransitionProjectionV1 {
  return {
    scientificPromotionTransitionId: row.scientific_promotion_transition_id,
    scientificPromotionProtocolIdentityId: row.scientific_promotion_protocol_identity_id,
    protocol: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", row.protocol_hash_hex),
    transition: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", row.hash_hex),
    chainKey: row.chain_key,
    rootTransitionId: row.root_transition_id,
    predecessorTransitionId: row.predecessor_transition_id,
    predecessorState: row.predecessor_state,
    resultingState: row.resulting_state,
    gateOutcomes: row.gate_outcomes,
    transitionReasons: row.transition_reasons,
    supersededByChain: row.superseded_by_successor_protocol_hash_hex && row.superseded_by_successor_root_transition_id && row.superseded_by_successor_root_hash_hex
      ? {
          successorProtocolHashHex: row.superseded_by_successor_protocol_hash_hex,
          successorRootTransitionId: row.superseded_by_successor_root_transition_id,
          successorRootTransitionHashHex: row.superseded_by_successor_root_hash_hex,
        }
      : null,
    createdAt: row.created_at,
  };
}

function ref(hashDomain: string, hashHex: string): HashRefProjectionV1 {
  return { hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex };
}
function groupBy<Row, Key>(rows: readonly Row[], getKey: (row: Row) => Key) {
  const result = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = result.get(key);
    if (group) group.push(row);
    else result.set(key, [row]);
  }
  return result;
}
function byCreatedThenId(left: PromotionRow, right: PromotionRow) {
  return left.created_at.localeCompare(right.created_at) || left.scientific_promotion_transition_id.localeCompare(right.scientific_promotion_transition_id);
}
