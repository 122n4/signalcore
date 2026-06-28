import type { ResearchTaskScope } from "./types";

export function resolveEffectiveResearchInstruments(args: {
  scope: ResearchTaskScope;
  fallbackInstruments: string[];
}): string[] {
  const scopedInstruments = args.scope.instruments?.length
    ? args.scope.instruments
    : args.fallbackInstruments;

  return Array.from(
    new Set(
      scopedInstruments
        .map((instrument) => instrument.trim().toUpperCase())
        .filter((instrument) => instrument.length > 0),
    ),
  );
}

export function hasEffectiveResearchInstruments(args: {
  scope: ResearchTaskScope;
  fallbackInstruments: string[];
}): boolean {
  return resolveEffectiveResearchInstruments(args).length > 0;
}
