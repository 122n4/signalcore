import "server-only";

import type { ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import { OneShotAcquisitionWorker } from "./executor.server";
import { PostgresAcquisitionOrchestrationRepository } from "./postgresRepository.server";

export function createAcquisitionOrchestrationV1(dependencies: Readonly<{
  database: ScopedSqlPool;
  emit?: (event: Readonly<Record<string, unknown>>) => void;
}>) {
  if (!dependencies || typeof dependencies.database?.connect !== "function") {
    throw new Error("acquisition_orchestration_composition_invalid");
  }
  const repository = new PostgresAcquisitionOrchestrationRepository(
    dependencies.database,
  );
  return {
    repository,
    worker: new OneShotAcquisitionWorker(repository, dependencies.emit),
  } as const;
}
