import type { EntryZoneOutput } from "./types";

export function roundLevel(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

export function formatZone(low: number | null, high: number | null): string | null {
  if (typeof low !== "number" || typeof high !== "number") {
    return null;
  }

  const orderedLow = Math.min(low, high);
  const orderedHigh = Math.max(low, high);

  return `${roundLevel(orderedLow)}-${roundLevel(orderedHigh)}`;
}

export function resolveRiskDistance(
  triggerLevel: number | null | undefined,
  invalidationLevel: number | null | undefined,
): number | null {
  if (typeof triggerLevel !== "number" || typeof invalidationLevel !== "number") {
    return null;
  }

  const distance = Math.abs(triggerLevel - invalidationLevel);

  return distance > 0 ? distance : null;
}

export function sortEntryZone(
  low: number | null,
  high: number | null,
): Pick<EntryZoneOutput, "entryZoneLow" | "entryZoneHigh"> {
  if (typeof low !== "number" || typeof high !== "number") {
    return {
      entryZoneLow: null,
      entryZoneHigh: null,
    };
  }

  return {
    entryZoneLow: roundLevel(Math.min(low, high)),
    entryZoneHigh: roundLevel(Math.max(low, high)),
  };
}
