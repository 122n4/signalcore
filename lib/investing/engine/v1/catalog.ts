import { canonicalDecimalFromFiniteNumberBoundary } from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInstrumentCatalogSnapshotV1,
  CanonicalInstrumentV1,
  CanonicalMandateV1,
} from "@/lib/investing/engine/v1/contracts";
import type { InstrumentCatalogPort } from "@/lib/investing/engine/v1/ports";
import { sealInstrumentCatalogSnapshotV1 } from "@/lib/investing/engine/v1/validation";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";

export const STATIC_PILOT_INVESTING_CATALOG_VERSION = "static-pilot-investing-catalog/v1" as const;

function buildPilotSnapshot(): CanonicalInstrumentCatalogSnapshotV1 {
  const instruments: CanonicalInstrumentV1[] = getCanonicalInvestingInstrumentMaster().map((instrument) => ({
    instrumentId: `pilot:${instrument.symbol}`,
    symbol: instrument.symbol,
    name: instrument.name,
    assetClass: instrument.assetClass,
    currency: String(instrument.currency || "EUR").toUpperCase(),
    enabled: instrument.enabled !== false,
    lotSize: canonicalDecimalFromFiniteNumberBoundary(1),
    minimumNotional: canonicalDecimalFromFiniteNumberBoundary(1),
    feeBps: canonicalDecimalFromFiniteNumberBoundary(Number(instrument.feeBps ?? 0)),
    qualityScore: canonicalDecimalFromFiniteNumberBoundary(Number(instrument.qualityScore ?? 0)),
  }));
  return sealInstrumentCatalogSnapshotV1({
    version: STATIC_PILOT_INVESTING_CATALOG_VERSION,
    instruments,
  });
}

export class StaticPilotInstrumentCatalogAdapter implements InstrumentCatalogPort {
  readonly version = STATIC_PILOT_INVESTING_CATALOG_VERSION;
  private readonly catalog = buildPilotSnapshot();

  snapshot() {
    return this.catalog;
  }

  getBySymbols(symbols: readonly string[]) {
    const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    return this.catalog.instruments.filter((instrument) => requested.has(instrument.symbol));
  }

  listEligible(mandate: CanonicalMandateV1) {
    return this.catalog.instruments.filter((instrument) => {
      if (!instrument.enabled) return false;
      if (instrument.assetClass === "commodity") {
        const blocked = mandate.constraints.some(
          (constraint) => constraint.id === "allows_gold" && constraint.status !== "pass",
        );
        return !blocked;
      }
      return true;
    });
  }
}

export function createStaticPilotInstrumentCatalogAdapter(): InstrumentCatalogPort {
  return new StaticPilotInstrumentCatalogAdapter();
}
