function normalizeLeakKey(value: unknown) {
  const key = String(value || "").toLowerCase().trim();
  return key || null;
}

export function normalizeLeakFamily(value: unknown) {
  const key = normalizeLeakKey(value);
  if (!key) return null;

  if (key === "concentration_high" || key === "concentration_med") return "concentration";
  if (key === "pricing_stale_high" || key === "pricing_stale_med") return "pricing_stale";
  if (key === "cash_drag_high" || key === "cash_drag_med") return "cash_drag";
  if (
    key === "pricing_low" ||
    key === "valuation_zero" ||
    key === "pricing_missing" ||
    key === "valuation_missing"
  ) {
    return "data_quality";
  }

  return key;
}

export function isLeakResolved(args: { targetLeakKey: string | null | undefined; currentLeakKey: string | null | undefined }) {
  const targetFamily = normalizeLeakFamily(args.targetLeakKey);
  if (!targetFamily) return true;

  const currentFamily = normalizeLeakFamily(args.currentLeakKey);
  if (!currentFamily) return true;

  return currentFamily !== targetFamily;
}
