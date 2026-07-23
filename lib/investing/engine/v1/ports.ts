import type {
  CanonicalInstrumentCatalogSnapshotV1,
  CanonicalInstrumentV1,
  CanonicalMandateV1,
  CanonicalMarketSnapshotV1,
} from "@/lib/investing/engine/v1/contracts";
import { assertCanonicalMarketSnapshotV1 } from "@/lib/investing/engine/v1/validation";

export interface InstrumentCatalogPort {
  readonly version: string;
  snapshot(): CanonicalInstrumentCatalogSnapshotV1;
  getBySymbols(symbols: readonly string[]): readonly CanonicalInstrumentV1[];
  listEligible(mandate: CanonicalMandateV1): readonly CanonicalInstrumentV1[];
}

export interface MarketSnapshotPort {
  getSnapshotById(snapshotId: string): Promise<CanonicalMarketSnapshotV1 | null>;
}

/** Read-only fixture adapter. It performs no provider or database access. */
export class FixtureMarketSnapshotPort implements MarketSnapshotPort {
  private readonly snapshots: ReadonlyMap<string, CanonicalMarketSnapshotV1>;

  constructor(snapshots: readonly CanonicalMarketSnapshotV1[]) {
    const entries = snapshots.map((snapshot) => {
      assertCanonicalMarketSnapshotV1(snapshot);
      return [snapshot.marketSnapshotId, snapshot] as const;
    });
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("investing_market_fixture_duplicate_snapshot_id");
    }
    this.snapshots = new Map(entries);
  }

  async getSnapshotById(snapshotId: string): Promise<CanonicalMarketSnapshotV1 | null> {
    return this.snapshots.get(snapshotId) ?? null;
  }
}
