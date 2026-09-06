# Syntrake Investing Genesis I5-A — Canonical Research Types V1

Status: `WORKING CONTRACT — NOT FROZEN`

Parent: `5de091fcfe1f595d781f6cbc4eaa49ed49341398`.

This document makes the I5-A domain object boundaries exact enough for independent design audit. It is design only.

---

## 1. Primitive rules

Canonical persisted IDs are UUIDs.

Canonical timestamps are PostgreSQL `timestamptz` and application strings that preserve the exact textual timestamp contract. JavaScript `Date` is not canonical timestamp authority where precision loss matters.

Canonical decimal values use decimal strings and PostgreSQL `NUMERIC` in future persistence. JavaScript `number` is forbidden for canonical money, prices, quantities, rates, weights and percentages.

Type aliases below are semantic placeholders:

```ts
type Uuid = string;
type CanonicalDecimal = string;
type CanonicalTimestamp = string;
type CanonicalDate = string;
type CorrelationId = string;
type IdempotencyKey = string;
type ContentHash = string;
```

All runtime validation remains fail-closed.

---

## 2. Scope envelope

```ts
type ActorKind = "USER_PRINCIPAL" | "SYSTEM_ACTOR";
type OperationScope = "ACCOUNT_SCOPE" | "TENANT_SCOPE" | "DOMAIN_SCOPE";

interface CanonicalResearchScope {
  operationScope: OperationScope;
  actorKind: ActorKind;
  actorId: Uuid;
  principalId?: Uuid;
  tenantId?: Uuid;
  accountId?: Uuid;
  correlationId: CorrelationId;
  authorityVersion: string;
}
```

Invariants:

```text
USER_PRINCIPAL => principalId REQUIRED
SYSTEM_ACTOR   => principalId ABSENT
ACCOUNT_SCOPE  => tenantId REQUIRED + accountId REQUIRED
TENANT_SCOPE   => tenantId REQUIRED + accountId ABSENT
DOMAIN_SCOPE   => tenantId ABSENT + accountId ABSENT
```

The client never constructs this envelope. It is emitted only by the server authority boundary.

---

## 3. InvestigationRoot

```ts
type InvestigationStatus =
  | "DRAFT"
  | "ACTIVE"
  | "BLOCKED"
  | "COMPLETED"
  | "ARCHIVED";

type ResearchStage =
  | "IDEA"
  | "BUILD"
  | "TEST"
  | "CHALLENGE"
  | "VERIFY";

type ResearchSourceContext =
  | "PURE_RESEARCH"
  | "TEST_PORTFOLIO"
  | "USER_PORTFOLIO";

interface InvestigationRootV1 {
  schemaVersion: "INVESTIGATION_ROOT_V1";
  investigationId: Uuid;
  operationScope: OperationScope;
  tenantId?: Uuid;
  accountId?: Uuid;
  sourceContext: ResearchSourceContext;
  createdByActorKind: ActorKind;
  createdByActorId: Uuid;
  status: InvestigationStatus;
  currentStage: ResearchStage;
  activeResearchDraftRevisionId?: Uuid;
  activeHypothesisRevisionId?: Uuid;
  activeResearchSpecRevisionId?: Uuid;
  activeExperimentId?: Uuid;
  activePointerVersion: number;
  createdAt: CanonicalTimestamp;
  archivedAt?: CanonicalTimestamp;
}
```

`activePointerVersion` is a non-negative integer and is the aggregate CAS authority for all active semantic pointers.

---

## 4. ResearchDraft

```ts
interface ResearchDraftRootV1 {
  schemaVersion: "RESEARCH_DRAFT_ROOT_V1";
  researchDraftRootId: Uuid;
  investigationId: Uuid;
  createdAt: CanonicalTimestamp;
}

interface ResearchDraftRevisionV1 {
  schemaVersion: "RESEARCH_DRAFT_REVISION_V1";
  researchDraftRevisionId: Uuid;
  researchDraftRootId: Uuid;
  investigationId: Uuid;
  revision: number;
  predecessorRevisionId?: Uuid;
  rawIntent: string;
  interpretedGoal?: string;
  entities: ExtractedEntityV1[];
  concepts: FinancialConceptRefV1[];
  constraints: ResearchConstraintV1[];
  ambiguities: ResearchAmbiguityV1[];
  proposedDefinitions: ProposedDefinitionV1[];
  unresolvedQuestions: string[];
  interpretationEvidenceId?: Uuid;
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

Revision is strictly monotonic per root. Revision 1 has no predecessor. Revision N>1 must point to revision N-1 unless a future explicit branch/fork contract is accepted.

---

## 5. Hypothesis

```ts
interface HypothesisRootV1 {
  schemaVersion: "HYPOTHESIS_ROOT_V1";
  hypothesisRootId: Uuid;
  investigationId: Uuid;
  createdAt: CanonicalTimestamp;
}

interface HypothesisRevisionV1 {
  schemaVersion: "HYPOTHESIS_REVISION_V1";
  hypothesisRevisionId: Uuid;
  hypothesisRootId: Uuid;
  investigationId: Uuid;
  revision: number;
  predecessorRevisionId?: Uuid;
  statement: string;
  nullHypothesis?: string;
  rationale?: string;
  falsifiable: boolean;
  measurable: boolean;
  observableDefinitionRefs: Uuid[];
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

`measurable=false` or unresolved material observable definitions blocks executable ResearchSpec canonicalization.

---

## 6. ResearchSpec

```ts
interface ResearchSpecRootV1 {
  schemaVersion: "RESEARCH_SPEC_ROOT_V1";
  researchSpecRootId: Uuid;
  investigationId: Uuid;
  createdAt: CanonicalTimestamp;
}

interface ResearchSpecRevisionV1 {
  schemaVersion: "RESEARCH_SPEC_REVISION_V1";
  researchSpecRevisionId: Uuid;
  researchSpecRootId: Uuid;
  investigationId: Uuid;
  revision: number;
  predecessorRevisionId?: Uuid;
  objective: ResearchObjectiveV1;
  universe: UniverseSpecV1;
  selectionRules: RuleSpecV1[];
  entryRules: RuleSpecV1[];
  exitRules: RuleSpecV1[];
  weightingRule?: WeightingSpecV1;
  rebalanceRule?: RebalanceSpecV1;
  benchmark?: BenchmarkSpecV1;
  horizon: HorizonSpecV1;
  startDate?: CanonicalDate;
  endDate?: CanonicalDate;
  frequency: DataFrequencyV1;
  metricRequests: MetricRequestV1[];
  costs: CostModelSpecV1;
  slippage: SlippageModelSpecV1;
  valuationCurrency: string;
  dataRequirements: DataRequirementV1[];
  validationRequirements: ValidationRequirementV1[];
  assumptions: AssumptionSpecV1[];
  explicitDefaults: ExplicitDefaultV1[];
  successCriteria: CriterionSpecV1[];
  failureCriteria: CriterionSpecV1[];
  sourceDraftRevisionId: Uuid;
  hypothesisRevisionId?: Uuid;
  templateVersionRef?: TemplateVersionRefV1;
  compilerVersion: string;
  ontologyVersion: string;
  policyVersion: string;
  irVersion: "RESEARCH_IR_V1";
  researchIrHash: ContentHash;
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

`slippage` is required as an explicit model. An explicit zero-slippage model is valid; absence is not silently interpreted as zero.

---

## 7. Experiment

```ts
type ExperimentRelation =
  | "BASELINE"
  | "VARIANT"
  | "SENSITIVITY"
  | "VALIDATION";

interface ExperimentV1 {
  schemaVersion: "EXPERIMENT_V1";
  experimentId: Uuid;
  investigationId: Uuid;
  parentExperimentId?: Uuid;
  researchSpecRevisionId: Uuid;
  label: string;
  relation: ExperimentRelation;
  reasonForChange?: string;
  parameterSet: CanonicalExperimentParameterSetV1;
  parameterSetHash: ContentHash;
  parentDelta?: CanonicalExperimentDeltaV1;
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

Experiment is immutable. Modification creates another Experiment.

---

## 8. ExperimentPlan

```ts
interface ExperimentPlanV1 {
  schemaVersion: "EXPERIMENT_PLAN_V1";
  experimentPlanId: Uuid;
  investigationId: Uuid;
  researchSpecRevisionId: Uuid;
  version: number;
  experimentIds: Uuid[];
  comparisonGroups: Uuid[][];
  sensitivityExperimentIds: Uuid[];
  requiredDataRequirements: DataRequirementV1[];
  computeBudget?: ComputeBudgetV1;
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

---

## 9. DatasetSeriesRef

```ts
type DatasetQualityState =
  | "PASS"
  | "PASS_WITH_WARNINGS"
  | "DEGRADED"
  | "FAIL";

interface DatasetSeriesRefV1 {
  schemaVersion: "DATASET_SERIES_REF_V1";
  seriesRefId: Uuid;
  canonicalSeriesId: string;
  seriesKind: string;
  instrumentId?: string;
  conceptId?: string;
  sourceId: string;
  sourceReference: string;
  vendorId?: string;
  sourceVersion?: string;
  nativeCurrency?: string;
  frequency: DataFrequencyV1;
  timezone: string;
  coverageStart: CanonicalTimestamp;
  coverageEnd: CanonicalTimestamp;
  observedAt?: CanonicalTimestamp;
  retrievedAt: CanonicalTimestamp;
  asOf: CanonicalTimestamp;
  valueOrigin: "REAL" | "ESTIMATED" | "SIMULATED" | "UNAVAILABLE";
  freshness: "FRESH" | "STALE" | "UNKNOWN" | "NOT_APPLICABLE";
  context: "PRODUCTION" | "DEMO";
  adjustmentMethodologyVersion?: string;
  dividendMethodologyVersion?: string;
  corporateActionMethodologyVersion?: string;
  pointInTimeMethodologyVersion?: string;
  missingDataPolicyVersion: string;
  proxyResolutionId?: Uuid;
  proxyChain: ProxyChainNodeV1[];
  qualityFlags: string[];
  lineageId: string;
  contentHash: ContentHash;
}
```

If `valueOrigin=UNAVAILABLE`, the series cannot contain invented numeric observations.

---

## 10. DatasetSnapshot

```ts
interface DatasetSnapshotV1 {
  schemaVersion: "DATASET_SNAPSHOT_V1";
  datasetSnapshotId: Uuid;
  series: DatasetSeriesRefV1[];
  startDate: CanonicalDate;
  endDate: CanonicalDate;
  frequency: DataFrequencyV1;
  adjustmentPolicyVersion: string;
  dividendPolicyVersion: string;
  corporateActionPolicyVersion: string;
  missingDataPolicyVersion: string;
  fxMethodVersion?: string;
  qualityReportId: Uuid;
  qualityState: DatasetQualityState;
  snapshotHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

`series` canonical hash order is by `canonicalSeriesId`, then `seriesRefId` as tie-breaker.

---

## 11. AccountResearchContextSnapshot

```ts
interface AccountResearchContextSnapshotV1 {
  schemaVersion: "ACCOUNT_RESEARCH_CONTEXT_SNAPSHOT_V1";
  accountResearchContextSnapshotId: Uuid;
  investigationId: Uuid;
  tenantId: Uuid;
  accountId: Uuid;
  asOf: CanonicalTimestamp;
  projectionMethodologyVersion: string;
  sourceRefs: AccountResearchSourceRefV1[];
  values: AccountResearchValueV1[];
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

This is a research projection only. Every value preserves source reference and truth dimensions. No client-supplied balance/position becomes canonical through this type.

---

## 12. Run

```ts
type RunTypeV1 =
  | "HISTORICAL_BACKTEST"
  | "SIMULATION"
  | "SENSITIVITY"
  | "REPRODUCIBILITY_CHECK";

type RunStatusV1 =
  | "QUEUED"
  | "RUNNING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED"
  | "CANCEL_REQUESTED"
  | "CANCELLED";

interface RunV1 {
  schemaVersion: "RUN_V1";
  runId: Uuid;
  investigationId: Uuid;
  experimentId: Uuid;
  researchSpecRevisionId: Uuid;
  datasetSnapshotId: Uuid;
  accountResearchContextSnapshotId?: Uuid;
  runType: RunTypeV1;
  status: RunStatusV1;
  engineId: string;
  engineVersion: string;
  metricRegistryVersion: string;
  policyVersion: string;
  executionConfigVersion: string;
  deterministicSeed?: string;
  canonicalRunInputHash: ContentHash;
  startedAt?: CanonicalTimestamp;
  completedAt?: CanonicalTimestamp;
  terminalErrorCode?: string;
  terminalErrorMetadata?: Record<string, unknown>;
  createdAt: CanonicalTimestamp;
}
```

A terminal Run's scientific input identity cannot change.

---

## 13. Result

```ts
type ResultQualityStateV1 =
  | "OK"
  | "PARTIAL"
  | "DEGRADED"
  | "INVALID";

type ScientificEvaluationOutcomeV1 =
  | "SUPPORTS_HYPOTHESIS"
  | "SCIENTIFIC_FAILURE"
  | "INCONCLUSIVE"
  | "NOT_EVALUATED";

interface ResultV1 {
  schemaVersion: "RESULT_V1";
  resultId: Uuid;
  runId: Uuid;
  metrics: MetricValueV1[];
  artifacts: EvidenceObjectRefV1[];
  warnings: ResultWarningV1[];
  qualityState: ResultQualityStateV1;
  scientificEvaluationOutcome: ScientificEvaluationOutcomeV1;
  resultHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

`SCIENTIFIC_FAILURE` is a valid scientific outcome, not a technical Run failure.

---

## 14. MetricValue

```ts
interface MetricValueV1 {
  metricId: string;
  metricVersion: string;
  availability: "AVAILABLE" | "UNAVAILABLE";
  canonicalValue?: CanonicalDecimal;
  unit?: string;
  valueOrigin: "REAL" | "ESTIMATED" | "SIMULATED" | "UNAVAILABLE";
  freshness: "FRESH" | "STALE" | "UNKNOWN" | "NOT_APPLICABLE";
  context: "PRODUCTION" | "DEMO";
  methodologyEvidenceRef: Uuid;
  warningCodes: string[];
}
```

`availability=UNAVAILABLE` => `canonicalValue` absent.

Backtest-derived performance metrics normally have `valueOrigin=SIMULATED` even when historical input prices have `valueOrigin=REAL`.

---

## 15. EvidenceObjectRef

```ts
type EvidenceObjectKindV1 =
  | "PORTFOLIO_VALUE_SERIES"
  | "TRADE_SIMULATION_SERIES"
  | "CASHFLOW_SERIES"
  | "DRAWDOWN_SERIES"
  | "BENCHMARK_SERIES"
  | "DIAGNOSTIC_SERIES"
  | "DISTRIBUTION"
  | "ENGINE_LOG_SUMMARY";

interface EvidenceObjectRefV1 {
  schemaVersion: "EVIDENCE_OBJECT_REF_V1";
  evidenceObjectId: Uuid;
  kind: EvidenceObjectKindV1;
  contentHash: ContentHash;
  hashVersion: "SYNTRAKE_SHA256_V1";
  format: string;
  artifactSchemaVersion: string;
  byteLength: number;
  storageLocator: string;
  compression?: string;
  createdAt: CanonicalTimestamp;
}
```

`storageLocator` is not authorization and is not scientific identity.

---

## 16. ResearchTemplateVersion

```ts
interface ResearchTemplateVersionV1 {
  schemaVersion: "RESEARCH_TEMPLATE_VERSION_V1";
  templateId: Uuid;
  templateVersion: number;
  title: string;
  methodologyId: string;
  methodologyVersion: string;
  allowedUniverseConstraints: string[];
  canonicalDefaultParameters: CanonicalExperimentParameterSetV1;
  assumptions: AssumptionSpecV1[];
  explanation: string;
  provenanceEvidenceRefs: Uuid[];
  compilerCompatibility: string[];
  ontologyCompatibility: string[];
  status: "ACTIVE" | "RETIRED";
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

Templates are starting points, not recommendations.

---

## 17. ResearchConversationState

```ts
interface ResearchConversationStateV1 {
  schemaVersion: "RESEARCH_CONVERSATION_STATE_V1";
  conversationId: string;
  actorSessionRef?: string;
  activeInvestigationId?: Uuid;
  activeResearchDraftRevisionId?: Uuid;
  activeResearchSpecRevisionId?: Uuid;
  activeExperimentId?: Uuid;
  activeStage?: ResearchStage;
  selectedObjectIds: Uuid[];
  pendingAmbiguityId?: Uuid;
  pendingConfirmationId?: Uuid;
  lastStructuredActionType?: string;
  updatedAt: CanonicalTimestamp;
}
```

This state is non-authoritative and disposable. Every selected object is re-authorized before use.

---

## 18. Research scientific event

```ts
interface ResearchScientificEventV1 {
  schemaVersion: "RESEARCH_SCIENTIFIC_EVENT_V1";
  eventId: Uuid;
  investigationId?: Uuid;
  eventType: string;
  objectType: string;
  objectId: string;
  predecessorObjectId?: string;
  resultingObjectIds: string[];
  correlationId: CorrelationId;
  auditEventId?: Uuid;
  eventPayloadVersion: string;
  eventPayload: Record<string, unknown>;
  recordedAt: CanonicalTimestamp;
}
```

`eventPayload` is versioned per event type and may not contain secrets/tokens. This scientific event does not replace the operational authority audit.

---

## 19. Typed command envelope

Every material application command has selectors/material inputs only plus idempotency/correlation. Authority is injected/resolved server-side, not accepted from client JSON.

Example:

```ts
interface RunExperimentCommandV1 {
  type: "RUN_EXPERIMENT";
  investigationId: Uuid;
  experimentId: Uuid;
  researchSpecRevisionId: Uuid;
  researchEnvironment: "HISTORICAL_BACKTEST" | "SIMULATION";
  idempotencyKey: IdempotencyKey;
  correlationId: CorrelationId;
}
```

Unexpected authority-shaped top-level fields fail validation.

---

## 20. Exact operation-scope invariants

```text
PURE_RESEARCH
  normal scope = TENANT_SCOPE
  tenant = REQUIRED
  account = ABSENT

TEST_PORTFOLIO
  normal scope = TENANT_SCOPE
  tenant = REQUIRED
  account = ABSENT

USER_PORTFOLIO
  scope = ACCOUNT_SCOPE
  tenant = REQUIRED and derived from canonical account
  account = REQUIRED

DOMAIN DATASET OPERATION
  scope = DOMAIN_SCOPE only when explicitly authorized
  tenant = ABSENT
  account = ABSENT
```

No source context can widen authority.

---

## 21. Current contract status

The object/type boundaries required for I5-A are now explicit enough for schema and runtime design audit, but remain `NOT FROZEN` until the IR/hash/metric/runtime contracts and contradiction audit are accepted.
