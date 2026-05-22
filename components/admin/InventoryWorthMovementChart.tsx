"use client";

import * as React from "react";

export type InventoryWorthMovementMetric = "retail" | "cost" | "profit" | "units";

export type InventoryWorthMovementPoint = {
  date: string;
  retail: number;
  cost: number;
  profit: number;
  units: number;
};

type InventoryWorthMovementChartProps = {
  from: string;
  to: string;
  loading?: boolean;
  metric: InventoryWorthMovementMetric;
  points: InventoryWorthMovementPoint[];
  onMetricChange: (metric: InventoryWorthMovementMetric) => void;
};

type MetricMeta = {
  key: InventoryWorthMovementMetric;
  label: string;
  stroke: string;
  fill: string;
  className: string;
};

const METRICS: MetricMeta[] = [
  {
    key: "retail",
    label: "Retail movement",
    stroke: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.18)",
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-100 hover:border-sky-400/50",
  },
  {
    key: "cost",
    label: "Cost movement",
    stroke: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.18)",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:border-amber-400/50",
  },
  {
    key: "profit",
    label: "Profit movement",
    stroke: "#34d399",
    fill: "rgba(52, 211, 153, 0.18)",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/50",
  },
  {
    key: "units",
    label: "Unit movement",
    stroke: "#a78bfa",
    fill: "rgba(167, 139, 250, 0.18)",
    className:
      "border-violet-500/30 bg-violet-500/10 text-violet-100 hover:border-violet-400/50",
  },
];

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetricValue(metric: InventoryWorthMovementMetric, value: number) {
  if (metric === "units") {
    return `${value > 0 ? "+" : value < 0 ? "" : ""}${Math.round(value)}`;
  }
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatPeso(Math.abs(value))}`;
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function buildTickIndexes(length: number) {
  if (length <= 1) return [0];
  const raw = new Set<number>([
    0,
    Math.round((length - 1) * 0.25),
    Math.round((length - 1) * 0.5),
    Math.round((length - 1) * 0.75),
    length - 1,
  ]);
  return Array.from(raw).sort((a, b) => a - b);
}

export function InventoryWorthMovementChart({
  from,
  to,
  loading = false,
  metric,
  points,
  onMetricChange,
}: InventoryWorthMovementChartProps) {
  const chartId = React.useId();
  const meta = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const values = points.map((point) => point[metric]);
  const minValue = values.length ? Math.min(...values, 0) : 0;
  const maxValue = values.length ? Math.max(...values, 0) : 0;
  const range = maxValue - minValue || 1;
  const width = 760;
  const height = 220;
  const paddingX = 18;
  const paddingY = 22;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingY * 2;

  const coordinates = points.map((point, index) => {
    const x =
      points.length <= 1
        ? paddingX + graphWidth / 2
        : paddingX + (index / (points.length - 1)) * graphWidth;
    const y =
      paddingY + ((maxValue - point[metric]) / range) * graphHeight;
    return { x, y, point };
  });

  const linePath = coordinates
    .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`)
    .join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates[coordinates.length - 1]?.x ?? 0} ${
        height - paddingY
      } L ${coordinates[0]?.x ?? 0} ${height - paddingY} Z`
    : "";
  const zeroY = paddingY + ((maxValue - 0) / range) * graphHeight;
  const tickIndexes = buildTickIndexes(points.length);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = values.length ? total / values.length : 0;
  const peak =
    coordinates.reduce<{ value: number; date: string } | null>((best, coord) => {
      if (!best || coord.point[metric] > best.value) {
        return { value: coord.point[metric], date: coord.point.date };
      }
      return best;
    }, null) ?? null;

  return (
    <div className="rounded-xl border border-white/10 bg-paper/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="font-semibold">Inventory worth movement</div>
          <div className="text-xs text-white/60">
            Net inventory value movement from {from} to {to}.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((item) => {
            const isActive = item.key === metric;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onMetricChange(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  isActive
                    ? `${item.className} shadow-[0_0_0_1px_rgba(255,255,255,0.06)]`
                    : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
          <div className="text-xs text-white/60">Net movement</div>
          <div className="text-lg font-semibold">{formatMetricValue(metric, total)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
          <div className="text-xs text-white/60">Average per day</div>
          <div className="text-lg font-semibold">{formatMetricValue(metric, average)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
          <div className="text-xs text-white/60">Highest day</div>
          <div className="text-lg font-semibold">
            {peak ? `${formatMetricValue(metric, peak.value)} | ${formatShortDate(peak.date)}` : "None"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-bg-950/40 p-3">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-white/60">
            Updating chart...
          </div>
        ) : !points.length ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-white/60">
            No movement found in this date range.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
            <defs>
              <linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta.fill} stopOpacity="0.95" />
                <stop offset="100%" stopColor={meta.fill} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            <line
              x1={paddingX}
              x2={width - paddingX}
              y1={zeroY}
              y2={zeroY}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="6 6"
            />

            <path d={areaPath} fill={`url(#${chartId}-fill)`} />
            <path
              d={linePath}
              fill="none"
              stroke={meta.stroke}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {coordinates.map((coord) => (
              <circle
                key={coord.point.date}
                cx={coord.x}
                cy={coord.y}
                r="3.5"
                fill={meta.stroke}
                stroke="rgba(15,23,42,0.95)"
                strokeWidth="1.5"
              />
            ))}

            {tickIndexes.map((index) => {
              const coord = coordinates[index];
              if (!coord) return null;
              return (
                <g key={coord.point.date}>
                  <line
                    x1={coord.x}
                    x2={coord.x}
                    y1={height - paddingY}
                    y2={height - paddingY + 6}
                    stroke="rgba(255,255,255,0.22)"
                  />
                  <text
                    x={coord.x}
                    y={height - 2}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(255,255,255,0.65)"
                  >
                    {formatShortDate(coord.point.date)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
