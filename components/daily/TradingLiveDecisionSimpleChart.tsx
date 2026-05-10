import type { TradingChartSnapshot, TradingLiveDecision } from "@/lib/trading/state";

type TradingLiveDecisionSimpleChartProps = {
  liveDecision: TradingLiveDecision;
  chart: TradingChartSnapshot | null | undefined;
  compact?: boolean;
};

function formatPrice(value: number | null | undefined, instrument?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  if (instrument?.includes("USD") && value < 10) {
    return value.toFixed(4);
  }

  if (value >= 1000) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function levelValues(liveDecision: TradingLiveDecision) {
  return [
    liveDecision.triggerLevel ?? null,
    liveDecision.entryZoneLow ?? null,
    liveDecision.entryZoneHigh ?? null,
    liveDecision.invalidationLevel ?? null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export default function TradingLiveDecisionSimpleChart({
  liveDecision,
  chart,
  compact = false,
}: TradingLiveDecisionSimpleChartProps) {
  const candles = chart?.candles.slice(-32) ?? [];
  const width = 640;
  const height = compact ? 300 : 320;
  const paddingX = 22;
  const paddingTop = compact ? 24 : 18;
  const paddingBottom = 26;

  if (!candles.length) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-slate-800 bg-[#08111f] text-sm text-slate-400 ${compact ? "min-h-[340px]" : "min-h-[320px]"}`}>
        No chart candles available for this snapshot.
      </div>
    );
  }

  const values = candles.flatMap((candle) => [candle.low, candle.high]);
  values.push(...levelValues(liveDecision));

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 0.0001);
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;
  const candleWidth = innerWidth / candles.length;

  const toX = (index: number) => paddingX + candleWidth * index + candleWidth / 2;
  const toY = (value: number) =>
    paddingTop + ((maxValue - value) / range) * innerHeight;

  const entryLow =
    typeof liveDecision.entryZoneLow === "number" && Number.isFinite(liveDecision.entryZoneLow)
      ? liveDecision.entryZoneLow
      : null;
  const entryHigh =
    typeof liveDecision.entryZoneHigh === "number" && Number.isFinite(liveDecision.entryZoneHigh)
      ? liveDecision.entryZoneHigh
      : null;
  const trigger =
    typeof liveDecision.triggerLevel === "number" && Number.isFinite(liveDecision.triggerLevel)
      ? liveDecision.triggerLevel
      : null;
  const invalidation =
    typeof liveDecision.invalidationLevel === "number" &&
    Number.isFinite(liveDecision.invalidationLevel)
      ? liveDecision.invalidationLevel
      : null;

  return (
    <div className={`space-y-3 rounded-2xl border border-slate-800 bg-[#08111f] text-slate-100 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`font-semibold uppercase tracking-[0.24em] text-slate-400 ${compact ? "text-[10px]" : "text-xs"}`}>
            {compact ? "Chart + trigger" : "Live Chart"}
          </div>
          <div className={`mt-1 font-semibold text-white ${compact ? "text-sm" : "text-lg"}`}>
            {chart?.instrument ?? liveDecision.instrument ?? "Trading Snapshot"}
          </div>
        </div>
        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          {chart?.timeframe ?? "--"}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${compact ? "h-[300px]" : "h-[320px]"} w-full rounded-xl bg-[radial-gradient(circle_at_top_left,rgba(17,34,63,0.55),rgba(8,17,31,0.96))]`}
        role="img"
        aria-label="Trading live chart"
      >
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {entryLow != null && entryHigh != null ? (
          <rect
            x={paddingX}
            y={toY(Math.max(entryLow, entryHigh))}
            width={innerWidth}
            height={Math.max(4, Math.abs(toY(entryLow) - toY(entryHigh)))}
            fill="rgba(34,197,94,0.12)"
            stroke="rgba(34,197,94,0.28)"
            strokeDasharray="4 4"
          />
        ) : null}

        {trigger != null ? (
          <line
            x1={paddingX}
            x2={width - paddingX}
            y1={toY(trigger)}
            y2={toY(trigger)}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
        ) : null}

        {invalidation != null ? (
          <line
            x1={paddingX}
            x2={width - paddingX}
            y1={toY(invalidation)}
            y2={toY(invalidation)}
            stroke="#fb7185"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        ) : null}

        {candles.map((candle, index) => {
          const x = toX(index);
          const bodyTop = toY(Math.max(candle.open, candle.close));
          const bodyBottom = toY(Math.min(candle.open, candle.close));
          const bullish = candle.close >= candle.open;

          return (
            <g key={`${candle.timestamp}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={toY(candle.high)}
                y2={toY(candle.low)}
                stroke={bullish ? "#60a5fa" : "#f97316"}
                strokeWidth="1.2"
              />
              <rect
                x={x - Math.max(2, candleWidth * 0.28)}
                y={Math.min(bodyTop, bodyBottom)}
                width={Math.max(4, candleWidth * 0.56)}
                height={Math.max(2, Math.abs(bodyBottom - bodyTop))}
                fill={bullish ? "rgba(96,165,250,0.72)" : "rgba(249,115,22,0.72)"}
                rx="1.5"
              />
            </g>
          );
        })}

        {trigger != null ? (
          <text x={paddingX + 8} y={22} fill="#7dd3fc" fontSize="12">
            Trigger {formatPrice(trigger, liveDecision.instrument)}
          </text>
        ) : (
          <text x={paddingX + 8} y={22} fill="#fbbf24" fontSize="12">
            No qualified trigger yet
          </text>
        )}
        {invalidation != null ? (
          <text x={paddingX + 8} y={38} fill="#fb7185" fontSize="12">
            Invalidation {formatPrice(invalidation, liveDecision.instrument)}
          </text>
        ) : null}
      </svg>

      <div className={`flex flex-wrap gap-2 ${compact ? "text-[11px]" : "text-xs"}`}>
        <div className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
          {entryLow != null && entryHigh != null
            ? `Entry ${formatPrice(entryLow, liveDecision.instrument)} - ${formatPrice(
                entryHigh,
                liveDecision.instrument,
              )}`
            : "Entry zone pending"}
        </div>
        <div className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">
          Target {liveDecision.targetZone ?? "--"}
        </div>
      </div>
    </div>
  );
}
