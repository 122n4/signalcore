export type WealthScenario = {
  label: "Conservative" | "Base" | "Upside";
  annualReturnPct: number;
  finalValue: number;
  monthsToTarget: number | null;
};

export function futureValueWithMonthlyContrib(
  startingCapital: number,
  monthlyContribution: number,
  annualReturnPct: number,
  months: number
) {
  const p0 = Math.max(0, startingCapital);
  const c = Math.max(0, monthlyContribution);
  const m = Math.max(0, Math.floor(months));
  const rm = Math.max(-0.95, annualReturnPct / 100) / 12;
  if (m === 0) return p0;
  if (rm === 0) return p0 + c * m;

  const growth = Math.pow(1 + rm, m);
  return p0 * growth + c * ((growth - 1) / rm);
}

export function monthsToReachTarget(
  startingCapital: number,
  monthlyContribution: number,
  annualReturnPct: number,
  targetCapital: number,
  maxMonths = 600
) {
  const target = Math.max(0, targetCapital);
  if (target <= Math.max(0, startingCapital)) return 0;

  for (let m = 1; m <= maxMonths; m += 1) {
    const value = futureValueWithMonthlyContrib(startingCapital, monthlyContribution, annualReturnPct, m);
    if (value >= target) return m;
  }

  return null;
}

export function requiredMonthlyContribution(
  startingCapital: number,
  annualReturnPct: number,
  months: number,
  targetCapital: number
) {
  const target = Math.max(0, targetCapital);
  if (target <= Math.max(0, startingCapital)) return 0;

  let low = 0;
  let high = Math.max(target, 1000);
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const fv = futureValueWithMonthlyContrib(startingCapital, mid, annualReturnPct, months);
    if (fv >= target) high = mid;
    else low = mid;
  }
  return Math.ceil(high);
}

export function scenarioAnnualReturns(base: number): WealthScenario["annualReturnPct"][] {
  const b = Math.max(-10, Math.min(30, base));
  return [Math.max(0, b - 3), b, Math.min(35, b + 3)];
}

export function buildScenarios(args: {
  startingCapital: number;
  monthlyContribution: number;
  targetCapital: number;
  horizonMonths: number;
  baseAnnualReturnPct: number;
}): WealthScenario[] {
  const [cons, base, up] = scenarioAnnualReturns(args.baseAnnualReturnPct);

  return [
    {
      label: "Conservative",
      annualReturnPct: cons,
      finalValue: futureValueWithMonthlyContrib(args.startingCapital, args.monthlyContribution, cons, args.horizonMonths),
      monthsToTarget: monthsToReachTarget(args.startingCapital, args.monthlyContribution, cons, args.targetCapital),
    },
    {
      label: "Base",
      annualReturnPct: base,
      finalValue: futureValueWithMonthlyContrib(args.startingCapital, args.monthlyContribution, base, args.horizonMonths),
      monthsToTarget: monthsToReachTarget(args.startingCapital, args.monthlyContribution, base, args.targetCapital),
    },
    {
      label: "Upside",
      annualReturnPct: up,
      finalValue: futureValueWithMonthlyContrib(args.startingCapital, args.monthlyContribution, up, args.horizonMonths),
      monthsToTarget: monthsToReachTarget(args.startingCapital, args.monthlyContribution, up, args.targetCapital),
    },
  ];
}
