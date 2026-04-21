"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  LineChart,
  Minus,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type SalesTrendMetric =
  | "sales"
  | "orders"
  | "aov"
  | "cogs"
  | "profit"
  | "margin";

export type SalesTrendGranularity = "daily" | "weekly" | "monthly";

export type SalesTrendPoint = {
  key: string;
  bucketStart: string;
  bucketEnd: string;
  sales: number;
  orders: number;
  aov: number;
  cogs: number;
  profit: number;
  margin: number;
};

type SalesTrendChartProps = {
  from: string;
  to: string;
  loading?: boolean;
  metric: SalesTrendMetric;
  granularity: SalesTrendGranularity;
  points: SalesTrendPoint[];
  selectedPointKey?: string | null;
  onMetricChange: (metric: SalesTrendMetric) => void;
  onPointSelect?: (pointKey: string) => void;
};

type MetricMeta = {
  key: SalesTrendMetric;
  label: string;
  shortLabel: string;
  stroke: string;
  fill: string;
  chipClassName: string;
};

const METRICS: MetricMeta[] = [
  {
    key: "sales",
    label: "Sales",
    shortLabel: "Sales",
    stroke: "#fbbf24",
    fill: "rgba(251, 191, 36, 0.20)",
    chipClassName:
      "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:border-amber-400/50",
  },
  {
    key: "orders",
    label: "Orders",
    shortLabel: "Orders",
    stroke: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.18)",
    chipClassName:
      "border-sky-500/30 bg-sky-500/10 text-sky-100 hover:border-sky-400/50",
  },
  {
    key: "aov",
    label: "Avg Order Value",
    shortLabel: "Order Value",
    stroke: "#a78bfa",
    fill: "rgba(167, 139, 250, 0.18)",
    chipClassName:
      "border-violet-500/30 bg-violet-500/10 text-violet-100 hover:border-violet-400/50",
  },
  {
    key: "cogs",
    label: "COGS",
    shortLabel: "COGS",
    stroke: "#fb923c",
    fill: "rgba(251, 146, 60, 0.18)",
    chipClassName:
      "border-orange-500/30 bg-orange-500/10 text-orange-100 hover:border-orange-400/50",
  },
  {
    key: "profit",
    label: "Gross Profit",
    shortLabel: "Profit",
    stroke: "#34d399",
    fill: "rgba(52, 211, 153, 0.18)",
    chipClassName:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/50",
  },
  {
    key: "margin",
    label: "Gross Margin",
    shortLabel: "Margin",
    stroke: "#818cf8",
    fill: "rgba(129, 140, 248, 0.18)",
    chipClassName:
      "border-indigo-500/30 bg-indigo-500/10 text-indigo-100 hover:border-indigo-400/50",
  },
];

function getMetricValue(point: SalesTrendPoint, metric: SalesTrendMetric) {
  return point[metric];
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampDate(date: Date, min: Date, max: Date) {
  if (date.getTime() < min.getTime()) return min;
  if (date.getTime() > max.getTime()) return max;
  return date;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetricValue(metric: SalesTrendMetric, value: number) {
  if (metric === "orders") {
    return new Intl.NumberFormat("en-PH").format(Math.round(value));
  }
  if (metric === "margin") {
    return `${value.toFixed(1)}%`;
  }
  return formatPeso(value);
}

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `P${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `P${(value / 1_000).toFixed(1)}k`;
  return `P${Math.round(value)}`;
}

function formatCompactMetric(metric: SalesTrendMetric, value: number) {
  if (metric === "orders") {
    return new Intl.NumberFormat("en-PH", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Math.round(value));
  }
  if (metric === "margin") {
    return `${value.toFixed(0)}%`;
  }
  return formatCompactCurrency(value);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function getPeriodLabel(granularity: SalesTrendGranularity) {
  if (granularity === "weekly") return "week";
  if (granularity === "monthly") return "month";
  return "day";
}

function getPointDisplayRange(
  point: SalesTrendPoint,
  fromValue: string,
  toValue: string
) {
  const fromDate = parseLocalDate(fromValue);
  const toDate = parseLocalDate(toValue);
  const startDate = parseLocalDate(point.bucketStart);
  const endDate = parseLocalDate(point.bucketEnd);
  if (!fromDate || !toDate || !startDate || !endDate) {
    return { start: startDate, end: endDate };
  }
  return {
    start: clampDate(startDate, fromDate, toDate),
    end: clampDate(endDate, fromDate, toDate),
  };
}

function formatPointShortLabel(
  point: SalesTrendPoint,
  granularity: SalesTrendGranularity,
  fromValue: string,
  toValue: string
) {
  const range = getPointDisplayRange(point, fromValue, toValue);
  if (!range.start || !range.end) return point.bucketStart;
  if (granularity === "daily") return formatShortDate(range.start);
  if (granularity === "weekly") return `Wk ${formatShortDate(range.start)}`;
  return range.start.toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
  });
}

function formatPointPeriodLabel(
  point: SalesTrendPoint,
  granularity: SalesTrendGranularity,
  fromValue: string,
  toValue: string
) {
  const range = getPointDisplayRange(point, fromValue, toValue);
  if (!range.start || !range.end) return point.bucketStart;
  if (granularity === "daily" || range.start.getTime() === range.end.getTime()) {
    return formatFullDate(range.start);
  }
  return `${formatFullDate(range.start)} to ${formatFullDate(range.end)}`;
}

export function SalesTrendChart({
  from,
  to,
  loading = false,
  metric,
  granularity,
  points,
  selectedPointKey = null,
  onMetricChange,
  onPointSelect,
}: SalesTrendChartProps) {
  const activeMetric = METRICS.find((entry) => entry.key === metric) ?? METRICS[0];
  const chartId = React.useId();
  const periodLabel = getPeriodLabel(granularity);

  const activePoint = React.useMemo(() => {
    if (!points.length) return null;
    if (selectedPointKey) {
      const exact = points.find((point) => point.key === selectedPointKey);
      if (exact) return exact;
    }
    const latestNonZero = [...points]
      .reverse()
      .find((point) => Math.abs(getMetricValue(point, metric)) > 0.0001);
    return latestNonZero ?? points[points.length - 1];
  }, [metric, points, selectedPointKey]);

  const activeIndex = React.useMemo(
    () => (activePoint ? points.findIndex((point) => point.key === activePoint.key) : -1),
    [activePoint, points]
  );

  const previousPoint = activeIndex > 0 ? points[activeIndex - 1] : null;

  const peakPoint = React.useMemo(() => {
    if (!points.length) return null;
    return points.reduce((best, point) =>
      getMetricValue(point, metric) > getMetricValue(best, metric) ? point : best
    );
  }, [metric, points]);

  const averageValue = React.useMemo(() => {
    if (!points.length) return 0;
    return (
      points.reduce((sum, point) => sum + getMetricValue(point, metric), 0) / points.length
    );
  }, [metric, points]);

  const comparison = React.useMemo(() => {
    if (!activePoint || !previousPoint) {
      return {
        valueLabel: "No prior period",
        detailLabel: `Select another ${periodLabel} to compare.`,
        toneClassName: "text-white/70",
        icon: Minus,
      };
    }

    const currentValue = getMetricValue(activePoint, metric);
    const previousValue = getMetricValue(previousPoint, metric);
    const delta = currentValue - previousValue;
    const percentDelta =
      Math.abs(previousValue) > 0.0001 ? (delta / previousValue) * 100 : null;
    const signPrefix = delta > 0 ? "+" : "";
    const valueLabel =
      metric === "orders"
        ? `${signPrefix}${new Intl.NumberFormat("en-PH").format(Math.round(delta))}`
        : metric === "margin"
        ? `${signPrefix}${delta.toFixed(1)}%`
        : `${signPrefix}${formatPeso(delta)}`;
    const detailLabel =
      percentDelta === null
        ? "Previous period was zero."
        : `${signPrefix}${percentDelta.toFixed(1)}% vs previous ${periodLabel}`;

    if (delta > 0) {
      return {
        valueLabel,
        detailLabel,
        toneClassName: "text-emerald-300",
        icon: ArrowUpRight,
      };
    }
    if (delta < 0) {
      return {
        valueLabel,
        detailLabel,
        toneClassName: "text-red-300",
        icon: ArrowDownRight,
      };
    }
    return {
      valueLabel: "No change",
      detailLabel: `Matches previous ${periodLabel}.`,
      toneClassName: "text-white/70",
      icon: Minus,
    };
  }, [activePoint, metric, periodLabel, previousPoint]);

  const geometry = React.useMemo(() => {
    const width = 860;
    const height = 280;
    const left = 58;
    const right = 20;
    const top = 18;
    const bottom = 42;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    if (!points.length) {
      return {
        width,
        height,
        left,
        right,
        top,
        bottom,
        innerWidth,
        innerHeight,
        points: [] as Array<SalesTrendPoint & { value: number; x: number; y: number }>,
        areaPath: "",
        linePath: "",
        ticks: [] as number[],
        domainMin: 0,
        domainMax: 1,
        zeroY: top + innerHeight,
      };
    }

    const values = points.map((point) => getMetricValue(point, metric));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const baseMin = metric === "margin" ? Math.min(rawMin, 0) : 0;
    const baseMax = Math.max(rawMax, baseMin + 1);
    const spread = Math.max(baseMax - baseMin, 1);
    const padTop = spread * 0.14;
    const padBottom = metric === "margin" && rawMin < 0 ? spread * 0.1 : 0;
    const domainMin = baseMin - padBottom;
    const domainMax = baseMax + padTop;
    const domainSpread = Math.max(domainMax - domainMin, 1);

    const xForIndex = (index: number) =>
      points.length === 1
        ? left + innerWidth / 2
        : left + (innerWidth * index) / (points.length - 1);
    const yForValue = (value: number) =>
      top + innerHeight - ((value - domainMin) / domainSpread) * innerHeight;

    const plotted = points.map((point, index) => {
      const value = getMetricValue(point, metric);
      return {
        ...point,
        value,
        x: xForIndex(index),
        y: yForValue(value),
      };
    });

    const linePath = plotted
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
    const lastPoint = plotted[plotted.length - 1];
    const firstPoint = plotted[0];
    const areaPath = plotted.length
      ? `${linePath} L ${lastPoint.x} ${top + innerHeight} L ${firstPoint.x} ${
          top + innerHeight
        } Z`
      : "";
    const ticks = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      return domainMax - ratio * domainSpread;
    });
    const zeroY = yForValue(0);

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      innerWidth,
      innerHeight,
      points: plotted,
      areaPath,
      linePath,
      ticks,
      domainMin,
      domainMax,
      zeroY,
    };
  }, [metric, points]);

  const xTickIndexes = React.useMemo(() => buildTickIndexes(points.length), [points.length]);
  const CompareIcon = comparison.icon;

  return (
    <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <LineChart className="h-4 w-4 text-cyan-200" />
            Trend Graph
          </div>
          <div className="mt-1 text-sm text-white/60">
            Grouped by {periodLabel}. Compare the selected {periodLabel} against the previous one.
          </div>
        </div>
        <div className="text-right text-xs text-white/50">
          <div>
            {from} to {to}
          </div>
          <div>
            {points.length} plotted {periodLabel}
            {points.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {METRICS.map((entry) => {
          const active = entry.key === metric;
          return (
            <Button
              key={entry.key}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onMetricChange(entry.key)}
              className={cn(
                "rounded-full px-4",
                active ? entry.chipClassName : "text-white/70 hover:text-white"
              )}
            >
              {entry.shortLabel}
            </Button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/45">
            <CalendarRange className="h-3.5 w-3.5" />
            Selected {periodLabel}
          </div>
          <div className="mt-2 text-sm text-white/60">
            {activePoint
              ? formatPointPeriodLabel(activePoint, granularity, from, to)
              : "No period selected"}
          </div>
          <div className="mt-1 text-xl font-semibold" style={{ color: activeMetric.stroke }}>
            {activePoint ? formatMetricValue(metric, getMetricValue(activePoint, metric)) : "--"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/45">
            <TrendingUp className="h-3.5 w-3.5" />
            Peak {periodLabel}
          </div>
          <div className="mt-2 text-sm text-white/60">
            {peakPoint ? formatPointPeriodLabel(peakPoint, granularity, from, to) : "No data"}
          </div>
          <div className="mt-1 text-xl font-semibold text-white">
            {peakPoint ? formatMetricValue(metric, getMetricValue(peakPoint, metric)) : "--"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/45">
            <MousePointerClick className="h-3.5 w-3.5" />
            Average per {periodLabel}
          </div>
          <div className="mt-2 text-sm text-white/60">{activeMetric.label}</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {formatMetricValue(metric, averageValue)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/45">
            <CompareIcon className="h-3.5 w-3.5" />
            Vs previous {periodLabel}
          </div>
          <div className={cn("mt-3 text-xl font-semibold", comparison.toneClassName)}>
            {comparison.valueLabel}
          </div>
          <div className="mt-1 text-sm text-white/60">{comparison.detailLabel}</div>
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),rgba(255,255,255,0.01)_40%,rgba(0,0,0,0.25))] p-3">
        {!points.length ? (
          <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-sm text-white/60">
            No paid orders in this date range yet.
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className="h-[280px] w-full"
              role="img"
              aria-label={`${activeMetric.label} trend from ${from} to ${to}`}
            >
              <defs>
                <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeMetric.fill} />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
                </linearGradient>
              </defs>

              <rect
                x={geometry.left}
                y={geometry.top}
                width={geometry.innerWidth}
                height={geometry.innerHeight}
                rx="18"
                fill="rgba(255,255,255,0.01)"
              />

              {geometry.ticks.map((tick) => {
                const y =
                  geometry.top +
                  geometry.innerHeight -
                  ((tick - geometry.domainMin) /
                    Math.max(geometry.domainMax - geometry.domainMin, 1)) *
                    geometry.innerHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={geometry.left}
                      x2={geometry.width - geometry.right}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.09)"
                      strokeDasharray="4 6"
                    />
                    <text
                      x={geometry.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="rgba(255,255,255,0.55)"
                    >
                      {formatCompactMetric(metric, tick)}
                    </text>
                  </g>
                );
              })}

              {geometry.domainMin < 0 && geometry.domainMax > 0 ? (
                <line
                  x1={geometry.left}
                  x2={geometry.width - geometry.right}
                  y1={geometry.zeroY}
                  y2={geometry.zeroY}
                  stroke="rgba(255,255,255,0.2)"
                />
              ) : null}

              {geometry.areaPath ? (
                <path d={geometry.areaPath} fill={`url(#${chartId}-area)`} />
              ) : null}
              {geometry.linePath ? (
                <path
                  d={geometry.linePath}
                  fill="none"
                  stroke={activeMetric.stroke}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {activePoint ? (
                <line
                  x1={geometry.points.find((point) => point.key === activePoint.key)?.x ?? 0}
                  x2={geometry.points.find((point) => point.key === activePoint.key)?.x ?? 0}
                  y1={geometry.top}
                  y2={geometry.top + geometry.innerHeight}
                  stroke="rgba(255,255,255,0.14)"
                  strokeDasharray="4 6"
                />
              ) : null}

              {geometry.points.map((point, index) => {
                const selected = point.key === activePoint?.key;
                const showVisiblePoint = selected || geometry.points.length <= 40;
                return (
                  <g
                    key={point.key}
                    onClick={() => onPointSelect?.(point.key)}
                    style={{ cursor: onPointSelect ? "pointer" : "default" }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={selected ? 12 : 9}
                      fill="transparent"
                    />
                    {showVisiblePoint ? (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={selected ? 5 : 3}
                        fill={selected ? "#ffffff" : activeMetric.stroke}
                        stroke={activeMetric.stroke}
                        strokeWidth={selected ? 3 : 1.5}
                      />
                    ) : null}
                    <title>
                      {`${formatPointPeriodLabel(point, granularity, from, to)}: ${formatMetricValue(
                        metric,
                        point.value
                      )}`}
                    </title>
                    {xTickIndexes.includes(index) ? (
                      <text
                        x={point.x}
                        y={geometry.height - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fill={selected ? "#ffffff" : "rgba(255,255,255,0.55)"}
                      >
                        {formatPointShortLabel(point, granularity, from, to)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white/70">
              {activeMetric.label}
            </div>
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/25 text-sm text-white/80">
                Updating chart...
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
        <div>
          Use the date filters below to change the window, then switch the chart to daily,
          weekly, or monthly comparisons.
        </div>
        <div>
          {activePoint
            ? `Focused: ${formatPointPeriodLabel(activePoint, granularity, from, to)}`
            : "Latest active period selected."}
        </div>
      </div>
    </div>
  );
}
