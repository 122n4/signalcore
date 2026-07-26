import "server-only";

import {
  createProductionInvestingOpsRuntimeV1,
  type ProductionInvestingOpsRuntimeOptionsV1,
  type ProductionInvestingOpsRuntimeV1,
} from "@/lib/investing/ops/infrastructure/factory.server";

export async function withInvestingUiRuntimeV1<T>(
  read: (runtime: ProductionInvestingOpsRuntimeV1) => Promise<T>,
  options: ProductionInvestingOpsRuntimeOptionsV1 = {},
): Promise<T> {
  const runtime = createProductionInvestingOpsRuntimeV1(options);
  try {
    return await read(runtime);
  } finally {
    await runtime.close();
  }
}

export type InvestingUiRuntimeOptionsV1 = ProductionInvestingOpsRuntimeOptionsV1;
