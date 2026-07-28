import "server-only";
import type { InvestingResearchScientificScope } from "../contracts";
import { deriveDatasetRequirementIdentity, deriveDatasetVersionIdentity } from "../datasets/identity.server";
import {
  transitionAcquisitionState,
  validateAcquisitionOutcome,
  validateAcquisitionRequest,
  validateDatasetVersionMaterial,
  type AcquisitionOutcome,
  type AcquisitionState,
  type DatasetRequirementEnvelope,
  type DatasetResult,
  type DatasetVersionMaterial,
} from "../datasets";
import type { DatasetClockPort, DatasetEventSink } from "./events.server";
import type { AcquisitionAttemptRecord, DatasetCatalogRepository } from "./repository.server";

type DatasetOperation = "create_requirement" | "request_acquisition" | "get_acquisition"
  | "cancel_acquisition" | "transition_acquisition" | "publish_version"
  | "list_datasets" | "get_dataset_version";

export type DatasetAuthorization = Readonly<{
  authenticatedUserId: string;
  scope: InvestingResearchScientificScope;
}>;

export interface DatasetAuthorizationPort {
  authorize(input: unknown, operation: DatasetOperation): Promise<DatasetResult<DatasetAuthorization>>;
}

const sameScope = (left: InvestingResearchScientificScope, right: InvestingResearchScientificScope) =>
  left.tenantId === right.tenantId && left.ownerId === right.ownerId
  && left.portfolioId === right.portfolioId && left.accountId === right.accountId;

export class DatasetCatalogService {
  constructor(
    private readonly repository: DatasetCatalogRepository,
    private readonly events: DatasetEventSink,
    private readonly authorization: DatasetAuthorizationPort,
    private readonly clock: DatasetClockPort,
  ) {}

  private authorize(input: unknown, operation: DatasetOperation) {
    return this.authorization.authorize(input, operation);
  }

  async createRequirement(authInput: unknown, material: unknown, operational: Readonly<{ createdAt: string; correlationId: string }>): Promise<DatasetResult<DatasetRequirementEnvelope>> {
    const authorized = await this.authorize(authInput, "create_requirement");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const derived = deriveDatasetRequirementIdentity(material);
    if ("issues" in derived) return { ok: false, issues: derived.issues };
    const scope = authorized.value.scope;
    if (!sameScope(scope, derived.value.material.scientificScope)) return { ok: false, issues: [{ path: "requirement.scope", reasonCode: "dataset_scope_mismatch" }] };
    const envelope = { requirementId: derived.value.requirementId, material: derived.value.material, ...operational };
    const stored = await this.repository.createOrReuseRequirement(envelope);
    await this.events.emit({ type: stored.reused ? "requirement_reused" : "requirement_created", scope, aggregateId: envelope.requirementId, requirementId: envelope.requirementId, attempt: null, state: "requested", occurredAt: operational.createdAt, correlationId: operational.correlationId, provider: null, durationMs: null, reasonCode: null });
    return { ok: true, value: stored.value };
  }

  async requestAcquisition(authInput: unknown, input: unknown): Promise<DatasetResult<AcquisitionAttemptRecord>> {
    const authorized = await this.authorize(authInput, "request_acquisition");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const parsed = validateAcquisitionRequest(input);
    if ("issues" in parsed) return { ok: false, issues: parsed.issues };
    const scope = authorized.value.scope;
    if (!sameScope(scope, parsed.value.scope) || parsed.value.requestedBy !== authorized.value.authenticatedUserId) return { ok: false, issues: [{ path: "acquisition.scope", reasonCode: "dataset_scope_mismatch" }] };
    const stored = await this.repository.createOrReuseActiveAttempt({
      requirementId: parsed.value.requirementId,
      scope,
      idempotencyKey: parsed.value.idempotencyKey,
      state: "requested",
      stateVersion: 0,
      correlationId: parsed.value.correlationId,
      requestedBy: parsed.value.requestedBy,
      providerPreference: parsed.value.providerPreference,
      outcome: null,
    });
    await this.events.emit({ type: stored.reused ? "acquisition_reused" : "acquisition_requested", scope, aggregateId: stored.value.acquisitionJobId, requirementId: stored.value.requirementId, attempt: stored.value.attempt, state: stored.value.state, occurredAt: parsed.value.requestedAt, correlationId: parsed.value.correlationId, provider: parsed.value.providerPreference, durationMs: null, reasonCode: null });
    return { ok: true, value: stored.value };
  }

  async getAcquisitionState(authInput: unknown, acquisitionJobId: string): Promise<DatasetResult<AcquisitionAttemptRecord>> {
    const authorized = await this.authorize(authInput, "get_acquisition");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const value = await this.repository.getAttempt(authorized.value.scope, acquisitionJobId);
    return value ? { ok: true, value } : { ok: false, issues: [{ path: "acquisition", reasonCode: "dataset_scope_mismatch" }] };
  }

  async transition(authInput: unknown, input: Readonly<{ acquisitionJobId: string; expectedState: AcquisitionState; expectedStateVersion: number; nextState: AcquisitionState; outcome: AcquisitionOutcome | null }>): Promise<DatasetResult<AcquisitionAttemptRecord>> {
    const authorized = await this.authorize(authInput, "transition_acquisition");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const allowed = transitionAcquisitionState(input.expectedState, input.nextState);
    if ("issues" in allowed) return { ok: false, issues: allowed.issues };
    if (input.outcome !== null && !validateAcquisitionOutcome(input.outcome).ok) return { ok: false, issues: [{ path: "acquisition.outcome", reasonCode: "acquisition_request_invalid" }] };
    const updated = await this.repository.compareAndSetAttempt({ ...input, scope: authorized.value.scope });
    return updated ? { ok: true, value: updated } : { ok: false, issues: [{ path: "acquisition.stateVersion", reasonCode: "acquisition_transition_invalid" }] };
  }

  async cancelAcquisition(authInput: unknown, acquisitionJobId: string): Promise<DatasetResult<AcquisitionAttemptRecord>> {
    const authorized = await this.authorize(authInput, "cancel_acquisition");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const current = await this.repository.getAttempt(authorized.value.scope, acquisitionJobId);
    if (!current || !["requested", "acquiring"].includes(current.state)) return { ok: false, issues: [{ path: "acquisition.state", reasonCode: "acquisition_transition_invalid" }] };
    const started = this.clock.now();
    const updated = await this.repository.compareAndSetAttempt({
      scope: authorized.value.scope,
      acquisitionJobId,
      expectedState: current.state,
      expectedStateVersion: current.stateVersion,
      nextState: "cancelled",
      outcome: { kind: "cancelled", reasonCode: "acquisition_transition_invalid" },
    });
    if (!updated) return { ok: false, issues: [{ path: "acquisition.stateVersion", reasonCode: "acquisition_transition_invalid" }] };
    const completed = this.clock.now();
    await this.events.emit({
      type: "acquisition_cancelled",
      scope: authorized.value.scope,
      aggregateId: updated.acquisitionJobId,
      requirementId: updated.requirementId,
      attempt: updated.attempt,
      state: updated.state,
      occurredAt: completed.iso,
      correlationId: updated.correlationId,
      provider: updated.providerPreference,
      durationMs: Math.max(0, completed.monotonicMs - started.monotonicMs),
      reasonCode: "acquisition_transition_invalid",
    });
    return { ok: true, value: updated };
  }

  async publishVersion(authInput: unknown, material: unknown): Promise<DatasetResult<Readonly<{ datasetVersionId: string; reused: boolean }>>> {
    const authorized = await this.authorize(authInput, "publish_version");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const parsed = validateDatasetVersionMaterial(material);
    if ("issues" in parsed) return { ok: false, issues: parsed.issues };
    if (!sameScope(authorized.value.scope, parsed.value.scope)) return { ok: false, issues: [{ path: "datasetVersion.scope", reasonCode: "dataset_scope_mismatch" }] };
    const derived = deriveDatasetVersionIdentity(parsed.value);
    if ("issues" in derived) return { ok: false, issues: derived.issues };
    return { ok: true, value: await this.repository.publishOrReuseVersion({ datasetVersionId: derived.value.datasetVersionId, manifestHash: derived.value.manifestHash, material: parsed.value }) };
  }

  async listAuthorizedDatasets(authInput: unknown): Promise<DatasetResult<readonly DatasetVersionMaterial[]>> {
    const authorized = await this.authorize(authInput, "list_datasets");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    return { ok: true, value: await this.repository.listVersions(authorized.value.scope) };
  }

  async getAuthorizedDatasetVersion(authInput: unknown, datasetVersionId: string): Promise<DatasetResult<DatasetVersionMaterial>> {
    const authorized = await this.authorize(authInput, "get_dataset_version");
    if ("issues" in authorized) return { ok: false, issues: authorized.issues };
    const value = await this.repository.getVersion(authorized.value.scope, datasetVersionId);
    return value ? { ok: true, value } : { ok: false, issues: [{ path: "datasetVersion", reasonCode: "dataset_scope_mismatch" }] };
  }
}
