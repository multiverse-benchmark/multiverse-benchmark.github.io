/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  LeaderboardFilters,
  MultiverseModel,
  TaskSettingFilter,
} from "@/types/platform";

/** The table never shows more than this many models at once (one page). */
export const MAX_MODELS_SHOWN = 25;

/** The chart is kept to the leaders so the model names have room. */
export const CHART_MODELS_SHOWN = 12;

export const DEFAULT_FILTERS: LeaderboardFilters = {
  search: "",
  category: "general",
  parameters: "any",
  contextLength: "any",
  taskSetting: "all",
  harness: [],
};

/**
 * A run with the board's overall number, "Average": the average of its
 * success rates in the task settings, each setting weighted equally, as in
 * the paper.
 *
 * The API's `successRate` is a different number: passed tasks over all scored
 * tasks. The two agree only while every setting has the same number of scored
 * tasks, so the board does not rely on that: the live board replaces the API's
 * number by the average, computed here from the per-setting rates of the same
 * response. A setting in which the run has no scored task has no rate and is
 * left out; a run without any per-setting result keeps the API's number.
 */
export function withAverageOverSettings(model: MultiverseModel): MultiverseModel {
  const rates = Object.values(model.taskSettings ?? {}).flatMap((stats) =>
    stats && stats.samples > 0 ? [stats.successRate] : [],
  );
  if (rates.length === 0) return model;
  return { ...model, successRate: rates.reduce((sum, rate) => sum + rate, 0) / rates.length };
}

/** What a model scored in one task setting ("all" = the average over the task settings). */
export interface ModelResults {
  successRate: number; // 0-1
  avgSteps: number;
  samples: number; // scored
  skipped: number; // infrastructure skips, excluded from the success rate
  /** The rate as its source prints it; the table shows this where there is one. */
  text?: string;
  /** Standard deviation across runs as its source prints it. */
  sdText?: string | null;
  /** Absolute 95% task-bootstrap confidence limits, in percent (0-100). */
  ci95?: [number, number];
}

export function resultsFor(
  model: MultiverseModel,
  setting: TaskSettingFilter,
): ModelResults | null {
  if (setting === "all") {
    return {
      successRate: model.successRate,
      avgSteps: model.avgSteps,
      samples: model.samplesScored ?? model.samplesWithSteps ?? 0,
      skipped: model.samplesSkipped ?? 0,
      text: model.rateText,
      sdText: model.sdText,
      ci95: model.ci95,
    };
  }
  const stats = model.taskSettings?.[setting];
  if (!stats || stats.samples === 0) return null;
  return {
    successRate: stats.successRate,
    avgSteps: stats.avgSteps,
    samples: stats.samples,
    skipped: stats.skipped,
    text: stats.rateText,
    sdText: stats.sdText,
    ci95: stats.ci95,
  };
}

export const harnessKey = (model: MultiverseModel): string =>
  model.harnessType || "none";

/**
 * In place of a harness: a model's success rate averaged over the harnesses.
 * A result set that has this average carries it as one entry per model whose
 * harness is this key; it is not a run, so it is kept apart from the runs.
 */
export const AVERAGE_HARNESS = "average";

/** One leaderboard row: a model and its runs, one per harness it was evaluated on. */
export interface ModelRow {
  key: string;
  best: MultiverseModel; // best run in the current view; carries the model's metadata
  bestResults: ModelResults;
  runs: Record<string, MultiverseModel>; // by harness key, only runs in the current view
  /** The model's results averaged over the harnesses, where the result set has them. */
  average?: MultiverseModel;
  evaluatedOn: string[]; // every harness this model has a run on, ignoring filters
}

const modelKeyOf = (model: MultiverseModel): string => model.modelKey ?? model.name;

/**
 * Group runs into one row per model, applying the filters.
 *
 * Model-level filters (search, type, size, context) keep or drop the whole row.
 * Run-level filters (task setting, harness) decide which runs remain, and a
 * model with no run left disappears.
 */
export function buildRows(
  models: MultiverseModel[],
  filters: LeaderboardFilters,
): ModelRow[] {
  const search = filters.search.trim().toLowerCase();
  const byModel = new Map<string, MultiverseModel[]>();
  for (const model of models) {
    const key = modelKeyOf(model);
    byModel.set(key, [...(byModel.get(key) ?? []), model]);
  }

  const rows: ModelRow[] = [];
  for (const [key, entries] of byModel) {
    // The average over the harnesses is not a run: it ranks no harness and is never a model's best run.
    const average = entries.find((entry) => harnessKey(entry) === AVERAGE_HARNESS);
    const allRuns = entries.filter((entry) => entry !== average);
    if (allRuns.length === 0) continue;
    const model = allRuns[0];
    if (
      search &&
      !model.name.toLowerCase().includes(search) &&
      !model.provider.toLowerCase().includes(search)
    ) {
      continue;
    }
    if (filters.category === "open-weights" && !model.isOpenWeights) continue;
    if (!matchesSize(model.parameters, filters.parameters)) continue;
    if (!matchesContext(model.contextLength, filters.contextLength)) continue;

    const runs: Record<string, MultiverseModel> = {};
    for (const run of allRuns) {
      const harness = harnessKey(run);
      if (filters.harness.length > 0 && !filters.harness.includes(harness)) continue;
      if (resultsFor(run, filters.taskSetting) === null) continue;
      runs[harness] = run;
    }
    const candidates = Object.values(runs);
    if (candidates.length === 0) continue;

    const scored = candidates.map((run) => ({
      run,
      results: resultsFor(run, filters.taskSetting) as ModelResults,
    }));
    scored.sort(
      (a, b) => b.results.successRate - a.results.successRate || b.results.samples - a.results.samples,
    );
    rows.push({
      key,
      best: scored[0].run,
      bestResults: scored[0].results,
      runs,
      average,
      evaluatedOn: allRuns.map(harnessKey),
    });
  }
  return rows;
}

function matchesSize(params: number, range: LeaderboardFilters["parameters"]): boolean {
  // 0 means unknown (e.g. a closed model): it only matches "any".
  if (!params) return range === "any";
  switch (range) {
    case "small": // < 10B
      return params < 10;
    case "medium": // 10B - 70B
      return params >= 10 && params <= 70;
    case "large": // 70B - 200B
      return params >= 70 && params <= 200;
    case "xlarge": // > 200B
      return params > 200;
    default:
      return true;
  }
}

function matchesContext(ctx: number, range: LeaderboardFilters["contextLength"]): boolean {
  // 0 means unknown (e.g. a closed model): it only matches "any".
  if (!ctx) return range === "any";
  switch (range) {
    case "4k":
      return ctx <= 4;
    case "8k":
      return ctx >= 4 && ctx <= 8;
    case "32k":
      return ctx >= 8 && ctx <= 32;
    case "128k+":
      return ctx >= 128;
    default:
      return true;
  }
}

/*
 * The board as a grid. Every number of the leaderboard is one model under one
 * harness in one task setting. The table spreads one of the two axes across
 * its columns (the task settings, or the harnesses), and the other axis is
 * chosen with a control; the chart draws the same columns as the table.
 */

/** The task settings in the paper's order: ST, IF, MT, MTIF. */
const SETTING_ORDER: TaskSettingFilter[] = [
  "single-turn",
  "instruction-following",
  "multi-turn",
  "multi-turn-instruction-following",
];

export const orderSettings = <T extends { id: string }>(settings: T[]): T[] =>
  [...settings].sort((a, b) => {
    const ai = SETTING_ORDER.indexOf(a.id as TaskSettingFilter);
    const bi = SETTING_ORDER.indexOf(b.id as TaskSettingFilter);
    return (ai < 0 ? SETTING_ORDER.length : ai) - (bi < 0 ? SETTING_ORDER.length : bi);
  });

/** In place of a harness: for each number, the harness under which the model has its highest rate. */
export const BEST_HARNESS = "best";

/** Which axis the columns of the table show. */
export type ColumnAxis = "settings" | "harnesses";

/** One column of the table, and one series of the chart. */
export interface BoardColumn {
  key: string; // a task setting ("all" included) or a harness (AVERAGE_HARNESS and BEST_HARNESS included)
  /** The column heading: a task setting's code (ST) or a harness's name. */
  label: string;
  /** The full name (Single-turn), for the legends. */
  name: string;
  /** What the column is, with its number of tasks, for the key under the table and the heading's tooltip. */
  title: string;
  harness: string;
  setting: TaskSettingFilter;
  /** The averages and "Best harness" summarize the other columns; only the average over the task settings is also charted. */
  summary: boolean;
}

/** One number of the board, with the run it comes from. */
export interface Score {
  run: MultiverseModel;
  results: ModelResults;
}

/** A model's result under a harness (or averaged over the harnesses, or under its best harness) in a task setting; null if it has none. */
export function scoreFor(row: ModelRow, harness: string, setting: TaskSettingFilter): Score | null {
  if (harness === AVERAGE_HARNESS) {
    const results = row.average ? resultsFor(row.average, setting) : null;
    return row.average && results ? { run: row.average, results } : null;
  }
  if (harness !== BEST_HARNESS) {
    const run = row.runs[harness];
    const results = run ? resultsFor(run, setting) : null;
    return run && results ? { run, results } : null;
  }
  let best: Score | null = null;
  for (const run of Object.values(row.runs)) {
    const results = resultsFor(run, setting);
    if (!results) continue;
    if (
      !best ||
      results.successRate > best.results.successRate ||
      (results.successRate === best.results.successRate && results.samples > best.results.samples)
    ) {
      best = { run, results };
    }
  }
  return best;
}

/**
 * A model with its rank in the current view; null where it has no result to
 * rank. The rank is 1 + the number of models with a strictly higher rate, so
 * models with equal rates share a rank, as in the paper.
 */
export interface RankedRow {
  row: ModelRow;
  rank: number | null;
}

/** The rows ordered by one number of the grid, highest first; models without that number go last. */
export function rankRows(rows: ModelRow[], harness: string, setting: TaskSettingFilter): RankedRow[] {
  const scored = rows.map((row) => ({ row, score: scoreFor(row, harness, setting) }));
  scored.sort((a, b) => {
    if (!a.score && !b.score) return 0;
    if (!a.score) return 1;
    if (!b.score) return -1;
    return (
      b.score.results.successRate - a.score.results.successRate ||
      b.score.results.samples - a.score.results.samples
    );
  });
  return scored.map(({ row, score }) => ({
    row,
    rank: score
      ? 1 + scored.filter((other) => other.score && other.score.results.successRate > score.results.successRate).length
      : null,
  }));
}

/**
 * A number of percentage points with one decimal. The value is first cleared
 * of the binary rounding of its arithmetic (0.5025 * 100 is 50.24999999999999),
 * so that 50.25 prints as 50.3 for every model.
 */
export const formatPoints = (points: number): string => Number(points.toPrecision(12)).toFixed(1);

/** A success rate (0 to 1) as the table prints it: a percentage with one decimal. */
export const formatRate = (rate: number): string => formatPoints(rate * 100);

/** A result as the table and the chart print it: the source's own text where it has one. */
export const printedRate = (results: ModelResults): string => results.text ?? formatRate(results.successRate);
