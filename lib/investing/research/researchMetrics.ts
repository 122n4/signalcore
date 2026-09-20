import { addRationalV1, compareRationalV1, divideRationalV1, integerToRationalV1, subtractRationalV1, type ExactRationalV1, renderRatioOutputV1 } from "./exactRational";
import type { CanonicalJsonValue } from "./canonical";

export type ValuationRecordV1 = Readonly<{
  sessionDate: string;
  cash: string;
  marketValue: string;
  nav: string;
  navExact: ExactRationalV1;
}>;

export function metricResultRecordsV1(valuations: readonly ValuationRecordV1[]): readonly CanonicalJsonValue[] {
  if (valuations.length < 1) throw new Error("NO_VALUATIONS");
  const starting = valuations[0]!.navExact;
  const ending = valuations[valuations.length - 1]!.navExact;
  const totalReturn = subtractRationalV1(divideRationalV1(ending, starting), integerToRationalV1(1n));
  let peak = starting;
  let maxDrawdown = integerToRationalV1(0n);
  for (const valuation of valuations) {
    if (compareRationalV1(valuation.navExact, peak) > 0) peak = valuation.navExact;
    const drawdown = divideRationalV1(subtractRationalV1(peak, valuation.navExact), peak);
    if (compareRationalV1(drawdown, maxDrawdown) > 0) maxDrawdown = drawdown;
  }
  return [
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1", value: renderRatioOutputV1(maxDrawdown) },
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1", value: renderRatioOutputV1(totalReturn) },
  ];
}

export function sumRationalsV1(values: readonly ExactRationalV1[]): ExactRationalV1 {
  return values.reduce((total, value) => addRationalV1(total, value), integerToRationalV1(0n));
}
