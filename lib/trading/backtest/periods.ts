export type TradingHistoricalPeriod = {
  label: string;
  from: string;
  to: string;
};

export function createTradingHistoricalYearPeriods(args: {
  startYear: number;
  endYear: number;
}): TradingHistoricalPeriod[] {
  const periods: TradingHistoricalPeriod[] = [];

  for (let year = args.startYear; year <= args.endYear; year += 1) {
    periods.push({
      label: String(year),
      from: `${year}-01-01T00:00:00.000Z`,
      to: `${year}-12-31T23:59:59.000Z`,
    });
  }

  return periods;
}

export function createTradingHistoricalBlockPeriods(args: {
  from: string;
  to: string;
  blockMonths: number;
}): TradingHistoricalPeriod[] {
  const periods: TradingHistoricalPeriod[] = [];
  const start = new Date(args.from);
  const end = new Date(args.to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Trading historical block periods require valid ISO timestamps.");
  }

  if (start.getTime() >= end.getTime()) {
    throw new Error("Trading historical block periods require from < to.");
  }

  let cursor = new Date(start);
  let index = 1;

  while (cursor.getTime() < end.getTime()) {
    const blockStart = new Date(cursor);
    const blockEnd = new Date(cursor);
    blockEnd.setUTCMonth(blockEnd.getUTCMonth() + Math.max(1, args.blockMonths));
    blockEnd.setUTCMilliseconds(blockEnd.getUTCMilliseconds() - 1);

    const resolvedEnd = blockEnd.getTime() >= end.getTime() ? new Date(end) : blockEnd;

    periods.push({
      label: `block_${String(index).padStart(2, "0")}`,
      from: blockStart.toISOString(),
      to: resolvedEnd.toISOString(),
    });

    cursor = new Date(resolvedEnd.getTime() + 1);
    index += 1;
  }

  return periods;
}
