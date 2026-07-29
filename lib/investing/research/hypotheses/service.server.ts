import "server-only";
import {
  transitionResearchHypothesis,
  transitionStrategyCandidate,
  type InvestingResearchScientificScope,
} from "../contracts";
import type { HypothesisEventSink } from "./events.server";
import { deriveCandidateIdentity, deriveHypothesisIdentity, deriveVersionMaterialHash } from "./identity.server";
import type { HypothesisCandidateRepository } from "./repository.server";
import type {
  CandidateRecord,
  HypothesisRecord,
  HypothesisResult,
  Phase6HCandidateState,
  Phase6HHypothesisState,
} from "./types";

type Operation = "create_hypothesis" | "transition_hypothesis" | "get_hypothesis"
  | "list_hypotheses" | "create_candidate" | "transition_candidate"
  | "get_candidate" | "list_candidates";
export interface HypothesisAuthorizationPort {
  authorize(input: unknown, operation: Operation): Promise<HypothesisResult<Readonly<{
    authenticatedUserId: string; scope: InvestingResearchScientificScope;
  }>>>;
}
const time = (value: string) => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const transitionInput = (input: unknown, states: readonly string[]) => {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (keys.some((key) => typeof key !== "string")
      || keys.length !== 4
      || Object.values(descriptors).some((descriptor) =>
        descriptor.get !== undefined || descriptor.set !== undefined
        || descriptor.enumerable !== true)
      || !["hypothesisId","candidateId"].some((key) => descriptors[key] !== undefined)
      || !["expectedVersion","nextState","createdAt"].every((key) =>
        descriptors[key] !== undefined)) return null;
    const value = input as Record<string, unknown>;
    const id = typeof value.hypothesisId === "string"
      ? value.hypothesisId
      : value.candidateId;
    if (typeof id !== "string" || typeof value.expectedVersion !== "string"
      || !/^v[1-9][0-9]*$/u.test(value.expectedVersion)
      || typeof value.nextState !== "string" || !states.includes(value.nextState)
      || typeof value.createdAt !== "string" || !time(value.createdAt)) return null;
    return { id,expectedVersion: value.expectedVersion,nextState: value.nextState,
      createdAt: value.createdAt };
  } catch {
    return null;
  }
};

export class HypothesisCandidateService {
  constructor(
    private readonly repository: HypothesisCandidateRepository,
    private readonly authorization: HypothesisAuthorizationPort,
    private readonly events: HypothesisEventSink,
  ) {}
  async createHypothesis(auth: unknown, input: unknown, createdAt: string):
    Promise<HypothesisResult<HypothesisRecord>> {
    const allowed = await this.authorization.authorize(auth, "create_hypothesis");
    if ("reason" in allowed) return allowed;
    if (!time(createdAt)) return { ok: false, reason: "research_timestamp_invalid" };
    const identity = deriveHypothesisIdentity(input);
    if (!identity.ok || identity.value.value.state !== "draft"
      || identity.value.value.hypothesisVersion !== "v1"
      || identity.value.value.hypothesisId !== identity.value.id) {
      return { ok: false, reason: "research_hypothesis_identity_mismatch" };
    }
    const materialHash = deriveVersionMaterialHash(identity.value.value);
    if (materialHash === null) return { ok: false, reason: "research_hypothesis_invalid" };
    const stored = await this.repository.createOrReuseHypothesis({
      scope: allowed.value.scope, value: identity.value.value, materialHash, createdAt,
    });
    await this.events.emit({ type: stored.reused ? "research_hypothesis_reused" : "research_hypothesis_created",
      aggregateId: stored.value.value.hypothesisId, state: stored.value.value.state,
      occurredAt: createdAt });
    return { ok: true, value: stored.value };
  }
  async transitionHypothesis(auth: unknown, input: unknown):
    Promise<HypothesisResult<HypothesisRecord>> {
    const allowed = await this.authorization.authorize(auth, "transition_hypothesis");
    if ("reason" in allowed) return allowed;
    const parsed = transitionInput(input,["draft","active","retired"]);
    if (parsed === null || !("hypothesisId" in (input as object))) {
      return { ok: false, reason: "research_hypothesis_transition_invalid" };
    }
    const current = await this.repository.getHypothesis(
      allowed.value.scope,parsed.id,parsed.expectedVersion);
    if (current === null || !transitionResearchHypothesis(
      current.value.state,parsed.nextState as Phase6HHypothesisState).ok) {
      return { ok: false, reason: "research_hypothesis_transition_invalid" };
    }
    const stored = await this.repository.transitionHypothesis({
      scope: allowed.value.scope,hypothesisId: parsed.id,
      expectedVersion: parsed.expectedVersion,
      nextState: parsed.nextState as Phase6HHypothesisState,createdAt: parsed.createdAt,
    });
    if (stored === null) return { ok: false, reason: "research_hypothesis_transition_conflict" };
    await this.events.emit({ type: "research_hypothesis_transitioned",
      aggregateId: stored.value.hypothesisId, state: stored.value.state,
      occurredAt: parsed.createdAt });
    return { ok: true, value: stored };
  }
  async createCandidate(auth: unknown, input: unknown, createdAt: string):
    Promise<HypothesisResult<CandidateRecord>> {
    const allowed = await this.authorization.authorize(auth, "create_candidate");
    if ("reason" in allowed) return allowed;
    if (!time(createdAt)) return { ok: false, reason: "research_timestamp_invalid" };
    const identity = deriveCandidateIdentity(input);
    if (!identity.ok || identity.value.value.state !== "draft"
      || identity.value.value.candidateVersion !== "v1"
      || identity.value.value.candidateId !== identity.value.id) {
      return { ok: false, reason: "strategy_candidate_identity_mismatch" };
    }
    const value = identity.value.value;
    const hypothesis = await this.repository.getHypothesis(
      allowed.value.scope,value.hypothesisId);
    if (hypothesis === null || hypothesis.value.state !== "active"
      || hypothesis.value.hypothesisVersion !== value.hypothesisVersion) {
      return { ok: false, reason: "strategy_candidate_hypothesis_ineligible" };
    }
    if (value.generation.parentCandidateId === value.candidateId) {
      return { ok: false, reason: "strategy_candidate_parent_invalid" };
    }
    if (value.generation.parentCandidateId !== null
      && await this.repository.getCandidate(
        allowed.value.scope,value.generation.parentCandidateId) === null) {
      return { ok: false, reason: "strategy_candidate_parent_invalid" };
    }
    const materialHash = deriveVersionMaterialHash(value);
    if (materialHash === null) return { ok: false, reason: "strategy_candidate_invalid" };
    const stored = await this.repository.createOrReuseCandidate({
      scope: allowed.value.scope,value,materialHash,createdAt,
    });
    await this.events.emit({ type: stored.reused ? "strategy_candidate_reused" : "strategy_candidate_created",
      aggregateId: stored.value.value.candidateId,state: stored.value.value.state,
      occurredAt: createdAt });
    return { ok: true, value: stored.value };
  }
  async transitionCandidate(auth: unknown, input: unknown):
    Promise<HypothesisResult<CandidateRecord>> {
    const allowed = await this.authorization.authorize(auth, "transition_candidate");
    if ("reason" in allowed) return allowed;
    const parsed = transitionInput(input,["draft","ready","retired"]);
    if (parsed === null || !("candidateId" in (input as object))) {
      return { ok: false, reason: "strategy_candidate_transition_invalid" };
    }
    const current = await this.repository.getCandidate(
      allowed.value.scope,parsed.id,parsed.expectedVersion);
    if (current === null || !transitionStrategyCandidate(
      current.value.state,parsed.nextState as Phase6HCandidateState).ok) {
      return { ok: false, reason: "strategy_candidate_transition_invalid" };
    }
    const hypothesis = await this.repository.getHypothesis(
      allowed.value.scope,current.value.hypothesisId);
    const hypothesisEligible = hypothesis !== null && (
      parsed.nextState === "retired"
        ? hypothesis.value.state === "retired"
          || (hypothesis.value.state === "active"
            && hypothesis.value.hypothesisVersion === current.value.hypothesisVersion)
        : hypothesis.value.state === "active"
          && hypothesis.value.hypothesisVersion === current.value.hypothesisVersion
    );
    if (!hypothesisEligible) {
      return { ok: false, reason: "strategy_candidate_hypothesis_ineligible" };
    }
    const stored = await this.repository.transitionCandidate({
      scope: allowed.value.scope,candidateId: parsed.id,
      expectedVersion: parsed.expectedVersion,
      nextState: parsed.nextState as Phase6HCandidateState,createdAt: parsed.createdAt,
    });
    if (stored === null) return { ok: false, reason: "strategy_candidate_transition_conflict" };
    await this.events.emit({ type: "strategy_candidate_transitioned",
      aggregateId: stored.value.candidateId,state: stored.value.state,
      occurredAt: parsed.createdAt });
    return { ok: true, value: stored };
  }
  async getHypothesis(auth: unknown, id: string, version?: string) {
    const allowed = await this.authorization.authorize(auth, "get_hypothesis");
    if ("reason" in allowed) return allowed;
    const value = await this.repository.getHypothesis(allowed.value.scope,id,version);
    return value === null ? { ok: false as const, reason: "research_hypothesis_not_found" }
      : { ok: true as const,value };
  }
  async listHypotheses(auth: unknown) {
    const allowed = await this.authorization.authorize(auth, "list_hypotheses");
    return allowed.ok ? { ok: true as const,
      value: await this.repository.listHypotheses(allowed.value.scope) } : allowed;
  }
  async getCandidate(auth: unknown, id: string, version?: string) {
    const allowed = await this.authorization.authorize(auth, "get_candidate");
    if ("reason" in allowed) return allowed;
    const value = await this.repository.getCandidate(allowed.value.scope,id,version);
    return value === null ? { ok: false as const,reason: "strategy_candidate_not_found" }
      : { ok: true as const,value };
  }
  async listCandidates(auth: unknown) {
    const allowed = await this.authorization.authorize(auth, "list_candidates");
    return allowed.ok ? { ok: true as const,
      value: await this.repository.listCandidates(allowed.value.scope) } : allowed;
  }
}
