import type { NormalizedCandle } from "@/lib/trading/data";
import type { TradingChartSnapshot, TradingLiveDecision } from "@/lib/trading/state";

type TradingLiveDecisionSimpleChartProps = {
  liveDecision: TradingLiveDecision;
  chart: TradingChartSnapshot | null | undefined;
  compact?: boolean;
};

type ChartLevel = {
  key: string;
  label: string;
  value: number;
  color: string;
  fill?: string;
  dash?: string;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatPrice(value: number | null | undefined, instrument?: string) {
  if (!isFiniteNumber(value)) {
    return "--";
  }

  if (instrument?.includes("USD") && Math.abs(value) < 10) {
    return value.toFixed(4);
  }

  if (Math.abs(value) >= 1000) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function formatChange(value: number | null) {
  if (!isFiniteNumber(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function levelValues(liveDecision: TradingLiveDecision) {
  return [
    liveDecision.triggerLevel ?? null,
    liveDecision.entryZoneLow ?? null,
    liveDecision.entryZoneHigh ?? null,
    liveDecision.invalidationLevel ?? null,
  ].filter(isFiniteNumber);
}

function buildLinePath(candles: NormalizedCandle[], toX: (index: number) => number, toY: (value: number) => number) {
  return candles
    .map((candle, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(2)} ${toY(candle.close).toFixed(2)}`)
    .join(" ");
}

function buildAreaPath(
  candles: NormalizedCandle[],
  toX: (index: number) => number,
  toY: (value: number) => number,
  bottomY: number,
) {
  if (!candles.length) return "";
  const line = buildLinePath(candles, toX, toY);
  return `${line} L ${toX(candles.length - 1).toFixed(2)} ${bottomY.toFixed(2)} L ${toX(0).toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

export default function TradingLiveDecisionSimpleChart({
  liveDecision,
  chart,
  compact = false,
}: TradingLiveDecisionSimpleChartProps) {
  const candles = chart?.candles.slice(compact ? -42 : -56) ?? [];
  const latest = candles.at(-1) ?? null;
  const previous = candles.at(-2) ?? null;
  const width = 720;
  const height = compact ? 340 : 360;
  const paddingLeft = 34;
  const paddingRight = 64;
  const paddingTop = compact ? 34 : 38;
  const paddingBottom = 46;

  if (!candles.length) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),rgba(8,17,31,0.98))] p-5 text-slate-300 ${compact ? "min-h-[340px]" : "min-h-[320px]"}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Live market chart
        </div>
        <div className="mt-3 text-lg font-semibold text-white">
          {chart?.instrument ?? liveDecision.instrument ?? "Trading Snapshot"}
        </div>
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100/82">
          No market candles are available for this snapshot yet. Syntrake should keep execution locked
          until the provider returns real candles again.
        </div>
      </div>
    );
  }

  const latestPrice = latest?.close ?? null;
  const previousClose = previous?.close ?? null;
  const changePct =
    isFiniteNumber(latestPrice) && isFiniteNumber(previousClose) && previousClose !== 0
      ? ((latestPrice - previousClose) / previousClose) * 100
      : null;
  const isUp = (changePct ?? 0) >= 0;
  const visibleHigh = Math.max(...candles.map((candle) => candle.high));
  const visibleLow = Math.min(...candles.map((candle) => candle.low));
  const values = candles.flatMap((candle) => [candle.low, candle.high]);
  values.push(...levelValues(liveDecision));

  if (isFiniteNumber(latestPrice)) {
    values.push(latestPrice);
  }

  const rawMinValue = Math.min(...values);
  const rawMaxValue = Math.max(...values);
  const rawRange = Math.max(rawMaxValue - rawMinValue, 0.0001);
  const minValue = rawMinValue - rawRange * 0.08;
  const maxValue = rawMaxValue + rawRange * 0.08;
  const range = Math.max(maxValue - minValue, 0.0001);
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;
  const candleWidth = innerWidth / candles.length;
  const toX = (index: number) => paddingLeft + candleWidth * index + candleWidth / 2;
  const toY = (value: number) => paddingTop + ((maxValue - value) / range) * innerHeight;
  const entryLow = isFiniteNumber(liveDecision.entryZoneLow) ? liveDecision.entryZoneLow : null;
  const entryHigh = isFiniteNumber(liveDecision.entryZoneHigh) ? liveDecision.entryZoneHigh : null;
  const trigger = isFiniteNumber(liveDecision.triggerLevel) ? liveDecision.triggerLevel : null;
  const invalidation = isFiniteNumber(liveDecision.invalidationLevel) ? liveDecision.invalidationLevel : null;
  const rawLevels: Array<ChartLevel | null> = [
    trigger == null
      ? null
      : {
          key: "trigger",
          label: "Trigger",
          value: trigger,
          color: "#38bdf8",
          dash: "7 5",
        },
    invalidation == null
      ? null
      : {
          key: "invalidation",
          label: "Invalidation",
          value: invalidation,
          color: "#fb7185",
          dash: "6 5",
        },
    latestPrice == null
      ? null
      : {
          key: "last",
          label: "Last",
          value: latestPrice,
          color: isUp ? "#34d399" : "#fb923c",
        },
  ];
  const levels = rawLevels.filter((level): level is ChartLevel => Boolean(level));
  const gridValues = [maxValue, maxValue - range * 0.25, maxValue - range * 0.5, maxValue - range * 0.75, minValue];
  const closePath = buildLinePath(candles, toX, toY);
  const areaPath = buildAreaPath(candles, toX, toY, height - paddingBottom);
  const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume ?? 0));

  return (
    <div className={`space-y-3 rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(9,20,36,0.98),rgba(5,12,22,0.98))] text-slate-100 shadow-[0_22px_80px_rgba(0,0,0,0.28)] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`font-semibold uppercase tracking-[0.24em] text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>
            Live market chart
          </div>
          <div className={`mt-1 font-semibold text-white ${compact ? "text-base" : "text-xl"}`}>
            {chart?.instrument ?? liveDecision.instrument ?? "Trading Snapshot"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {chart?.timeframe ?? "--"} candles · updated {formatTime(chart?.snapshotAt)}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${compact ? "text-xl" : "text-2xl"} ${isUp ? "text-emerald-200" : "text-orange-200"}`}>
            {formatPrice(latestPrice, chart?.instrument ?? liveDecision.instrument)}
          </div>
          <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isUp ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-orange-400/30 bg-orange-400/10 text-orange-200"}`}>
            {formatChange(changePct)} last candle
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${compact ? "h-[340px]" : "h-[360px]"} w-full rounded-xl bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),rgba(8,17,31,0.98))]`}
        role="img"
        aria-label="Live trading market chart"
      >
        <defs>
          <linearGradient id="syntrake-chart-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.24)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.01)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {gridValues.map((value, index) => {
          const y = toY(value);
          return (
            <g key={`grid-${index}`}>
              <line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              <text x={width - paddingRight + 10} y={y + 4} fill="rgba(203,213,225,0.58)" fontSize="11">
                {formatPrice(value, chart?.instrument ?? liveDecision.instrument)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#syntrake-chart-area)" />
        <path d={closePath} fill="none" stroke="rgba(125,211,252,0.65)" strokeWidth="1.6" />

        {entryLow != null && entryHigh != null ? (
          <rect
            x={paddingLeft}
            y={toY(Math.max(entryLow, entryHigh))}
            width={innerWidth}
            height={Math.max(5, Math.abs(toY(entryLow) - toY(entryHigh)))}
            fill="rgba(34,197,94,0.1)"
            stroke="rgba(34,197,94,0.26)"
            strokeDasharray="4 4"
          />
        ) : null}

        {candles.map((candle, index) => {
          const x = toX(index);
          const bodyTop = toY(Math.max(candle.open, candle.close));
          const bodyBottom = toY(Math.min(candle.open, candle.close));
          const bullish = candle.close >= candle.open;
          const volumeHeight = Math.max(2, ((candle.volume ?? 0) / maxVolume) * 26);

          return (
            <g key={`${candle.timestamp}-${index}`}>
              <rect
                x={x - Math.max(1, candleWidth * 0.3)}
                y={height - paddingBottom + 30 - volumeHeight}
                width={Math.max(2, candleWidth * 0.6)}
                height={volumeHeight}
                fill={bullish ? "rgba(52,211,153,0.16)" : "rgba(251,146,60,0.16)"}
                rx="1"
              />
              <line
                x1={x}
                x2={x}
                y1={toY(candle.high)}
                y2={toY(candle.low)}
                stroke={bullish ? "#60a5fa" : "#f97316"}
                strokeWidth="1.15"
              />
              <rect
                x={x - Math.max(2, candleWidth * 0.28)}
                y={Math.min(bodyTop, bodyBottom)}
                width={Math.max(3.5, candleWidth * 0.56)}
                height={Math.max(2, Math.abs(bodyBottom - bodyTop))}
                fill={bullish ? "rgba(96,165,250,0.78)" : "rgba(249,115,22,0.78)"}
                rx="1.5"
              />
            </g>
          );
        })}

        {levels.map((level) => {
          const y = toY(level.value);
          return (
            <g key={level.key}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={y}
                y2={y}
                stroke={level.color}
                strokeWidth={level.key === "last" ? "1.8" : "1.35"}
                strokeDasharray={level.dash}
              />
              <rect x={width - paddingRight + 7} y={y - 11} width="54" height="20" rx="10" fill="rgba(2,6,23,0.9)" stroke={level.color} strokeOpacity="0.55" />
              <text x={width - paddingRight + 34} y={y + 4} fill={level.color} fontSize="10" fontWeight="700" textAnchor="middle">
                {formatPrice(level.value, chart?.instrument ?? liveDecision.instrument)}
              </text>
              <text x={paddingLeft + 8} y={y - 6} fill={level.color} fontSize="11" fontWeight="700">
                {level.label}
              </text>
            </g>
          );
        })}

        {latestPrice != null ? (
          <circle
            cx={toX(candles.length - 1)}
            cy={toY(latestPrice)}
            r="4.5"
            fill={isUp ? "#34d399" : "#fb923c"}
            stroke="#020617"
            strokeWidth="2"
          />
        ) : null}
      </svg>

      <div className={`grid gap-2 ${compact ? "grid-cols-2 text-[11px]" : "grid-cols-2 text-xs md:grid-cols-4"}`}>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-slate-500">Last OHLC</div>
          <div className="mt-1 font-semibold text-slate-200">
            O {formatPrice(latest?.open, chart?.instrument)} · H {formatPrice(latest?.high, chart?.instrument)} · L {formatPrice(latest?.low, chart?.instrument)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-slate-500">Visible range</div>
          <div className="mt-1 font-semibold text-slate-200">
            {formatPrice(visibleLow, chart?.instrument)} - {formatPrice(visibleHigh, chart?.instrument)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-slate-500">Entry zone</div>
          <div className="mt-1 font-semibold text-slate-200">
            {entryLow != null && entryHigh != null
              ? `${formatPrice(entryLow, liveDecision.instrument)} - ${formatPrice(entryHigh, liveDecision.instrument)}`
              : "Waiting for setup"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-slate-500">Target</div>
          <div className="mt-1 font-semibold text-slate-200">{liveDecision.targetZone ?? "Not active yet"}</div>
        </div>
      </div>
    </div>
  );
}
