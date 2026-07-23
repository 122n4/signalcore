import type { InvestingEngineVerifiedLoadV1 } from "@/lib/investing/engine/v1/persistence/contracts";
import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";
import type {
  InvestingEngineFinalHashSelectorV1,
  InvestingEngineIdempotencySelectorV1,
  InvestingEngineLatestSelectorV1,
  InvestingEnginePersistenceReadPortV1,
  InvestingEngineRunScopeV1,
} from "@/lib/investing/engine/v1/persistence/repositoryPort";
import { InvestingEnginePersistenceVerifierV1 } from "@/lib/investing/engine/v1/persistence/verifier";

export class InvestingEnginePersistenceReaderV1 {
  constructor(
    private readonly repository: InvestingEnginePersistenceReadPortV1,
    private readonly verifier = new InvestingEnginePersistenceVerifierV1(),
  ) {}

  private async complete(run: Awaited<ReturnType<InvestingEnginePersistenceReadPortV1["findRunByScope"]>>): Promise<InvestingEngineVerifiedLoadV1> {
    if (!run) return persistenceError("persistence_not_found");
    return this.verifier.verifyLoaded(await this.repository.loadCompleteRun(run));
  }

  async loadByRunId(selector: InvestingEngineRunScopeV1) { return this.complete(await this.repository.findRunByScope(selector)); }
  async loadByIdempotency(selector: InvestingEngineIdempotencySelectorV1) { return this.complete(await this.repository.findRunByIdempotency(selector)); }
  async loadByFinalHash(selector: InvestingEngineFinalHashSelectorV1) { return this.complete(await this.repository.findRunByFinalHash(selector)); }
  async loadLatest(selector: InvestingEngineLatestSelectorV1) { return this.complete(await this.repository.findLatestRun(selector)); }
}
