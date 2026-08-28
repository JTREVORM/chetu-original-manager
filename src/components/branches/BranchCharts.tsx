/**
 * Branch dashboard charts.
 *
 * Recharts, already used by the main Dashboard, with one shared axis per chart —
 * every series on a chart here is UGX, so nothing is plotted against a second
 * scale. The categorical palette below was checked for colour-vision separation
 * against a light surface; each chart also carries a legend, and the product
 * breakdown labels its values directly, so identity never rests on colour alone.
 */
import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint, ProductSlice } from "../../lib/branchMetrics";
import { money } from "../mis/MisKit";

export const SERIES_BLUE = "#2563EB";
export const SERIES_GREEN = "#059669";
export const SERIES_VIOLET = "#7C3AED";
export const SERIES_AMBER = "#D97706";
export const SERIES_CYAN = "#0891B2";
export const SERIES_ROSE = "#E11D48";

/** Fixed order — a series keeps its hue however many others are on screen. */
export const CATEGORICAL = [
  SERIES_BLUE,
  SERIES_GREEN,
  SERIES_VIOLET,
  SERIES_AMBER,
  SERIES_CYAN,
  SERIES_ROSE,
];

const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";

const axisMoney = (v: number) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

const tooltipProps = {
  formatter: (value: number | string, name: string) =>
    [`UGX ${money(Number(value))}`, name] as [string, string],
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
  },
  cursor: { stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "3 3" },
};

const legendProps = {
  wrapperStyle: { fontSize: 11, paddingTop: 4 },
  iconType: "circle" as const,
  iconSize: 8,
};

export const ChartFrame: React.FC<{
  height?: number;
  empty?: boolean;
  emptyMessage?: string;
  children: React.ReactElement;
}> = ({ height = 220, empty, emptyMessage = "Nothing recorded in this period.", children }) => {
  if (empty) {
    return (
      <div
        className="grid place-items-center rounded-lg bg-slate-50/70 text-center text-[12px] text-slate-500"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
};

/** Money in against money out, day by day. */
export const MovementChart: React.FC<{ data: TrendPoint[]; height?: number }> = ({
  data,
  height = 240,
}) => {
  const empty = data.every((d) => d.collected === 0 && d.disbursed === 0);
  return (
    <ChartFrame
      height={height}
      empty={empty}
      emptyMessage="No collections or disbursements in the last 30 days."
    >
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="branch-collected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_GREEN} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES_GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Area
          type="monotone"
          dataKey="collected"
          name="Collected"
          stroke={SERIES_GREEN}
          strokeWidth={2}
          fill="url(#branch-collected)"
        />
        <Area
          type="monotone"
          dataKey="disbursed"
          name="Disbursed"
          stroke={SERIES_BLUE}
          strokeWidth={2}
          fill="transparent"
        />
      </AreaChart>
    </ChartFrame>
  );
};

/** What was due against what actually came in. */
export const CollectionsVsDueChart: React.FC<{ data: TrendPoint[]; height?: number }> = ({
  data,
  height = 240,
}) => {
  const empty = data.every((d) => d.due === 0 && d.collected === 0);
  return (
    <ChartFrame
      height={height}
      empty={empty}
      emptyMessage="No instalments fell due in this period."
    >
      <BarChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip {...tooltipProps} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
        <Legend {...legendProps} />
        <Bar dataKey="due" name="Due" fill={SERIES_AMBER} radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" name="Collected" fill={SERIES_GREEN} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
};

/** Savings in against savings out. */
export const SavingsMovementChart: React.FC<{ data: TrendPoint[]; height?: number }> = ({
  data,
  height = 240,
}) => {
  const empty = data.every((d) => d.deposits === 0 && d.withdrawals === 0);
  return (
    <ChartFrame
      height={height}
      empty={empty}
      emptyMessage="No savings movement in the last 30 days."
    >
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="branch-deposits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_BLUE} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES_BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 10, fill: AXIS_TEXT }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip {...tooltipProps} />
        <Legend {...legendProps} />
        <Area
          type="monotone"
          dataKey="deposits"
          name="Deposits"
          stroke={SERIES_BLUE}
          strokeWidth={2}
          fill="url(#branch-deposits)"
        />
        <Area
          type="monotone"
          dataKey="withdrawals"
          name="Withdrawals"
          stroke={SERIES_ROSE}
          strokeWidth={2}
          fill="transparent"
        />
      </AreaChart>
    </ChartFrame>
  );
};

/**
 * Outstanding balance by loan product. Values are labelled beside the legend so
 * the split is readable without relying on the colours.
 */
export const ProductDonut: React.FC<{ data: ProductSlice[]; height?: number }> = ({
  data,
  height = 240,
}) => {
  const total = data.reduce((t, d) => t + d.outstanding, 0);
  if (total === 0) {
    return (
      <div
        className="grid place-items-center rounded-lg bg-slate-50/70 text-center text-[12px] text-slate-500"
        style={{ height }}
      >
        No outstanding balances to break down.
      </div>
    );
  }

  // A long tail of tiny products becomes unreadable as slices, so anything past
  // the palette folds into a single "Other".
  const top = data.slice(0, CATEGORICAL.length - 1);
  const rest = data.slice(CATEGORICAL.length - 1);
  const slices = rest.length
    ? [
        ...top,
        {
          productId: "__other",
          name: `Other (${rest.length})`,
          outstanding: rest.reduce((t, d) => t + d.outstanding, 0),
          count: rest.reduce((t, d) => t + d.count, 0),
        },
      ]
    : top;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-full sm:w-1/2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="outstanding"
              nameKey="name"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.productId} fill={CATEGORICAL[index % CATEGORICAL.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipProps} cursor={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 sm:w-1/2">
        {slices.map((slice, index) => (
          <li key={slice.productId} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: CATEGORICAL[index % CATEGORICAL.length] }}
              />
              <span className="truncate text-slate-600">{slice.name}</span>
            </span>
            <span className="shrink-0 font-bold text-slate-900">
              UGX {money(slice.outstanding)}
              <span className="ml-1 font-medium text-slate-400">
                {((slice.outstanding / total) * 100).toFixed(0)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
