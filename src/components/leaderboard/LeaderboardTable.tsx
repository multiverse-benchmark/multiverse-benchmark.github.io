/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, Search, SlidersHorizontal, X } from "lucide-react";
import { AccessBadge, Segmented, type SegmentedOption } from "@/components/paper/shared";
import {
  BEST_HARNESS,
  MAX_MODELS_SHOWN,
  formatPoints,
  printedRate,
  scoreFor,
  type BoardColumn,
  type ColumnAxis,
  type RankedRow,
} from "@/lib/leaderboardFilters";
import { formatContext, formatParams } from "@/lib/modelSize";
import { HARNESS_ABBR } from "@/lib/taskSettingStyle";
import type {
  ContextLengthRange,
  HarnessOption,
  LeaderboardFilters,
  MultiverseModel,
  ParameterRange,
} from "@/types/platform";

/** Which of the two model groups the table lists. */
export type AccessFilter = "all" | "closed" | "open";

const ACCESS_OPTIONS: SegmentedOption<AccessFilter>[] = [
  { value: "all", label: "All models" },
  { value: "closed", label: "Proprietary" },
  { value: "open", label: "Open-weight" },
];

/**
 * Layout by the width of the component, not of the window:
 * wide    the group badge sits beside the model name;
 * medium  the badge moves under the name;
 * narrow  as medium, tighter, with the result columns scrolling under the rank and the model, which stay in view.
 * The widths of the columns for each tier are in leaderboard.css.
 */
type Tier = "wide" | "medium" | "narrow";
const tierFor = (width: number): Tier => (width >= 1000 ? "wide" : width >= 640 ? "medium" : "narrow");

/** True when the table is wider than the region it scrolls in. */
const overflows = (scroller: HTMLElement) => scroller.scrollWidth > scroller.clientWidth + 1;

interface LeaderboardTableProps {
  /** Every model of the current view in the order of the ranking, before the search. */
  ranked: RankedRow[];
  /** Models on the board before any filter. */
  totalModels: number;
  columns: BoardColumn[];
  /** The column that ranks the models. */
  selectedKey: string;
  onSelectColumn: (key: string) => void;
  axis: ColumnAxis;
  /** What a number of the table is, in one sentence. */
  caption: string;
  /** The key under the table: what each column is. */
  keyItems: { label: string; text: string }[];
  /** Harnesses with results, for the tag beside a number in the "Best harness" view. */
  harnesses: HarnessOption[];
  filters: LeaderboardFilters;
  onFiltersChange: (filters: LeaderboardFilters) => void;
  access: AccessFilter;
  onAccessChange: (access: AccessFilter) => void;
  /** Changes whenever the view does, which sends the table back to page one. */
  resetKey: string;
  onSelectModel?: (run: MultiverseModel) => void;
}

const matchesSearch = (model: MultiverseModel, search: string): boolean =>
  !search || model.name.toLowerCase().includes(search) || model.provider.toLowerCase().includes(search);

/**
 * The ranked table. Its columns are either the task settings (for one
 * harness) or the harnesses (for one task setting); the selected column ranks
 * the models, and a heading selects its column. The gap between the best
 * proprietary and the best open-weight model is marked in place, above the
 * best open-weight row.
 */
export function LeaderboardTable({
  ranked,
  totalModels,
  columns,
  selectedKey,
  onSelectColumn,
  axis,
  caption,
  keyItems,
  harnesses,
  filters,
  onFiltersChange,
  access,
  onAccessChange,
  resetKey,
  onSelectModel,
}: LeaderboardTableProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tier, setTier] = useState<Tier>("wide");
  const [scrollable, setScrollable] = useState(false);
  const captionId = useId();
  const advancedId = useId();
  const root = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);

  // The page is remembered together with the view it was chosen under, so a
  // change of view falls back to page one without an effect.
  const [pageState, setPageState] = useState({ page: 0, resetKey });
  const requestedPage = pageState.resetKey === resetKey ? pageState.page : 0;
  const goToPage = (page: number) => setPageState({ page, resetKey });

  const update = (patch: Partial<LeaderboardFilters>) => onFiltersChange({ ...filters, ...patch });
  const search = filters.search.trim().toLowerCase();
  const advanced = filters.parameters !== "any" || filters.contextLength !== "any";
  const filtered = search !== "" || advanced || access !== "all";
  const clearFilters = () => {
    onFiltersChange({ ...filters, search: "", parameters: "any", contextLength: "any" });
    onAccessChange("all");
  };

  const selected = columns.find((column) => column.key === selectedKey) ?? columns[0];
  const entries = ranked.filter(({ row }) => matchesSearch(row.best, search));
  const pageCount = Math.max(1, Math.ceil(entries.length / MAX_MODELS_SHOWN));
  const page = Math.min(requestedPage, pageCount - 1);
  const firstIndex = page * MAX_MODELS_SHOWN;
  const pageRows = entries.slice(firstIndex, firstIndex + MAX_MODELS_SHOWN);

  /** Highest rate in every column among the ranked models: the paper prints the best value of a column in bold. */
  const columnBest: Record<string, number> = {};
  for (const column of columns) {
    const rates = ranked.flatMap(({ row }) => scoreFor(row, column.harness, column.setting)?.results.successRate ?? []);
    if (rates.length > 0) columnBest[column.key] = Math.max(...rates);
  }

  // The gap between the two model groups, by the number that ranks the models. It is marked
  // above the best open-weight row while both groups are listed in full.
  const bestOf = (open: boolean) => ranked.find((entry) => entry.rank !== null && entry.row.best.isOpenWeights === open);
  const bestClosed = bestOf(false);
  const bestOpen = bestOf(true);
  const gapPoints =
    bestClosed && bestOpen && selected
      ? (scoreFor(bestClosed.row, selected.harness, selected.setting)!.results.successRate -
          scoreFor(bestOpen.row, selected.harness, selected.setting)!.results.successRate) *
        100
      : null;
  const markerKey = gapPoints !== null && access === "all" && search === "" ? bestOpen!.row.key : null;
  // The difference is computed from the unrounded rates.
  const gapSize = gapPoints === null ? "" : formatPoints(Math.abs(gapPoints));
  const gapLevel = gapSize === "0.0";

  const usesBest = columns.some((column) => column.harness === BEST_HARNESS);
  // Size and context length are known for some boards only; without them there is nothing more to filter by.
  const sizeKnown = advanced || ranked.some(({ row }) => row.best.parameters > 0 || row.best.contextLength > 0);
  const harnessLabel = (id: string) => harnesses.find((h) => h.id === id)?.label ?? id;
  const harnessAbbr = (id: string) => HARNESS_ABBR[id] ?? harnessLabel(id);

  /* Follow the component's width. Measured before the first paint, so the layout does not flash. */
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      setTier(tierFor(element.getBoundingClientRect().width));
      if (region.current) setScrollable(overflows(region.current));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* The columns change with the view and the tier: check again whether the table scrolls. */
  useLayoutEffect(() => {
    if (region.current) setScrollable(overflows(region.current));
  }, [columns.length, axis, tier]);

  /* Where the table scrolls sideways, keep the selected column in view. */
  useLayoutEffect(() => {
    const scroller = region.current;
    if (!scroller || !overflows(scroller)) return;
    const column = scroller.querySelector<HTMLElement>("th[aria-sort]");
    const model = scroller.querySelector<HTMLElement>(".lb-th-model");
    if (!column || !model) return;
    const stickyEdge = model.getBoundingClientRect().right;
    const rightEdge = scroller.getBoundingClientRect().right;
    const rect = column.getBoundingClientRect();
    if (rect.left < stickyEdge) scroller.scrollLeft -= stickyEdge - rect.left;
    else if (rect.right > rightEdge) scroller.scrollLeft += Math.min(rect.right - rightEdge, rect.left - stickyEdge);
  }, [selectedKey, axis, tier]);

  const columnCount = columns.length + 2;

  const markerRow = (
    <tr key="gap-marker" className="lb-gap-row" data-lb-gap-marker data-best-gap={gapSize}>
      <td colSpan={columnCount}>
        <div className="lb-gap-inner">
          <span className="lb-gap-mark" aria-hidden="true" />
          <span>
            Best open-weight model:{" "}
            {gapLevel ? (
              <>level with the best proprietary model ({bestClosed?.row.best.name})</>
            ) : (
              <>
                <strong>{gapSize} points</strong> {(gapPoints ?? 0) > 0 ? "below" : "above"} the best proprietary model (
                {bestClosed?.row.best.name})
              </>
            )}
          </span>
        </div>
      </td>
    </tr>
  );

  function renderRow({ row, rank }: RankedRow) {
    const model = row.best;
    const ranking = selected ? scoreFor(row, selected.harness, selected.setting) : null;
    // The model card opens on the run behind the number that ranks the model.
    const open = onSelectModel ? () => onSelectModel(ranking?.run ?? model) : undefined;
    // Size and context length are known for some models only, so they follow the developer
    // in the model's own line and take no column. The narrow layout leaves them to the model card.
    const size = model.parameters ? formatParams(model.parameters, model.activeParameters) : "";
    const evaluatedOn = new Set(row.evaluatedOn).size;
    const details = [
      size && `${size}${model.isMoE ? " MoE" : ""}`,
      model.contextLength ? `${formatContext(model.contextLength)} context` : "",
      harnesses.length > 1 && evaluatedOn < harnesses.length ? `${evaluatedOn} of ${harnesses.length} harnesses` : "",
    ].filter(Boolean);
    // A submitted entry names its submitter and links to its trajectories: the entry behind the number that ranks the model.
    const submission = (ranking?.run ?? model).submission;
    const stay = (event: { stopPropagation: () => void }) => event.stopPropagation();
    return (
      <tr
        key={row.key}
        className={`lb-row${open ? " is-link" : ""}`}
        data-lb-row={row.key}
        data-access={model.isOpenWeights ? "open" : "closed"}
        data-rank={rank ?? undefined}
        onClick={open}
      >
        <td className="lb-rank">{rank ?? "–"}</td>
        <th scope="row" className="lb-model">
          <div className="lb-model-inner">
            <div className="lb-model-name">
              {open ? (
                <button
                  type="button"
                  className="lb-model-open"
                  title={`Open the results of ${model.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    open();
                  }}
                >
                  {model.name}
                </button>
              ) : (
                model.name
              )}
            </div>
            <div className="lb-model-meta">
              <span className="lb-model-dev">
                {model.provider}
                {details.length > 0 && <span className="lb-model-size"> · {details.join(" · ")}</span>}
                {submission && (
                  <span className="lb-model-submission" data-lb-submission={submission.id}>
                    Submitted by{" "}
                    {submission.submitterUrl ? (
                      <a href={submission.submitterUrl} target="_blank" rel="noreferrer" onClick={stay}>
                        {submission.submitter}
                      </a>
                    ) : (
                      submission.submitter
                    )}
                    {" · "}
                    <a
                      href={submission.trajectories}
                      rel="noreferrer"
                      title={`Download the trajectories and verifier votes of ${model.name}`}
                      onClick={stay}
                    >
                      trajectories
                    </a>
                  </span>
                )}
              </span>
              <span className="lb-model-access">
                <AccessBadge access={model.isOpenWeights ? "open" : "closed"} />
              </span>
            </div>
          </div>
        </th>
        {columns.map((column) => {
          const score = scoreFor(row, column.harness, column.setting);
          const isSelected = column.key === selected?.key;
          if (!score) {
            return (
              <td
                key={column.key}
                className={`lb-cell is-empty${isSelected ? " is-selected" : ""}`}
                data-lb-cell={column.key}
                title="No result"
              >
                <span aria-hidden="true">–</span>
                <span className="mv-visually-hidden">No result</span>
              </td>
            );
          }
          const { results, run } = score;
          const intervalText = results.ci95
            ? `95% task-bootstrap CI: ${formatPoints(results.ci95[0])}–${formatPoints(results.ci95[1])}%`
            : '';
          const best = results.successRate === columnBest[column.key];
          const runHarness = run.harnessType || "none";
          // A harness's own column opens that harness's run.
          const openRun =
            onSelectModel && axis === "harnesses" && !column.summary
              ? (event: { stopPropagation: () => void }) => {
                  event.stopPropagation();
                  onSelectModel(run);
                }
              : undefined;
          return (
            <td
              key={column.key}
              className={`lb-cell${isSelected ? " is-selected" : ""}${best ? " is-best" : ""}`}
              data-lb-cell={column.key}
              data-rate={printedRate(results)}
              data-sd={results.sdText ?? undefined}
              data-ci-low={results.ci95?.[0]}
              data-ci-high={results.ci95?.[1]}
              title={`${Number(results.samples.toFixed(1))} scored tasks${
                results.avgSteps > 0 ? `, ${Number(results.avgSteps.toPrecision(3))} steps on average` : ""
              }${intervalText ? `; ${intervalText}` : ''}`}
              onClick={openRun}
            >
              <span className="lb-value">
                <span className="lb-mean">{printedRate(results)}</span>
                {/* A mean of several runs has a standard deviation across them. */}
                {results.sdText && <span className="lb-sd">±{results.sdText}</span>}
                {intervalText && <span className="mv-visually-hidden">; {intervalText}</span>}
                {/* "Best harness": the harness that gives this value. It can differ from one column to the next. */}
                {column.harness === BEST_HARNESS && (
                  <span className="lb-cell-harness" data-lb-cell-harness={runHarness} title={harnessLabel(runHarness)}>
                    <span aria-hidden="true">{harnessAbbr(runHarness)}</span>
                    <span className="mv-visually-hidden"> under {harnessLabel(runHarness)}</span>
                  </span>
                )}
                {best && <span className="mv-visually-hidden"> (best in column)</span>}
              </span>
              <span className="lb-bar" aria-hidden="true">
                <span className="lb-bar-fill" style={{ width: `${results.successRate * 100}%` }} />
              </span>
              {results.skipped > 0 && (
                <span
                  className="lb-skipped"
                  title="Skipped tasks hit infrastructure limits (timeouts, context length) and are excluded from the success rate"
                >
                  {results.skipped} skipped
                </span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div
      ref={root}
      className="lb"
      data-lb
      data-axis={axis}
      data-selected={selected?.key}
      data-tier={tier}
      data-scrollable={scrollable}
    >
      <div className="lb-card mv-card">
        <div className="lb-toolbar">
          <Segmented label="Show" options={ACCESS_OPTIONS} value={access} onChange={onAccessChange} />
          <div className="lb-tools">
            <label className="lb-search">
              <Search aria-hidden="true" />
              <span className="mv-visually-hidden">Search models</span>
              <input
                type="search"
                placeholder="Search models"
                value={filters.search}
                onChange={(event) => update({ search: event.target.value })}
              />
            </label>
            {sizeKnown && (
              <button
                type="button"
                className="lb-tool"
                aria-expanded={showAdvanced}
                aria-controls={advancedId}
                data-active={advanced}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <SlidersHorizontal aria-hidden="true" />
                More filters
              </button>
            )}
            {filtered && (
              <button type="button" className="lb-tool lb-tool-clear" onClick={clearFilters}>
                <X aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        {sizeKnown && showAdvanced && (
          <div className="lb-advanced" id={advancedId}>
            <label>
              <span>Parameters</span>
              <select
                value={filters.parameters}
                onChange={(event) => update({ parameters: event.target.value as ParameterRange })}
              >
                <option value="any">Any size</option>
                <option value="small">&lt; 10B</option>
                <option value="medium">10B to 70B</option>
                <option value="large">70B to 200B</option>
                <option value="xlarge">&gt; 200B</option>
              </select>
            </label>
            <label>
              <span>Context length</span>
              <select
                value={filters.contextLength}
                onChange={(event) => update({ contextLength: event.target.value as ContextLengthRange })}
              >
                <option value="any">Any length</option>
                <option value="4k">Up to 4K</option>
                <option value="8k">4K to 8K</option>
                <option value="32k">8K to 32K</option>
                <option value="128k+">128K+</option>
              </select>
            </label>
            <p>Models of unknown size or context length match only “Any”.</p>
          </div>
        )}

        <div className="lb-caption">
          <p id={captionId}>{caption}</p>
          {usesBest && harnesses.length > 1 && (
            <ul className="lb-harness-key" aria-label="Harness abbreviations" data-lb-harness-key>
              {harnesses.map((harness) => (
                <li key={harness.id}>
                  <b>{harnessAbbr(harness.id)}</b> {harness.label}
                </li>
              ))}
            </ul>
          )}
          {scrollable && (
            <p className="lb-scroll-hint" data-lb-scroll-hint>
              Scroll sideways to see all columns.
            </p>
          )}
        </div>

        <div className="lb-frame">
          <div className="lb-scroll" ref={region} role="region" aria-label="Leaderboard table" tabIndex={0}>
            <table
              className="lb-table"
              aria-labelledby={captionId}
              style={{ "--lb-result-count": columns.length } as CSSProperties}
            >
              <colgroup>
                <col className="lb-col-rank" />
                <col className="lb-col-model" />
                {columns.map((column) => (
                  <col key={column.key} className="lb-col-result" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="lb-th lb-th-rank">
                    <span aria-hidden="true">#</span>
                    <span className="mv-visually-hidden">Rank</span>
                  </th>
                  <th scope="col" className="lb-th lb-th-model">
                    Model
                  </th>
                  {columns.map((column) => {
                    const isSelected = column.key === selected?.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className={`lb-th lb-th-result${isSelected ? " is-selected" : ""}${column.summary ? " is-summary" : ""}`}
                        aria-sort={isSelected ? "descending" : undefined}
                      >
                        <button
                          type="button"
                          className="lb-sort"
                          data-lb-sort={column.key}
                          title={`${column.title}. Select to rank the models by this column.`}
                          onClick={() => onSelectColumn(column.key)}
                        >
                          <span>{column.label}</span>
                          <ArrowDown className="lb-sort-arrow" size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr className="lb-none">
                    <td colSpan={columnCount}>No models match these filters.</td>
                  </tr>
                ) : (
                  pageRows.flatMap((entry) =>
                    entry.row.key === markerKey ? [markerRow, renderRow(entry)] : [renderRow(entry)],
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lb-footer">
          <dl className="lb-key" data-lb-key>
            {keyItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
          <div className="lb-pages">
            <span data-lb-count>
              {entries.length === 0
                ? `No matching models (${totalModels} in total)`
                : `Showing ${firstIndex + 1}–${firstIndex + pageRows.length} of ${entries.length} models${
                    entries.length < totalModels ? ` (${totalModels} in total)` : ""
                  }`}
            </span>
            {pageCount > 1 && (
              <span className="lb-pager">
                <span>
                  Page {page + 1} of {pageCount}
                </span>
                <button type="button" className="lb-tool" disabled={page === 0} onClick={() => goToPage(page - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  className="lb-tool"
                  disabled={page >= pageCount - 1}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
