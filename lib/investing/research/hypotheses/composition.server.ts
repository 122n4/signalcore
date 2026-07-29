import "server-only";
import {
  createInvestingIdentityScopeResolverV1,
  type InvestingAuthenticatedSessionPortV1,
  type InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/server";
import type { ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import type { HypothesisEventSink } from "./events.server";
import { PostgresHypothesisCandidateRepository } from "./postgresRepository.server";
import { HypothesisCandidateService, type HypothesisAuthorizationPort } from "./service.server";

const OPERATIONS = {
  create_hypothesis: "create_research_hypothesis",
  transition_hypothesis: "transition_research_hypothesis",
  get_hypothesis: "get_research_hypothesis",
  list_hypotheses: "list_research_hypotheses",
  create_candidate: "create_strategy_candidate",
  transition_candidate: "transition_strategy_candidate",
  get_candidate: "get_strategy_candidate",
  list_candidates: "list_strategy_candidates",
} as const;

export type HypothesisCompositionDependencies = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
  database: ScopedSqlPool;
  events: HypothesisEventSink;
}>;

export function createHypothesisCandidateServiceV1(
  dependencies: HypothesisCompositionDependencies,
) {
  if (!dependencies || typeof dependencies.session?.resolve !== "function"
    || typeof dependencies.directory?.findMemberships !== "function"
    || typeof dependencies.directory?.findPortfolios !== "function"
    || typeof dependencies.database?.connect !== "function"
    || typeof dependencies.events?.emit !== "function") {
    throw new Error("research_hypothesis_composition_dependency_unavailable");
  }
  const resolver = createInvestingIdentityScopeResolverV1(dependencies);
  const authorization: HypothesisAuthorizationPort = {
    async authorize(_input, operation) {
      try {
        const identity = await resolver.resolve(OPERATIONS[operation]);
        return { ok: true, value: { authenticatedUserId: identity.authenticatedUserId,
          scope: { tenantId: identity.tenantId,ownerId: identity.ownerId,
            portfolioId: identity.portfolioId,accountId: identity.accountId } } };
      } catch {
        return { ok: false, reason: "research_scope_not_authorized" };
      }
    },
  };
  return new HypothesisCandidateService(
    new PostgresHypothesisCandidateRepository(dependencies.database),
    authorization,dependencies.events,
  );
}
