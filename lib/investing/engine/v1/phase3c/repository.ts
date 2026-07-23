import { deepFreezeCanonical } from "@/lib/investing/engine/v1/canonical";
import type { InvestingFinancialReadModelV1 } from "@/lib/investing/engine/v1/phase3c/types";

export interface InvestingCanonicalSourceRepositoryPortV1 {
  getFinancialReadModel(requestedUserId: string): Promise<InvestingFinancialReadModelV1 | null>;
}

/** Fixture-only repository. It has no database client and performs no runtime IO. */
export class InMemoryInvestingCanonicalSourceRepositoryV1
implements InvestingCanonicalSourceRepositoryPortV1 {
  private readonly sources: ReadonlyMap<string, InvestingFinancialReadModelV1>;

  constructor(sources: readonly InvestingFinancialReadModelV1[]) {
    const entries = sources.map((source) => [source.identity.requestedUserId, deepFreezeCanonical(source)] as const);
    if (new Set(entries.map(([userId]) => userId)).size !== entries.length) {
      throw new Error("investing_source_fixture_duplicate_user");
    }
    this.sources = new Map(entries);
  }

  async getFinancialReadModel(requestedUserId: string): Promise<InvestingFinancialReadModelV1 | null> {
    return this.sources.get(requestedUserId) ?? null;
  }
}
