/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useLayoutEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";
import { HARNESS_COLORS, SETTING_COLORS } from "@/lib/taskSettingStyle";
import {
  BEST_HARNESS,
  CHART_MODELS_SHOWN,
  formatPoints,
  printedRate,
  scoreFor,
  type BoardColumn,
  type ColumnAxis,
  type ModelRow,
} from "@/lib/leaderboardFilters";
import type { HarnessOption, TaskSettingFilter } from "@/types/platform";

/** Characters per line of a model name under its bars. */
const LINE_LIMIT = 14;
/** The least width a model's group of bars may have; a narrower chart scrolls sideways instead. */
const GROUP_MIN_WIDTH = 84;
/** Room for the axis on the left and the margin on the right. */
const AXIS_WIDTH = 64;

/** Split a model name into at most two short lines, ellipsising what doesn't fit. */
function nameLines(name: string): string[] {
  const base = name.split(" (")[0].split("/").pop() ?? name;
  const lines: string[] = [];
  let current = "";
  for (const word of base.split(" ")) {
    if (current && `${current} ${word}`.length > LINE_LIMIT) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  lines.push(current);
  const clipped = lines.slice(0, 2).map((line) =>
    line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT - 1)}…` : line,
  );
  if (lines.length > 2) clipped[1] = `${clipped[1].replace(/…$/, "")}…`;
  return clipped;
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

function ModelTick({ x = 0, y = 0, payload }: TickProps) {
  const lines = nameLines(payload?.value ?? "");
  return (
    <g className="lbch-tick" data-model={payload?.value} transform={`translate(${x},${y})`}>
      {/* 11px: the longest line of a name (14 characters) then fits the narrowest group of bars. */}
      <text textAnchor="middle" fill="var(--mv-ink-2)" fontSize={11}>
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 15 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

interface LeaderboardChartProps {
  /**
   * The models in the chart's order. The order does not depend on what is
   * selected, so a selection never moves a model: it changes which bars stand
   * out, or which numbers the bars show.
   */
  rows: ModelRow[];
  runCount: number;
  /** The table's columns; task-setting charts include Average, while harness charts omit Best. */
  columns: BoardColumn[];
  /** The selected column. A series with this key is drawn in full, with its values, and the others recede. */
  selectedKey: string;
  axis: ColumnAxis;
  /** One sentence on what the bars are, for the selected harness or task setting. */
  subtitle: string;
  harnesses: HarnessOption[];
}

type Datum = Record<string, string | number | [number, number] | undefined>;

function intervalFor(datum: Datum, key: string): [number, number] | undefined {
  const interval = datum[`${key}:ci95`];
  return Array.isArray(interval) ? interval : undefined;
}

/** Selected means sit above their confidence interval, including on a resized plot. */
function RateLabel({ value, viewBox, index, data, columnKey }: LabelProps & { data: Datum[]; columnKey: string }) {
  const plot = usePlotArea();
  if (!plot || typeof value !== "number" || index === undefined || !viewBox || !("x" in viewBox) || !("width" in viewBox)) return null;
  const datum = data[index];
  if (!datum || typeof viewBox.x !== "number" || typeof viewBox.width !== "number") return null;
  const upper = intervalFor(datum, columnKey)?.[1] ?? value;
  const y = plot.y + plot.height * (1 - upper / 100) - 6;
  return <text x={viewBox.x + viewBox.width / 2} y={y} textAnchor="middle" className="lbch-value-label">
    {datum[`${columnKey}:label`] as string}
  </text>;
}

const colorOf = (axis: ColumnAxis, key: string): string =>
  axis === "settings"
    ? SETTING_COLORS[key as TaskSettingFilter] ?? "var(--mv-ink-2)"
    : HARNESS_COLORS[key] ?? "var(--mv-ink-2)";

/**
 * The table's numbers as grouped bars: one group per model, one bar per column
 * (task setting or harness). The models keep one order whatever is selected.
 */
export function LeaderboardChart({ rows, runCount, columns, selectedKey, axis, subtitle, harnesses }: LeaderboardChartProps) {
  const series = columns.filter((column) => !column.summary || (axis === "settings" && column.setting === "all"));
  const harnessLabel = (id: string) => harnesses.find((h) => h.id === id)?.label ?? id;
  // A model with no result in any of the columns has no bars and takes no place.
  const charted = rows.filter((row) => series.some((column) => scoreFor(row, column.harness, column.setting)));
  const shown = charted.slice(0, CHART_MODELS_SHOWN);
  // One series selected: it is drawn in full with its values, and the rest recede.
  const single = series.some((column) => column.key === selectedKey);

  /* A chart wider than its frame scrolls sideways; the frame says so while it does. */
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown.length, series.length]);

  const data: Datum[] = shown.map((row) => {
    const datum: Datum = { name: row.best.name };
    for (const column of series) {
      const score = scoreFor(row, column.harness, column.setting);
      if (!score) continue;
      const mean = score.results.successRate * 100;
      datum[column.key] = mean;
      datum[`${column.key}:label`] = printedRate(score.results);
      datum[`${column.key}:n`] = score.results.samples;
      if (score.results.sdText != null) datum[`${column.key}:sd`] = score.results.sdText;
      if (score.results.ci95) {
        const [lower, upper] = score.results.ci95;
        datum[`${column.key}:ci95`] = [lower, upper];
        // Recharts takes distances from the mean. A tuple also preserves a real zero-width interval.
        datum[`${column.key}:error`] = [Math.max(0, mean - Math.max(0, lower)), Math.max(0, Math.min(100, upper) - mean)];
      }
      if (column.harness === BEST_HARNESS) datum[`${column.key}:h`] = harnessLabel(score.run.harnessType || "none");
    }
    return datum;
  });

  const title = axis === "settings" ? "Success rate by task setting" : "Success rate by harness";
  const hasIntervals = data.some((datum) => series.some((column) => intervalFor(datum, column.key)));
  const showsBestHarness = series.some((column) => column.harness === BEST_HARNESS);

  return (
    <div className="lbch mv-card" data-leaderboard-chart data-chart-axis={axis}>
      <div className="lbch-head">
        <div>
          <h3 className="lbch-title">{title}</h3>
          <p className="lbch-subtitle">
            {subtitle}
            {charted.length > shown.length && ` The first ${shown.length} of ${charted.length} models are shown.`}
          </p>
          {hasIntervals && <p className="lbch-uncertainty" data-chart-uncertainty>
            Error bars: 95% task-bootstrap confidence intervals (10,000 resamples within task setting).
            {showsBestHarness && " Each interval is conditional on the selected best harness; it does not include uncertainty from choosing the harness."}
          </p>}
        </div>
        <ul className="lbch-legend" aria-label="Legend">
          {series.map((column) => (
            <li key={column.key} title={column.title} data-receded={single && column.key !== selectedKey}>
              <span className="lbch-swatch" style={{ background: colorOf(axis, column.key) }} aria-hidden />
              <b>{column.label}</b>
              {column.name !== column.label && <span>{column.name}</span>}
            </li>
          ))}
        </ul>
      </div>
      {data.length === 0 || series.length === 0 ? (
        <p className="lbch-empty">No results to chart</p>
      ) : (
        <div
          ref={scroller}
          className="lbch-scroll"
          data-scrollable={scrollable}
          role="group"
          tabIndex={0}
          aria-label={`${title}, bar chart of ${shown.length} models${hasIntervals ? " with 95% task-bootstrap confidence intervals" : ""}. Mean success rates also appear in the table below.`}
        >
          <div className="lbch-plot" style={{ minWidth: data.length * GROUP_MIN_WIDTH + AXIS_WIDTH }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 18, right: 16, bottom: 4, left: 0 }} barCategoryGap="20%" barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--mv-line)" />
                <XAxis
                  dataKey="name"
                  tick={<ModelTick />}
                  tickLine={false}
                  stroke="var(--mv-line-strong)"
                  interval={0}
                  height={48}
                />
                <YAxis
                  domain={[0, 100]}
                  allowDataOverflow
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  width={48}
                  tick={{ fontSize: 12, fill: "var(--mv-ink-3)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--mv-tint)", fillOpacity: 0.7 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const datum = payload[0].payload as Datum;
                    return (
                      <div className="lbch-tip" tabIndex={0} aria-label={`Results for ${datum.name}`}>
                        <p className="lbch-tip-name">{datum.name}</p>
                        {series.map((column) => {
                          if (datum[column.key] === undefined) return null;
                          const interval = intervalFor(datum, column.key);
                          return <div key={column.key} className="lbch-tip-series">
                            <p className="lbch-tip-row">
                              <span className="lbch-swatch" style={{ background: colorOf(axis, column.key) }} aria-hidden />
                              <span>{column.name}</span>
                              <b>{datum[`${column.key}:label`] as string}%</b>
                            </p>
                            <p className="lbch-tip-n">
                              {datum[`${column.key}:h`] ? `${datum[`${column.key}:h`]}, ` : ""}
                              {datum[`${column.key}:n`] as number} tasks
                            </p>
                            {interval && <p className="lbch-tip-uncertainty">95% CI: {formatPoints(interval[0])}–{formatPoints(interval[1])}%</p>}
                            {datum[`${column.key}:sd`] !== undefined && <p className="lbch-tip-uncertainty">SD across {runCount} runs: {datum[`${column.key}:sd`] as string} percentage points</p>}
                          </div>;
                        })}
                      </div>
                    );
                  }}
                />
                {series.map((column) => {
                  const full = !single || column.key === selectedKey;
                  const columnData = data.filter((datum) => typeof datum[column.key] === "number");
                  const hasColumnIntervals = columnData.some((datum) => intervalFor(datum, column.key));
                  return (
                    <Bar
                      key={column.key}
                      dataKey={column.key}
                      name={column.name}
                      fill={colorOf(axis, column.key)}
                      fillOpacity={full ? 0.92 : 0.36}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                      // A real 0% still draws a hairline; a column with no result draws nothing.
                      minPointSize={2}
                    >
                      {hasColumnIntervals && <ErrorBar
                        className="lbch-error-bar"
                        data-ci-series={column.key}
                        dataKey={`${column.key}:error`}
                        width={2}
                        stroke="var(--mv-ink)"
                        strokeWidth={1.1}
                        strokeOpacity={full ? 0.8 : 0.28}
                        isAnimationActive={false}
                        pointerEvents="none"
                      />}
                      {single && column.key === selectedKey && (
                        <LabelList
                          dataKey={column.key}
                          content={<RateLabel data={columnData} columnKey={column.key} />}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {scrollable && (
        <p className="lbch-scroll-hint" data-chart-scroll-hint>
          Scroll sideways to see all models.
        </p>
      )}
    </div>
  );
}
