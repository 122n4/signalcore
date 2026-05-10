export function normalizeQuoteSource(source: unknown) {
  return String(source ?? "").trim().toLowerCase();
}

export function isReferenceOnlyQuoteSource(source: unknown) {
  const normalized = normalizeQuoteSource(source);
  if (!normalized) {
    return true;
  }

  return normalized.includes("fallback") || normalized.includes("reference");
}

export function isDirectProviderQuoteSource(source: unknown) {
  const normalized = normalizeQuoteSource(source);
  return normalized.length > 0 && !isReferenceOnlyQuoteSource(normalized);
}
