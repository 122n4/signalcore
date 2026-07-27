import "server-only";

import type { InvestingOpsResultV1 } from "@/lib/investing/ops";
import type {
  InvestingUiFailureKindV1,
  InvestingUiFailureV1,
  InvestingUiResultV1,
  InvestingUiRunDetailV1,
  InvestingUiRunsV1,
  InvestingUiDashboardV1,
} from "@/lib/investing/ui/contracts";
import {
  presentInvestingDashboard,
  presentInvestingRun,
} from "@/lib/investing/ui/presenter";
import {
  type InvestingUiRuntimeOptionsV1,
  withInvestingUiRuntimeV1,
} from "@/lib/investing/ui/server/runtime.server";
import {
  evaluateInvestingRolloutGateV1,
  type InvestingRolloutGateOverridesV1,
} from "@/lib/investing/rollout/gate.server";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;

const FAILURE_COPY: Readonly<Record<InvestingUiFailureKindV1, Omit<InvestingUiFailureV1, "kind">>> = {
  unauthorized: {
    title: "Acesso indisponível",
    description: "Não foi possível apresentar informação Investing para esta sessão.",
  },
  not_found: {
    title: "Run não disponível",
    description: "O run não existe ou não está acessível.",
  },
  invalid: {
    title: "Pedido inválido",
    description: "Não foi possível processar este pedido.",
  },
  unavailable: {
    title: "Informação indisponível",
    description: "Os dados Investing estão temporariamente indisponíveis.",
  },
};

function publicFailure(kind: InvestingUiFailureKindV1): InvestingUiFailureV1 {
  return { kind, ...FAILURE_COPY[kind] };
}

function fromOpsFailure(result: InvestingOpsResultV1<unknown>): InvestingUiFailureV1 {
  if (!("error" in result)) return publicFailure("unavailable");
  if (result.error.reasonCode === "identity_scope_not_authorized") {
    return publicFailure("unauthorized");
  }
  if (result.error.reasonCode === "ops_run_not_found") {
    return publicFailure("not_found");
  }
  if (result.error.reasonCode === "ops_invalid_request") {
    return publicFailure("invalid");
  }
  return publicFailure("unavailable");
}

export type InvestingUiLoaderOptionsV1 = InvestingUiRuntimeOptionsV1 & Readonly<{
  rollout?: InvestingRolloutGateOverridesV1;
}>;

function splitLoaderOptions(options: InvestingUiLoaderOptionsV1): Readonly<{
  rollout: InvestingRolloutGateOverridesV1;
  runtime: InvestingUiRuntimeOptionsV1;
}> {
  const { rollout = {}, ...runtime } = options;
  return {
    rollout: {
      ...rollout,
      readUser: rollout.readUser ?? runtime.readUser,
    },
    runtime,
  };
}

async function withInvestingRolloutV1<T>(
  options: InvestingUiLoaderOptionsV1,
  load: (runtime: InvestingUiRuntimeOptionsV1) => Promise<T>,
): Promise<T | InvestingUiFailureV1> {
  const split = splitLoaderOptions(options);
  const gate = await evaluateInvestingRolloutGateV1(split.rollout);
  return gate.allowed
    ? load(split.runtime)
    : publicFailure("unauthorized");
}

async function loadInvestingDashboardWithOptionsV1(
  options: InvestingUiLoaderOptionsV1 = {},
): Promise<InvestingUiResultV1<InvestingUiDashboardV1>> {
  try {
    return await withInvestingRolloutV1(options, (runtime) =>
      withInvestingUiRuntimeV1(async ({ service }) => {
        const result = await service.snapshot({});
        return result.ok ? presentInvestingDashboard(result.value) : fromOpsFailure(result);
      }, runtime));
  } catch {
    return publicFailure("unavailable");
  }
}

async function loadInvestingRunsWithOptionsV1(
  options: InvestingUiLoaderOptionsV1 = {},
): Promise<InvestingUiResultV1<InvestingUiRunsV1>> {
  try {
    return await withInvestingRolloutV1(options, (runtime) =>
      withInvestingUiRuntimeV1(async ({ service }) => {
        const result = await service.listRuns({ limit: 50 });
        return result.ok
          ? {
              kind: "ready" as const,
              generatedAt: investingGeneratedAt(result.value.generatedAt),
              runs: result.value.runs.map(presentInvestingRun),
            }
          : fromOpsFailure(result);
      }, runtime));
  } catch {
    return publicFailure("unavailable");
  }
}

async function loadInvestingRunWithOptionsV1(
  runId: unknown,
  options: InvestingUiLoaderOptionsV1 = {},
): Promise<InvestingUiResultV1<InvestingUiRunDetailV1>> {
  try {
    return await withInvestingRolloutV1(options, (runtime) => {
      if (typeof runId !== "string" || !RUN_ID.test(runId)) {
        return Promise.resolve(publicFailure("invalid"));
      }
      return withInvestingUiRuntimeV1(async ({ service }) => {
        const result = await service.getRun({ runId });
        return result.ok
          ? {
              kind: "ready" as const,
              generatedAt: investingGeneratedAt(result.value.generatedAt),
              run: presentInvestingRun(result.value.run),
            }
          : fromOpsFailure(result);
      }, runtime);
    });
  } catch {
    return publicFailure("unavailable");
  }
}

export type InvestingUiServerLoadersV1 = Readonly<{
  loadDashboard(): Promise<InvestingUiResultV1<InvestingUiDashboardV1>>;
  loadRuns(): Promise<InvestingUiResultV1<InvestingUiRunsV1>>;
  loadRun(runId: unknown): Promise<InvestingUiResultV1<InvestingUiRunDetailV1>>;
}>;

export function createInvestingUiServerLoadersV1(
  options: InvestingUiLoaderOptionsV1 = {},
): InvestingUiServerLoadersV1 {
  return {
    loadDashboard: () => loadInvestingDashboardWithOptionsV1(options),
    loadRuns: () => loadInvestingRunsWithOptionsV1(options),
    loadRun: (runId) => loadInvestingRunWithOptionsV1(runId, options),
  };
}

const productionLoaders = createInvestingUiServerLoadersV1();

export function loadInvestingDashboardV1() {
  return productionLoaders.loadDashboard();
}

export function loadInvestingRunsV1() {
  return productionLoaders.loadRuns();
}

export function loadInvestingRunV1(runId: unknown) {
  return productionLoaders.loadRun(runId);
}

function investingGeneratedAt(value: string): string {
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("pt-PT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Indisponível";
}
