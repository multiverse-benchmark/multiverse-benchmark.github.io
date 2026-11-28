/**
 * The site's result sets (./results.ts) in the shape the leaderboard draws
 * (src/types/platform.ts, src/components/leaderboard).
 *
 * Every number of the leaderboard on this page comes from the result files
 * that ship with the site: src/data/paper/leaderboard.json for the paper's
 * release and src/data/leaderboard.v1.1.0.json for the latest one. Nothing is
 * requested from a server. The conversion keeps, for every cell, the
 * unrounded mean (ranks and differences are computed from it), the one-decimal
 * text its source prints, and the standard deviation across runs where the
 * set has several runs.
 *
 * A result set lists the harnesses it has results for. The board is set up
 * for every harness of the paper's study, so a set without results under one
 * of them still names it, with no models: the leaderboard shows such a harness
 * as not available yet.
 */
import type { HarnessOption, MultiverseModel, TaskSettingId, TaskSettingOption, TaskSettingStats } from '../types/platform';
import { AVERAGE_HARNESS } from './leaderboardFilters';
import type { ResultSet } from './release';
import { AGGREGATES, RESULTS, type Cell, type Harness, type Model, type Results, type Submission, type TaskSettingId as SettingCode } from './results';

export interface Board {
  /** One entry per model and harness and, where the set has results under several harnesses, one per model for its average over them. */
  models: MultiverseModel[];
  /** The task settings, in the paper's order. */
  settings: TaskSettingOption[];
  /** Every harness the board is set up for; `models` is 0 where the set has no results under it. */
  harnesses: HarnessOption[];
}

/** The task settings under the ids the leaderboard uses. */
const SETTING_ID: Record<SettingCode, TaskSettingId> = {
  ST: 'single-turn',
  IF: 'instruction-following',
  MT: 'multi-turn',
  MTIF: 'multi-turn-instruction-following',
};
const SETTING_CODES = Object.keys(SETTING_ID) as SettingCode[];

/** The bare harness is "none" on the leaderboard: a run without a harness. */
const harnessKey = (harness: Harness): string => (harness.kind === 'bare' ? 'none' : harness.id);

/** Every harness of the paper's study, in its order. */
const ALL_HARNESSES = RESULTS['paper-validation'].harnesses;

function stats(cell: Cell, tasks: number): TaskSettingStats {
  // With one run the export has the counts; with several, the mean number of passed tasks need not be whole.
  const passed = cell.passed ?? (cell.mean / 100) * tasks;
  return {
    samples: tasks,
    passed,
    failed: tasks - passed,
    skipped: 0,
    unscored: 0,
    successRate: cell.mean / 100,
    avgSteps: 0,
    rateText: cell.meanText,
    sdText: cell.sdText,
    ci95: cell.ci95,
  };
}

function build(results: Results): Board {
  /** One entry of the board: a model's cells under a harness, or its cells averaged over the harnesses. */
  const entry = (model: Model, scaffold: string, harnessType: string | null, cellOf: (setting: SettingCode | 'Average') => Cell, submission?: Submission, submitter?: string): MultiverseModel => {
    const average = cellOf('Average');
    return {
      ...(submitter ? { submitter } : {}),
      ...(submission ? { submission } : {}),
      rank: average.rank,
      modelKey: `${results.set}/${model.id}`,
      name: model.name,
      provider: model.developer,
      scaffold,
      harnessType,
      isOpenWeights: model.access === 'open',
      successRate: average.mean / 100,
      rateText: average.meanText,
      sdText: average.sdText,
      ci95: average.ci95,
      avgSteps: 0,
      submittedAt: submission?.submittedOn ?? '',
      parameters: 0,
      isMoE: false,
      contextLength: 0,
      samplesTotal: results.totalTasks,
      samplesScored: results.totalTasks,
      samplesSkipped: 0,
      samplesUnscored: 0,
      taskSettings: Object.fromEntries(SETTING_CODES.map(code => [
        SETTING_ID[code],
        stats(cellOf(code), results.taskCounts[code]),
      ])),
    };
  };
  const models = [
    // A model has an entry under each harness it has results for.
    ...results.harnesses.flatMap(harness => results.models.filter(model => results.has(model.id, harness.id)).map(model =>
      entry(model, harness.name, harness.kind === 'bare' ? null : harness.id, setting => results.cellFor(setting, model.id, harness.id), results.submissionOf(model.id, harness.id), results.submitterOf(model.id, harness.id)))),
    // A set with results under several harnesses also has each model's rate averaged over them.
    ...(results.scopes.includes('average')
      ? results.rowsForScope('average').map(row => entry(row.model, AGGREGATES.average.name, AVERAGE_HARNESS, setting => row.cells[setting]))
      : []),
  ];

  const settings = SETTING_CODES.map((code): TaskSettingOption => ({
    id: SETTING_ID[code],
    code,
    label: results.settingById(code).description,
    description: `${results.taskCounts[code]} tasks`,
    models: results.models.length,
    samples: results.taskCounts[code],
  }));

  const withResults = new Set(results.harnesses.map(harness => harness.id));
  const known = new Set(ALL_HARNESSES.map(harness => harness.id));
  const harnesses = [...ALL_HARNESSES, ...results.harnesses.filter(harness => !known.has(harness.id))].map((harness): HarnessOption => ({
    id: harnessKey(harness),
    label: harness.name,
    models: withResults.has(harness.id) ? results.rowsForHarness(harness.id).length : 0,
  }));

  return { models, settings, harnesses };
}

const BOARDS: Record<ResultSet, Board> = {
  'paper-validation': build(RESULTS['paper-validation']),
  validation: build(RESULTS.validation),
  test: build(RESULTS.test),
};

/** A result set as a leaderboard. */
export const boardOf = (set: ResultSet): Board => BOARDS[set];
