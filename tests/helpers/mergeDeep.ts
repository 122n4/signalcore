import type { DeepPartial } from "./deepPartial";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeDeep<T>(base: T, overrides: DeepPartial<T> = {} as DeepPartial<T>): T {
  if (overrides === undefined || overrides === null) return base;
  if (Array.isArray(base)) {
    return (Array.isArray(overrides) ? overrides : base) as T;
  }
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return overrides as T;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const key of Object.keys(overrides)) {
    const overrideValue = (overrides as Record<string, unknown>)[key];
    if (overrideValue === undefined) continue;

    const baseValue = (base as Record<string, unknown>)[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? mergeDeep(baseValue, overrideValue)
        : overrideValue;
  }

  return result as T;
}
