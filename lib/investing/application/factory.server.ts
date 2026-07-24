import "server-only";

import {
  InvestingApplicationBoundaryV1,
  type InvestingApplicationBoundaryDependenciesV1,
} from "@/lib/investing/application/boundary";
import { applicationError } from "@/lib/investing/application/errors";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationIntegrityGuardPortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import {
  InvestingEnginePersistenceServiceV1,
  InvestingEngineReplayServiceV1,
  type InvestingEnginePersistenceRepositoryPortV1,
  type PureInvestingEngineRunnerV1,
} from "@/lib/investing/engine/v1/persistence";

export type InvestingApplicationServerDependenciesV1 = Readonly<{
  repository: InvestingEnginePersistenceRepositoryPortV1;
  pureRunner: PureInvestingEngineRunnerV1;
  canonicalSource: InvestingApplicationCanonicalSourcePortV1;
  scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1;
  integrityGuard: InvestingApplicationIntegrityGuardPortV1;
}>;

function method(value: unknown, name: string) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>)[name] === "function",
  );
}

export function createInvestingApplicationBoundaryV1(
  dependencies: InvestingApplicationServerDependenciesV1,
): InvestingApplicationBoundaryV1 {
  if (
    !dependencies
    || !method(dependencies.repository, "beginTransaction")
    || !method(dependencies.repository, "findRunByScope")
    || typeof dependencies.pureRunner !== "function"
    || !method(dependencies.canonicalSource, "resolve")
    || !method(dependencies.scopeAuthorizer, "authorize")
    || !method(dependencies.integrityGuard, "inspect")
  ) {
    applicationError("internal_dependency_unavailable");
  }
  const persistence = new InvestingEnginePersistenceServiceV1(dependencies.repository);
  const composed: InvestingApplicationBoundaryDependenciesV1 = {
    persistence,
    replay: new InvestingEngineReplayServiceV1(
      persistence.reader,
      dependencies.pureRunner,
    ),
    canonicalSource: dependencies.canonicalSource,
    scopeAuthorizer: dependencies.scopeAuthorizer,
    integrityGuard: dependencies.integrityGuard,
  };
  return new InvestingApplicationBoundaryV1(composed);
}
