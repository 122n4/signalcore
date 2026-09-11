import {
  canonicalTextV1,
  canonicalTokenV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

const materialFieldStatesV1 = new Set([
  "USER_SUPPLIED",
  "POLICY_DEFAULT_APPLIED",
  "MATERIAL_UNRESOLVED",
  "CONFIRMATION_REQUIRED",
]);
const observableRequirementStatesV1 = new Set(["RESOLVED", "UNRESOLVED"]);
const specHypothesisBindingKindsV1 = new Set(["NO_HYPOTHESIS", "EXPLICIT_HYPOTHESIS", "INFER_ACTIVE_HYPOTHESIS"]);
const a3PointerEffectKindsV1 = new Set(["DRAFT_REVISION", "HYPOTHESIS_REVISION", "RESEARCH_SPEC_REVISION"]);

export type MaterialSemanticFieldV1 =
  | Readonly<{ state: "USER_SUPPLIED"; value: string }>
  | Readonly<{ state: "POLICY_DEFAULT_APPLIED"; value: string; policyId: string; policyVersion: string }>
  | Readonly<{ state: "MATERIAL_UNRESOLVED"; question: string }>
  | Readonly<{ state: "CONFIRMATION_REQUIRED"; proposedValue: string; question: string }>;

export type ResearchDraftHashPayloadInputV1 = Readonly<{
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1";
  rawIntent: string;
  interpretedObjective: MaterialSemanticFieldV1;
  constraints: readonly MaterialSemanticFieldV1[];
}>;

export type ObservableDefinitionRequirementV1 = Readonly<{
  description: string;
  state: "RESOLVED" | "UNRESOLVED";
}>;

export type HypothesisHashPayloadInputV1 = Readonly<{
  schemaVersion: "HYPOTHESIS_HASH_PAYLOAD_V1";
  statement: string;
  nullHypothesis?: string;
  rationale?: string;
  falsifiable: boolean;
  measurable: boolean;
  observableDefinitionRequirements: readonly ObservableDefinitionRequirementV1[];
}>;

export type ResearchDraftProofV1 = Readonly<{
  ref: HashRefV1;
  payload: ResearchDraftHashPayloadInputV1;
}>;

export type HypothesisProofV1 = Readonly<{
  ref: HashRefV1;
  payload: HypothesisHashPayloadInputV1;
}>;

export type ResearchSpecCandidateHypothesisBindingV1 =
  | Readonly<{ kind: "NO_HYPOTHESIS" }>
  | Readonly<{ kind: "EXPLICIT_HYPOTHESIS"; hypothesis: HypothesisProofV1 }>
  | Readonly<{ kind: "INFER_ACTIVE_HYPOTHESIS" }>;

export type ResearchSpecCandidateInputV1 = Readonly<{
  schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1";
  sourceDraft: ResearchDraftProofV1;
  hypothesisBinding: ResearchSpecCandidateHypothesisBindingV1;
  objective: MaterialSemanticFieldV1;
  status: "CANDIDATE_ONLY";
}>;

export type InvestigationPointersV1 = Readonly<{
  activeDraft: string | null;
  activeHypothesis: string | null;
  activeSpec: Readonly<{ id: string; sourceDraft: string; hypothesis: string | null }> | null;
  activeExperiment: string | null;
}>;

export type A3PointerEffectInputV1 = Readonly<{
  kind: "DRAFT_REVISION" | "HYPOTHESIS_REVISION" | "RESEARCH_SPEC_REVISION";
  predecessor: InvestigationPointersV1;
  newDraft?: string;
  newHypothesis?: string;
  newSpec?: Readonly<{ id: string; sourceDraft: string; hypothesis: string | null }>;
}>;

export function canonicalResearchDraftHashPayloadV1(input: ResearchDraftHashPayloadInputV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["schemaVersion", "rawIntent", "interpretedObjective", "constraints"]));
  if (input.schemaVersion !== "RESEARCH_DRAFT_HASH_PAYLOAD_V1") throw new Error("invalid ResearchDraft schemaVersion");
  if (!Array.isArray(input.constraints)) throw new Error("constraints must be an ORDERED_SEQUENCE array");
  const constraints = input.constraints.map(canonicalMaterialSemanticFieldV1);
  rejectDuplicateCanonicalElements("constraints", constraints);
  return {
    schemaVersion: input.schemaVersion,
    rawIntent: canonicalTextV1(input.rawIntent, { minBytes: 1, maxBytes: 4096 }),
    interpretedObjective: canonicalMaterialSemanticFieldV1(input.interpretedObjective),
    constraints,
  };
}

export function canonicalResearchDraftBytesV1(input: ResearchDraftHashPayloadInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchDraftHashPayloadV1(input));
}

function researchDraftPreimageV1(input: ResearchDraftHashPayloadInputV1): Buffer {
  return ownerStructuredHashPreimageV1("SYNTRAKE:RESEARCH_DRAFT:V1", canonicalResearchDraftHashPayloadV1(input));
}

export function hashResearchDraftV1(input: ResearchDraftHashPayloadInputV1): CanonicalSha256HexV1 {
  return sha256HexV1(researchDraftPreimageV1(input));
}

export function canonicalHypothesisHashPayloadV1(input: HypothesisHashPayloadInputV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set([
    "schemaVersion",
    "statement",
    "nullHypothesis",
    "rationale",
    "falsifiable",
    "measurable",
    "observableDefinitionRequirements",
  ]));
  if (input.schemaVersion !== "HYPOTHESIS_HASH_PAYLOAD_V1") throw new Error("invalid Hypothesis schemaVersion");
  if (typeof input.falsifiable !== "boolean") throw new Error("falsifiable must be boolean");
  if (typeof input.measurable !== "boolean") throw new Error("measurable must be boolean");
  if (!Array.isArray(input.observableDefinitionRequirements)) {
    throw new Error("observableDefinitionRequirements must be an ORDERED_SEQUENCE array");
  }

  const observableDefinitionRequirements = input.observableDefinitionRequirements.map(canonicalObservableRequirementV1);
  rejectDuplicateCanonicalElements("observableDefinitionRequirements", observableDefinitionRequirements);

  const payload: Record<string, CanonicalJsonValue> = {
    schemaVersion: input.schemaVersion,
    statement: canonicalTextV1(input.statement, { minBytes: 1, maxBytes: 4096 }),
    falsifiable: input.falsifiable,
    measurable: input.measurable,
    observableDefinitionRequirements,
  };
  if (input.nullHypothesis !== undefined) payload.nullHypothesis = canonicalTextV1(input.nullHypothesis, { minBytes: 1, maxBytes: 4096 });
  if (input.rationale !== undefined) payload.rationale = canonicalTextV1(input.rationale, { minBytes: 1, maxBytes: 4096 });
  return payload;
}

export function canonicalHypothesisBytesV1(input: HypothesisHashPayloadInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalHypothesisHashPayloadV1(input));
}

function hypothesisPreimageV1(input: HypothesisHashPayloadInputV1): Buffer {
  return ownerStructuredHashPreimageV1("SYNTRAKE:HYPOTHESIS:V1", canonicalHypothesisHashPayloadV1(input));
}

export function hashHypothesisV1(input: HypothesisHashPayloadInputV1): CanonicalSha256HexV1 {
  return sha256HexV1(hypothesisPreimageV1(input));
}

export function canonicalResearchSpecCandidatePayloadV1(input: ResearchSpecCandidateInputV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["schemaVersion", "sourceDraft", "hypothesisBinding", "objective", "status"]));
  if (input.schemaVersion !== "RESEARCH_SPEC_CANDIDATE_V1") throw new Error("invalid ResearchSpecCandidate schemaVersion");
  if (input.status !== "CANDIDATE_ONLY") throw new Error("ResearchSpec remains candidate-only until A8/A9 material owners freeze execution payloads");
  const sourceDraft = canonicalResearchDraftProofV1(input.sourceDraft);
  assertDraftReadyForSpecPromotion(input.sourceDraft.payload);
  const objective = canonicalMaterialSemanticFieldV1(input.objective);
  if (isBlockingMaterialField(input.objective)) throw new Error("unresolved material ambiguity blocks ResearchSpec candidate promotion");

  return {
    schemaVersion: input.schemaVersion,
    sourceDraft,
    hypothesisBinding: canonicalResearchSpecCandidateHypothesisBindingV1(input.hypothesisBinding),
    objective,
    status: input.status,
  };
}

export function canonicalResearchSpecCandidateBytesV1(input: ResearchSpecCandidateInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchSpecCandidatePayloadV1(input));
}

export function assertResearchSpecHashingDisabledV1(): never {
  throw new Error("ResearchSpec scientific hashing disabled until complete execution-material owner payloads are frozen");
}

export function applyA3PointerEffectV1(input: A3PointerEffectInputV1): InvestigationPointersV1 {
  assertClosedPlainObject(input, new Set(["kind", "predecessor", "newDraft", "newHypothesis", "newSpec"]));
  canonicalTokenV1(input.kind, a3PointerEffectKindsV1);
  const predecessor = canonicalInvestigationPointersV1(input.predecessor);
  if (input.kind === "DRAFT_REVISION") {
    rejectPresent(input.newHypothesis, "newHypothesis");
    rejectPresent(input.newSpec, "newSpec");
    if (input.newDraft === undefined) throw new Error("newDraft required");
    return { activeDraft: canonicalId(input.newDraft), activeHypothesis: predecessor.activeHypothesis, activeSpec: null, activeExperiment: null };
  }
  if (input.kind === "HYPOTHESIS_REVISION") {
    rejectPresent(input.newDraft, "newDraft");
    rejectPresent(input.newSpec, "newSpec");
    if (input.newHypothesis === undefined) throw new Error("newHypothesis required");
    const keepSpec = predecessor.activeSpec !== null && predecessor.activeSpec.hypothesis === null;
    return {
      activeDraft: predecessor.activeDraft,
      activeHypothesis: canonicalId(input.newHypothesis),
      activeSpec: keepSpec ? predecessor.activeSpec : null,
      activeExperiment: keepSpec ? predecessor.activeExperiment : null,
    };
  }
  rejectPresent(input.newDraft, "newDraft");
  rejectPresent(input.newHypothesis, "newHypothesis");
  if (input.newSpec === undefined) throw new Error("newSpec required");
  const newSpec = canonicalActiveSpecPointerV1(input.newSpec);
  if (newSpec.sourceDraft !== predecessor.activeDraft) throw new Error("ResearchSpec sourceDraft must equal active Draft");
  if (newSpec.hypothesis !== null && newSpec.hypothesis !== predecessor.activeHypothesis) {
    throw new Error("ResearchSpec hypothesis must equal active Hypothesis");
  }
  return { activeDraft: predecessor.activeDraft, activeHypothesis: predecessor.activeHypothesis, activeSpec: newSpec, activeExperiment: null };
}

export function emptyInvestigationPointersV1(): InvestigationPointersV1 {
  return Object.freeze({
    activeDraft: null,
    activeHypothesis: null,
    activeSpec: null,
    activeExperiment: null,
  });
}

function canonicalResearchDraftProofV1(input: ResearchDraftProofV1): HashRefV1 {
  assertClosedPlainObject(input, new Set(["ref", "payload"]));
  const ref = hashRefV1(input.ref);
  if (ref.hashDomain !== "SYNTRAKE:RESEARCH_DRAFT:V1") throw new Error("wrong-domain ResearchSpec sourceDraft");
  if (hashResearchDraftV1(input.payload) !== ref.hashHex) throw new Error("ResearchDraft proof hash mismatch");
  return ref;
}

function canonicalHypothesisProofV1(input: HypothesisProofV1): HashRefV1 {
  assertClosedPlainObject(input, new Set(["ref", "payload"]));
  const ref = hashRefV1(input.ref);
  if (ref.hashDomain !== "SYNTRAKE:HYPOTHESIS:V1") throw new Error("wrong-domain ResearchSpec hypothesis");
  if (hashHypothesisV1(input.payload) !== ref.hashHex) throw new Error("Hypothesis proof hash mismatch");
  if (input.payload.measurable !== true) throw new Error("measurable=false blocks ResearchSpec candidate promotion");
  if (input.payload.observableDefinitionRequirements.length > 0) {
    throw new Error("observable definitions require immutable owner proof before ResearchSpec candidate promotion");
  }
  return ref;
}

function canonicalMaterialSemanticFieldV1(input: MaterialSemanticFieldV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["state", "value", "policyId", "policyVersion", "question", "proposedValue"]));
  canonicalTokenV1(input.state, materialFieldStatesV1);
  if (input.state === "USER_SUPPLIED") {
    assertExactKeys(input, new Set(["state", "value"]));
    return { state: input.state, value: canonicalTextV1(input.value, { minBytes: 1, maxBytes: 4096 }) };
  }
  if (input.state === "POLICY_DEFAULT_APPLIED") {
    assertExactKeys(input, new Set(["state", "value", "policyId", "policyVersion"]));
    throw new Error("POLICY_DEFAULT_APPLIED requires immutable owner policy identity proof");
  }
  if (input.state === "MATERIAL_UNRESOLVED") {
    assertExactKeys(input, new Set(["state", "question"]));
    return { state: input.state, question: canonicalTextV1(input.question, { minBytes: 1, maxBytes: 4096 }) };
  }
  assertExactKeys(input, new Set(["state", "proposedValue", "question"]));
  return {
    state: input.state,
    proposedValue: canonicalTextV1(input.proposedValue, { minBytes: 1, maxBytes: 4096 }),
    question: canonicalTextV1(input.question, { minBytes: 1, maxBytes: 4096 }),
  };
}

function assertDraftReadyForSpecPromotion(input: ResearchDraftHashPayloadInputV1) {
  if (isBlockingMaterialField(input.interpretedObjective) || input.constraints.some(isBlockingMaterialField)) {
    throw new Error("ResearchDraft material blockers prevent ResearchSpec candidate promotion");
  }
}

function canonicalResearchSpecCandidateHypothesisBindingV1(input: ResearchSpecCandidateHypothesisBindingV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["kind", "hypothesis"]));
  canonicalTokenV1(input.kind, specHypothesisBindingKindsV1);
  if (input.kind === "INFER_ACTIVE_HYPOTHESIS") throw new Error("Hypothesis dependency must be explicit");
  if (input.kind === "NO_HYPOTHESIS") {
    assertExactKeys(input, new Set(["kind"]));
    return { kind: input.kind };
  }
  assertExactKeys(input, new Set(["kind", "hypothesis"]));
  return { kind: input.kind, hypothesis: canonicalHypothesisProofV1(input.hypothesis) };
}

function canonicalObservableRequirementV1(input: ObservableDefinitionRequirementV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["description", "state"]));
  return {
    description: canonicalTextV1(input.description, { minBytes: 1, maxBytes: 4096 }),
    state: canonicalTokenV1(input.state, observableRequirementStatesV1),
  };
}

function rejectDuplicateCanonicalElements(name: string, elements: readonly CanonicalJsonValue[]) {
  const seen = new Set<string>();
  for (const element of elements) {
    const canonical = i5ResearchInternalCanonicalJsonBytesV1(element).toString("utf8");
    if (seen.has(canonical)) throw new Error(`duplicate ${name} element`);
    seen.add(canonical);
  }
}

function isBlockingMaterialField(input: MaterialSemanticFieldV1) {
  return input.state === "MATERIAL_UNRESOLVED" || input.state === "CONFIRMATION_REQUIRED" || input.state === "POLICY_DEFAULT_APPLIED";
}

function canonicalInvestigationPointersV1(input: InvestigationPointersV1): InvestigationPointersV1 {
  assertClosedPlainObject(input, new Set(["activeDraft", "activeHypothesis", "activeSpec", "activeExperiment"]));
  if (input.activeSpec === null && input.activeExperiment !== null) {
    throw new Error("impossible active Experiment without active Spec");
  }
  const activeSpec = input.activeSpec === null ? null : canonicalActiveSpecPointerV1(input.activeSpec);
  if (activeSpec && activeSpec.sourceDraft !== input.activeDraft) throw new Error("impossible active Spec/Draft mismatch");
  if (activeSpec && activeSpec.hypothesis !== null && activeSpec.hypothesis !== input.activeHypothesis) {
    throw new Error("impossible active Spec/Hypothesis mismatch");
  }
  return {
    activeDraft: nullableId(input.activeDraft),
    activeHypothesis: nullableId(input.activeHypothesis),
    activeSpec,
    activeExperiment: nullableId(input.activeExperiment),
  };
}

function canonicalActiveSpecPointerV1(input: Readonly<{ id: string; sourceDraft: string; hypothesis: string | null }>) {
  assertClosedPlainObject(input, new Set(["id", "sourceDraft", "hypothesis"]));
  return {
    id: canonicalId(input.id),
    sourceDraft: canonicalId(input.sourceDraft),
    hypothesis: nullableId(input.hypothesis),
  };
}

function nullableId(value: string | null) {
  if (value === null) return null;
  return canonicalId(value);
}

function canonicalId(value: string) {
  if (typeof value !== "string" || value.length < 1) throw new Error("invalid pointer id");
  return value;
}

function rejectPresent(value: unknown, field: string) {
  if (value !== undefined) throw new Error(`contradictory command field ${field}`);
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected closed plain object");
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("expected plain object");
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
}

function assertExactKeys(value: unknown, expectedKeys: ReadonlySet<string>) {
  assertClosedPlainObject(value, expectedKeys);
  const actualKeys = new Set(Object.keys(value as Record<string, unknown>));
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) throw new Error(`missing required field ${key}`);
  }
  if (actualKeys.size !== expectedKeys.size) throw new Error("contradictory union payload");
}
