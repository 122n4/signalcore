import type { InvestingEnginePersistenceInputV1 } from "@/lib/investing/engine/v1/persistence/contracts";
import { InvestingEnginePersistenceReaderV1 } from "@/lib/investing/engine/v1/persistence/reader";
import type { InvestingEnginePersistenceRepositoryPortV1 } from "@/lib/investing/engine/v1/persistence/repositoryPort";
import { InvestingEnginePersistenceVerifierV1 } from "@/lib/investing/engine/v1/persistence/verifier";
import { InvestingEnginePersistenceWriterV1 } from "@/lib/investing/engine/v1/persistence/writer";

export class InvestingEnginePersistenceServiceV1 {
  readonly verifier: InvestingEnginePersistenceVerifierV1;
  readonly writer: InvestingEnginePersistenceWriterV1;
  readonly reader: InvestingEnginePersistenceReaderV1;

  constructor(readonly repository: InvestingEnginePersistenceRepositoryPortV1) {
    this.verifier = new InvestingEnginePersistenceVerifierV1();
    this.writer = new InvestingEnginePersistenceWriterV1(repository, this.verifier);
    this.reader = new InvestingEnginePersistenceReaderV1(repository, this.verifier);
  }

  persist(input: InvestingEnginePersistenceInputV1) { return this.writer.persist(input); }
}
