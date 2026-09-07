import {
  canonicalOpaqueStringV1,
  canonicalTextV1,
  canonicalTokenV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  i5ResearchInternalStructuredHashPreimageV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";

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

export type ResearchSpecHypothesisBindingV1 =
  | Readonly<{ kind: "NO_HYPOTHESIS" }>
  | Readonly<{ kind: "EXPLICIT_HYPOTHESIS"; hypothesis: HashRefV1; hypothesisMeasurable: boolean; unresolvedObservableDefinitions: readonly string[] }>
  | Readonly<{ kind: "INFER_ACTIVE_HYPOTHESIS" }>;

export type ResearchSpecHashPayloadInputV1 = Readonly<{
  schemaVersion: "RESEARCH_SPEC_HASH_PAYLOAD_V1";
  sourceDraft: HashRefV1;
  hypothesisBinding: ResearchSpecHypothesisBindingV1;
  objective: MaterialSemanticFieldV1;
  executionIntent: "EXECUTABLE";
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
  if (!Array.isArray(input.constraints)) throw new Error("constraints must be an array");
  return {
    schemaVersion: input.schemaVersion,
    rawIntent: canonicalTextV1(input.rawIntent, { minBytes: 1, maxBytes: 4096 }),
    interpretedObjective: canonicalMaterialSemanticFieldV1(input.interpretedObjective),
    constraints: input.constraints.map(canonicalMaterialSemanticFieldV1),
  };
}

export function canonicalResearchDraftBytesV1(input: ResearchDraftHashPayloadInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchDraftHashPayloadV1(input));
}

function researchDraftPreimageV1(input: ResearchDraftHashPayloadInputV1): Buffer {
  return i5ResearchInternalStructuredHashPreimageV1("SYNTRAKE:RESEARCH_DRAFT:V1", canonicalResearchDraftHashPayloadV1(input));
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
    throw new Error("observableDefinitionRequirements must be an array");
  }

  const payload: Record<string, CanonicalJsonValue> = {
    schemaVersion: input.schemaVersion,
    statement: canonicalTextV1(input.statement, { minBytes: 1, maxBytes: 4096 }),
    falsifiable: input.falsifiable,
    measurable: input.measurable,
    observableDefinitionRequirements: input.observableDefinitionRequirements.map(canonicalObservableRequirementV1),
  };
  if (input.nullHypothesis !== undefined) payload.nullHypothesis = canonicalTextV1(input.nullHypothesis, { minBytes: 1, maxBytes: 4096 });
  if (input.rationale !== undefined) payload.rationale = canonicalTextV1(input.rationale, { minBytes: 1, maxBytes: 4096 });
  return payload;
}

export function canonicalHypothesisBytesV1(input: HypothesisHashPayloadInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalHypothesisHashPayloadV1(input));
}

function hypothesisPreimageV1(input: HypothesisHashPayloadInputV1): Buffer {
  return i5ResearchInternalStructuredHashPreimageV1("SYNTRAKE:HYPOTHESIS:V1", canonicalHypothesisHashPayloadV1(input));
}

export function hashHypothesisV1(input: HypothesisHashPayloadInputV1): CanonicalSha256HexV1 {
  return sha256HexV1(hypothesisPreimageV1(input));
}

export function canonicalResearchSpecHashPayloadV1(input: ResearchSpecHashPayloadInputV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["schemaVersion", "sourceDraft", "hypothesisBinding", "objective", "executionIntent"]));
  if (input.schemaVersion !== "RESEARCH_SPEC_HASH_PAYLOAD_V1") throw new Error("invalid ResearchSpec schemaVersion");
  if (input.executionIntent !== "EXECUTABLE") throw new Error("ResearchSpec executionIntent must be EXECUTABLE");
  const sourceDraft = hashRefV1(input.sourceDraft);
  if (sourceDraft.hashDomain !== "SYNTRAKE:RESEARCH_DRAFT:V1") throw new Error("wrong-domain ResearchSpec sourceDraft");
  const objective = canonicalMaterialSemanticFieldV1(input.objective);
  if (isBlockingMaterialField(input.objective)) throw new Error("unresolved material ambiguity blocks executable ResearchSpec");

  return {
    schemaVersion: input.schemaVersion,
    sourceDraft,
    hypothesisBinding: canonicalResearchSpecHypothesisBindingV1(input.hypothesisBinding),
    objective,
    executionIntent: input.executionIntent,
  };
}

export function canonicalResearchSpecBytesV1(input: ResearchSpecHashPayloadInputV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchSpecHashPayloadV1(input));
}

function researchSpecPreimageV1(input: ResearchSpecHashPayloadInputV1): Buffer {
  return i5ResearchInternalStructuredHashPreimageV1("SYNTRAKE:RESEARCH_SPEC:V1", canonicalResearchSpecHashPayloadV1(input));
}

export function hashResearchSpecV1(input: ResearchSpecHashPayloadInputV1): CanonicalSha256HexV1 {
  return sha256HexV1(researchSpecPreimageV1(input));
}

export function applyA3PointerEffectV1(input: A3PointerEffectInputV1): InvestigationPointersV1 {
  assertClosedPlainObject(input, new Set(["kind", "predecessor", "newDraft", "newHypothesis", "newSpec"]));
  canonicalTokenV1(input.kind, a3PointerEffectKindsV1);
  const predecessor = canonicalInvestigationPointersV1(input.predecessor);
  if (input.kind === "DRAFT_REVISION") {
    if (input.newDraft === undefined) throw new Error("newDraft required");
    return { activeDraft: canonicalId(input.newDraft), activeHypothesis: predecessor.activeHypothesis, activeSpec: null, activeExperiment: null };
  }
  if (input.kind === "HYPOTHESIS_REVISION") {
    if (input.newHypothesis === undefined) throw new Error("newHypothesis required");
    if (predecessor.activeSpec && predecessor.activeSpec.hypothesis !== null && predecessor.activeSpec.hypothesis !== predecessor.activeHypothesis) {
      throw new Error("impossible active Spec/Hypothesis mismatch");
    }
    const keepSpec = predecessor.activeSpec !== null && predecessor.activeSpec.hypothesis === null;
    return {
      activeDraft: predecessor.activeDraft,
      activeHypothesis: canonicalId(input.newHypothesis),
      activeSpec: keepSpec ? predecessor.activeSpec : null,
      activeExperiment: keepSpec ? predecessor.activeExperiment : null,
    };
  }
  if (input.newSpec === undefined) throw new Error("newSpec required");
  const newSpec = canonicalActiveSpecPointerV1(input.newSpec);
  if (newSpec.sourceDraft !== predecessor.activeDraft) throw new Error("ResearchSpec sourceDraft must equal active Draft");
  if (newSpec.hypothesis !== null && newSpec.hypothesis !== predecessor.activeHypothesis) {
    throw new Error("ResearchSpec hypothesis must equal active Hypothesis");
  }
  return { activeDraft: predecessor.activeDraft, activeHypothesis: predecessor.activeHypothesis, activeSpec: newSpec, activeExperiment: null };
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
    return {
      state: input.state,
      value: canonicalTextV1(input.value, { minBytes: 1, maxBytes: 4096 }),
      policyId: canonicalClosedAsciiToken(input.policyId, "policyId"),
      policyVersion: canonicalImmutableVersion(input.policyVersion),
    };
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

function canonicalResearchSpecHypothesisBindingV1(input: ResearchSpecHypothesisBindingV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["kind", "hypothesis", "hypothesisMeasurable", "unresolvedObservableDefinitions"]));
  canonicalTokenV1(input.kind, specHypothesisBindingKindsV1);
  if (input.kind === "INFER_ACTIVE_HYPOTHESIS") throw new Error("Hypothesis dependency must be explicit");
  if (input.kind === "NO_HYPOTHESIS") {
    assertExactKeys(input, new Set(["kind"]));
    return { kind: input.kind };
  }
  assertExactKeys(input, new Set(["kind", "hypothesis", "hypothesisMeasurable", "unresolvedObservableDefinitions"]));
  const hypothesis = hashRefV1(input.hypothesis);
  if (hypothesis.hashDomain !== "SYNTRAKE:HYPOTHESIS:V1") throw new Error("wrong-domain ResearchSpec hypothesis");
  if (input.hypothesisMeasurable !== true) throw new Error("measurable=false blocks executable ResearchSpec");
  if (!Array.isArray(input.unresolvedObservableDefinitions)) throw new Error("unresolvedObservableDefinitions must be an array");
  if (input.unresolvedObservableDefinitions.length > 0) throw new Error("unresolved observable definitions block executable ResearchSpec");
  return { kind: input.kind, hypothesis };
}

function canonicalObservableRequirementV1(input: ObservableDefinitionRequirementV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["description", "state"]));
  return {
    description: canonicalTextV1(input.description, { minBytes: 1, maxBytes: 4096 }),
    state: canonicalTokenV1(input.state, observableRequirementStatesV1),
  };
}

function isBlockingMaterialField(input: MaterialSemanticFieldV1) {
  return input.state === "MATERIAL_UNRESOLVED" || input.state === "CONFIRMATION_REQUIRED";
}

function canonicalImmutableVersion(value: string) {
  if (/^(?:latest|current|stable|production|default|active|rolling)$/iu.test(value)) {
    throw new Error("BEHAVIOR_VERSION_NOT_IMMUTABLE");
  }
  return canonicalOpaqueStringV1(value, { minBytes: 1, maxBytes: 128 });
}

function canonicalClosedAsciiToken(value: string, name: string) {
  if (typeof value !== "string" || !/^[A-Z0-9_]+$/u.test(value)) throw new Error(`invalid ${name}`);
  return value;
}

function canonicalInvestigationPointersV1(input: InvestigationPointersV1): InvestigationPointersV1 {
  assertClosedPlainObject(input, new Set(["activeDraft", "activeHypothesis", "activeSpec", "activeExperiment"]));
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

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected closed plain object");
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
