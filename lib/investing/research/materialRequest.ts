import {
  canonicalIntegerV1,
  canonicalOpaqueStringV1,
  canonicalUuidV1,
  hashRefV1,
  sha256HexV1,
} from "./canonical";
import {
  hashHypothesisV1,
  hashResearchDraftV1,
  type HypothesisProofV1,
  type ResearchDraftProofV1,
} from "./semantic";

const domain = "SYNTRAKE_INVESTING_I5_MATERIAL_COMMAND_REQUEST_V1";
const investigationOperation = "RESEARCH_INVESTIGATION_CREATE_V1";
const draftCreateOperation = "RESEARCH_DRAFT_CREATE_V1";
const draftOperation = "RESEARCH_DRAFT_REVISION_CREATE_V1";
const hypothesisOperation = "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1";
const maxCounter = "9223372036854775807";

/** Derived data only. This is NOT AuthorizedInvestingContext or ownership proof. */
export type ResearchMaterialScopeEvidenceV1 = Readonly<{
  actorKind: "USER_PRINCIPAL";
  actorId: string;
  principalId: string;
  tenantId: string;
} & (
  | { operationScope: "TENANT_SCOPE"; sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO"; accountId?: never }
  | { operationScope: "ACCOUNT_SCOPE"; sourceContext: "USER_PORTFOLIO"; accountId: string }
)>;

export type ExpectedResearchMaterialPointersV1 = Readonly<{
  expectedActivePointerVersion: string;
  expectedResearchDraftRevisionId: string | null;
  expectedHypothesisRevisionId: string | null;
  expectedResearchSpecRevisionId: null;
  expectedExperimentId: null;
}>;

export type ExpectedResearchMaterialRootV1 =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "PRESENT"; rootId: string; headRevisionId: string; headRevisionNumber: string }>;

type RequestMetadata = Readonly<{ idempotencyKey: string; correlationId: string }>;
export type InvestigationCreateMaterialRequestV1 = RequestMetadata & Readonly<{
  operation: typeof investigationOperation;
}>;
export type DraftCreateMaterialRequestV1 = RequestMetadata & Readonly<{
  operation: typeof draftCreateOperation;
  investigationId: string;
  content: ResearchDraftProofV1;
}>;
type RevisionMaterialRequest = RequestMetadata & Readonly<{
  investigationId: string;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  expectedRoot: ExpectedResearchMaterialRootV1;
}>;
export type DraftRevisionCreateMaterialRequestV1 = RevisionMaterialRequest & Readonly<{
  operation: typeof draftOperation;
  content: ResearchDraftProofV1;
}>;
export type HypothesisRevisionCreateMaterialRequestV1 = RevisionMaterialRequest & Readonly<{
  operation: typeof hypothesisOperation;
  content: HypothesisProofV1;
}>;

export type ResearchMaterialRequestHashV1 = string & { readonly __researchMaterialRequestHashV1: unique symbol };
export type ResearchMaterialIdentityV1 = Readonly<{
  preimageBytes: Buffer;
  materialRequestHash: ResearchMaterialRequestHashV1;
}>;

/** Pure identity calculation. Future callers must resolve Research authority first. */
export function investigationCreateMaterialIdentityV1(
  scope: ResearchMaterialScopeEvidenceV1,
  command: InvestigationCreateMaterialRequestV1,
): ResearchMaterialIdentityV1 {
  const input = closed(command, ["operation", "idempotencyKey", "correlationId"]);
  validateMetadata(input, investigationOperation);
  return identity(scopeFragments(scope, investigationOperation));
}

export function draftCreateMaterialIdentityV1(
  scope: ResearchMaterialScopeEvidenceV1,
  command: DraftCreateMaterialRequestV1,
): ResearchMaterialIdentityV1 {
  const input = closed(command, ["operation", "idempotencyKey", "correlationId", "investigationId", "content"]);
  validateMetadata(input, draftCreateOperation);
  const proof = closed(input.content, ["ref", "payload"]);
  const ref = hashRefV1(closed(proof.ref, ["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]));
  if (ref.hashDomain !== "SYNTRAKE:RESEARCH_DRAFT:V1") throw new Error("wrong Draft content domain");
  if (hashResearchDraftV1(proof.payload) !== ref.hashHex) throw new Error("Draft scientific proof mismatch");
  return identity([
    ...scopeFragments(scope, draftCreateOperation),
    `investigation=${canonicalUuidV1(input.investigationId)}`,
    "content_algorithm=SHA-256",
    `content_domain=${ref.hashDomain}`,
    "content_version=SYNTRAKE_SHA256_V1",
    `content=${ref.hashHex}`,
  ]);
}

export function draftRevisionCreateMaterialIdentityV1(
  scope: ResearchMaterialScopeEvidenceV1,
  command: DraftRevisionCreateMaterialRequestV1,
): ResearchMaterialIdentityV1 {
  const input = revisionCommand(command, draftOperation);
  const proof = closed(input.content, ["ref", "payload"]);
  const ref = hashRefV1(closed(proof.ref, ["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]));
  if (ref.hashDomain !== "SYNTRAKE:RESEARCH_DRAFT:V1") throw new Error("wrong Draft content domain");
  if (hashResearchDraftV1(proof.payload) !== ref.hashHex) throw new Error("Draft scientific proof mismatch");
  return identity([
    ...scopeFragments(scope, draftOperation),
    ...revisionFragments(input, ref.hashDomain, ref.hashHex, "expectedResearchDraftRevisionId"),
  ]);
}

export function hypothesisRevisionCreateMaterialIdentityV1(
  scope: ResearchMaterialScopeEvidenceV1,
  command: HypothesisRevisionCreateMaterialRequestV1,
): ResearchMaterialIdentityV1 {
  const input = revisionCommand(command, hypothesisOperation);
  const proof = closed(input.content, ["ref", "payload"]);
  const ref = hashRefV1(closed(proof.ref, ["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]));
  if (ref.hashDomain !== "SYNTRAKE:HYPOTHESIS:V1") throw new Error("wrong Hypothesis content domain");
  if (hashHypothesisV1(proof.payload) !== ref.hashHex) throw new Error("Hypothesis scientific proof mismatch");
  return identity([
    ...scopeFragments(scope, hypothesisOperation),
    ...revisionFragments(input, ref.hashDomain, ref.hashHex, "expectedHypothesisRevisionId"),
  ]);
}

function scopeFragments(scope: ResearchMaterialScopeEvidenceV1, operation: string): string[] {
  const input = closed(scope, ["actorKind", "actorId", "principalId", "operationScope", "tenantId", "sourceContext"], ["accountId"]);
  if (input.actorKind !== "USER_PRINCIPAL") throw new Error("unsupported material actor kind");
  const actor = canonicalOpaqueStringV1(input.actorId, { minBytes: 1, maxBytes: 4096 });
  let account = "-";
  if (input.operationScope === "TENANT_SCOPE") {
    if (input.sourceContext !== "PURE_RESEARCH" && input.sourceContext !== "TEST_PORTFOLIO") {
      throw new Error("invalid tenant source context");
    }
    if (Object.hasOwn(input, "accountId")) throw new Error("tenant account must be absent");
  } else if (input.operationScope === "ACCOUNT_SCOPE" && input.sourceContext === "USER_PORTFOLIO") {
    account = canonicalUuidV1(input.accountId);
  } else {
    throw new Error("unsupported material scope/context");
  }
  return [
    domain, operation,
    "actor_kind=USER_PRINCIPAL",
    `actor_utf8_hex=${Buffer.from(actor, "utf8").toString("hex").toUpperCase()}`,
    `principal=${canonicalUuidV1(input.principalId)}`,
    `scope=${input.operationScope}`,
    `tenant=${canonicalUuidV1(input.tenantId)}`,
    `account=${account}`,
    `source_context=${input.sourceContext}`,
  ];
}

function revisionCommand<T extends RevisionMaterialRequest & { operation: string; content: unknown }>(command: T, operation: string): T {
  const input = closed(command, ["operation", "idempotencyKey", "correlationId", "investigationId", "content", "expectedPointers", "expectedRoot"]);
  validateMetadata(input, operation);
  return input;
}

function validateMetadata(command: RequestMetadata & { operation: string }, operation: string): void {
  if (command.operation !== operation) throw new Error("wrong material operation");
  canonicalOpaqueStringV1(command.idempotencyKey, { minBytes: 16, maxBytes: 512 });
  canonicalOpaqueStringV1(command.correlationId, { minBytes: 16, maxBytes: 512 });
}

function revisionFragments(
  command: RevisionMaterialRequest,
  contentDomain: string,
  contentHash: string,
  ownPointer: "expectedResearchDraftRevisionId" | "expectedHypothesisRevisionId",
): string[] {
  const pointers = closed(command.expectedPointers, [
    "expectedActivePointerVersion", "expectedResearchDraftRevisionId", "expectedHypothesisRevisionId",
    "expectedResearchSpecRevisionId", "expectedExperimentId",
  ]);
  if (pointers.expectedResearchSpecRevisionId !== null || pointers.expectedExperimentId !== null) {
    throw new Error("Spec and Experiment predecessors must be exact null in this subset");
  }
  const root = closed(command.expectedRoot, ["state"], ["rootId", "headRevisionId", "headRevisionNumber"]);
  let rootFields: string[];
  if (root.state === "ABSENT") {
    closed(root, ["state"]);
    if (pointers[ownPointer] !== null) throw new Error("absent root cannot have an active revision");
    rootFields = ["root_state=ABSENT", "expected_root=-", "expected_head=-", "expected_head_number=-"];
  } else if (root.state === "PRESENT") {
    const head = closed(root, ["state", "rootId", "headRevisionId", "headRevisionNumber"]);
    rootFields = [
      "root_state=PRESENT", `expected_root=${canonicalUuidV1(head.rootId)}`,
      `expected_head=${canonicalUuidV1(head.headRevisionId)}`,
      `expected_head_number=${counter(head.headRevisionNumber, "1")}`,
    ];
  } else {
    throw new Error("invalid root predecessor state");
  }
  return [
    `investigation=${canonicalUuidV1(command.investigationId)}`,
    "content_algorithm=SHA-256", `content_domain=${contentDomain}`,
    "content_version=SYNTRAKE_SHA256_V1", `content=${contentHash}`,
    `expected_active_pointer_version=${counter(pointers.expectedActivePointerVersion, "0")}`,
    `expected_draft=${nullableUuid(pointers.expectedResearchDraftRevisionId)}`,
    `expected_hypothesis=${nullableUuid(pointers.expectedHypothesisRevisionId)}`,
    "expected_spec=-", "expected_experiment=-",
    ...rootFields,
  ];
}

function counter(value: string, min: string): string {
  return canonicalIntegerV1(value, { min, max: maxCounter, allowNegative: false });
}

function nullableUuid(value: string | null): string {
  return value === null ? "-" : canonicalUuidV1(value);
}

function identity(fragments: readonly string[]): ResearchMaterialIdentityV1 {
  const preimageBytes = Buffer.from(fragments.join("\0"), "utf8");
  return { preimageBytes, materialRequestHash: sha256HexV1(preimageBytes) as string as ResearchMaterialRequestHashV1 };
}

/** Snapshot own data properties; never execute getters while admitting evidence. */
function closed<T>(value: T, required: readonly string[], optional: readonly string[] = []): T {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("expected closed plain material record");
  }
  const admitted: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) {
      throw new Error("unexpected material field");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) {
      throw new Error("material fields must be defined enumerable data properties");
    }
    admitted[key] = descriptor.value;
  }
  for (const key of required) {
    if (!Object.hasOwn(admitted, key)) throw new Error(`missing material field ${key}`);
  }
  return admitted as T;
}
