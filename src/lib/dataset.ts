/**
 * Typed access to the statistics of a release's validation set: one row per
 * task, the 35 services, the seven service families, and the nine instruction
 * rubric categories. There is one file per release, both written by
 * scripts/export_dataset_stats.py:
 *
 *   v1.0.0  src/data/paper/dataset.json, from the tables behind the paper's
 *           dataset figures; every statistic the paper states is checked
 *           against these rows at export time. Gold user turns additionally
 *           come from the exported reference conversations.
 *   v1.1.0  src/data/dataset.v1.1.0.json, computed from the release's exported
 *           tasks with the same definitions (the computation reproduces the
 *           v1.0.0 file from the v1.0.0 tasks).
 *
 * A component reads the statistics of the selected release with useDataset().
 *
 * Service ids and names are the released names used by the benchmark and the
 * desktop GUI. Quantiles use linear interpolation, as in the paper.
 */
import paperData from '../data/paper/dataset.json';
import releaseData from '../data/dataset.v1.1.0.json';
import { LATEST_RELEASE, PAPER_RELEASE, useRelease, type Release } from './release';

export type DatasetSetting = 'ST' | 'IF' | 'MT' | 'MTIF';
export type TaskMetricId =
  | 'candidateTools' | 'connectedServices' | 'goldCalls' | 'goldTools' | 'goldServices' | 'goldUserTurns'
  | 'queryWords' | 'hiddenItems' | 'instructions' | 'checks';

export type DatasetTask = { id: string; setting: DatasetSetting } & Record<TaskMetricId, number>;

export interface ServiceStat {
  /** Released service id, for example gridwell_mail. */
  id: string;
  /** Display name in the desktop GUI, for example GridwellMail. */
  name: string;
  /** Service family used in the paper's service distribution figure. */
  family: string;
  /** Number of tools the service exposes. */
  tools: number;
  /** Number of validation tasks whose gold solution uses the service. */
  goldTasks: number;
}
export interface FamilyStat { name: string; pairs: number }
export interface RubricCategory { name: string; definition: string; example: string; IF: number; MTIF: number }

export const DATASET_SETTINGS: DatasetSetting[] = ['ST', 'IF', 'MT', 'MTIF'];

/** The statistics of one release's validation set. */
export interface DatasetStats {
  release: Release;
  taskCount: number;
  settingCounts: Record<DatasetSetting, number>;
  tasks: DatasetTask[];
  services: ServiceStat[];
  families: FamilyStat[];
  taskServicePairs: number;
  rubricCategories: RubricCategory[];
  catalog: { services: number; tools: number };
  /**
   * The statistics that the page's text quotes (for v1.0.0, the ones the
   * paper states, each reproduced from the rows at export time), plus
   * `taskCount`. Keys are referenced by the facts of datasetCopy().
   */
  stated: Record<string, number>;
  /**
   * Rubric labels of the release that the paper's nine categories do not have,
   * with the category they are counted under here. Empty for v1.0.0.
   */
  mergedRubricLabels: { label: string; countedUnder: string; rubrics: number }[];
}

type DatasetFile = typeof paperData & { mergedRubricLabels?: Record<string, { countedUnder: string; rubrics: number }> };

function read(release: Release, data: DatasetFile): DatasetStats {
  const columns = data.taskColumns as string[];
  return {
    release,
    taskCount: data.taskCount,
    settingCounts: data.settingCounts as Record<DatasetSetting, number>,
    tasks: (data.tasks as (string | number)[][]).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])) as DatasetTask),
    services: data.services as ServiceStat[],
    families: data.families as FamilyStat[],
    taskServicePairs: data.taskServicePairs,
    rubricCategories: data.rubricCategories as RubricCategory[],
    catalog: data.catalog as { services: number; tools: number },
    stated: { ...(data.stated as Record<string, number>), taskCount: data.taskCount },
    mergedRubricLabels: Object.entries(data.mergedRubricLabels ?? {}).map(([label, entry]) => ({ label, ...entry })),
  };
}

export const DATASETS: Record<Release, DatasetStats> = {
  [PAPER_RELEASE]: read(PAPER_RELEASE, paperData),
  [LATEST_RELEASE]: read(LATEST_RELEASE, releaseData as unknown as DatasetFile),
};

/** The statistics of the release selected on the page. */
export function useDataset(): DatasetStats {
  return DATASETS[useRelease()];
}

export interface TaskMetric {
  id: TaskMetricId;
  label: string;
  /** Singular unit used in sentences and tooltips, for example "tool call". */
  unit: string;
  description: string;
  /** Task settings the metric is defined for. */
  settings: DatasetSetting[];
  /** Histogram bin width; 1 means one bar per integer value. */
  binWidth: number;
}

/** Per-task quantities, in the order they are offered in the page's distribution plot. */
export const TASK_METRICS: TaskMetric[] = [
  { id: 'candidateTools', label: 'Candidate tools per task', unit: 'candidate tool', description: 'Tools of all services connected to the task. Except under OpenClaw, which retrieves tool schemas through discovery, the agent receives all of them in context.', settings: DATASET_SETTINGS, binWidth: 20 },
  { id: 'connectedServices', label: 'Connected services per task', unit: 'connected service', description: 'Services initialized for the task. Sampled services that the task does not use stay connected as distractors.', settings: DATASET_SETTINGS, binWidth: 1 },
  { id: 'goldServices', label: 'Services used by the gold solution', unit: 'service', description: 'Distinct services called by the gold solution.', settings: DATASET_SETTINGS, binWidth: 1 },
  { id: 'goldCalls', label: 'Gold tool calls per task', unit: 'tool call', description: 'Tool calls in the task’s reference (gold) solution.', settings: DATASET_SETTINGS, binWidth: 5 },
  { id: 'goldTools', label: 'Distinct tools in the gold solution', unit: 'distinct tool', description: 'Distinct tools called by the gold solution.', settings: DATASET_SETTINGS, binWidth: 2 },
  { id: 'goldUserTurns', label: 'Gold user turns per task', unit: 'user turn', description: 'The initial user request plus nonempty conversational user replies in the recorded gold solution. Authoring hints, system setup, and empty termination messages are excluded.', settings: DATASET_SETTINGS, binWidth: 1 },
  { id: 'queryWords', label: 'Query length', unit: 'word', description: 'Number of words in the user query.', settings: DATASET_SETTINGS, binWidth: 10 },
  { id: 'hiddenItems', label: 'Hidden information items per task', unit: 'hidden item', description: 'Information items held by the user simulator and absent from the services (multi-turn settings only).', settings: ['MT', 'MTIF'], binWidth: 1 },
  { id: 'instructions', label: 'Instructions per task', unit: 'instruction', description: 'Developer/user instructions with at least one check (instruction-bearing settings only).', settings: ['IF', 'MTIF'], binWidth: 1 },
  { id: 'checks', label: 'Instruction rubrics per task', unit: 'rubric', description: 'Rubrics that the instruction verifier checks (instruction-bearing settings only).', settings: ['IF', 'MTIF'], binWidth: 1 },
];
export const taskMetricById = (id: TaskMetricId) => TASK_METRICS.find(metric => metric.id === id)!;

/** Tasks of the given settings for which the metric is defined. Pass no settings for all applicable tasks. */
export function tasksForMetric(dataset: DatasetStats, metric: TaskMetricId, settings?: DatasetSetting[]): DatasetTask[] {
  const allowed = taskMetricById(metric).settings.filter(setting => !settings || settings.includes(setting));
  return dataset.tasks.filter(task => allowed.includes(task.setting));
}

/** Quantile with linear interpolation between order statistics (numpy's default). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export interface Summary { n: number; min: number; q1: number; median: number; q3: number; max: number; mean: number }
export function summarize(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1);
  return { n: sorted.length, min: sorted[0], q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75), max: sorted[sorted.length - 1], mean };
}

export interface HistogramBin {
  /** Inclusive lower bound and exclusive upper bound; for binWidth 1 the bin is the single value `from`. */
  from: number;
  to: number;
  count: number;
  tasks: DatasetTask[];
}

/** Equal-width histogram of one metric. Bins start at a multiple of the bin width and cover every value. */
export function histogram(metric: TaskMetricId, tasks: DatasetTask[], binWidth = taskMetricById(metric).binWidth): HistogramBin[] {
  if (!tasks.length) return [];
  const values = tasks.map(task => task[metric]);
  const start = Math.floor(Math.min(...values) / binWidth) * binWidth;
  const end = Math.floor(Math.max(...values) / binWidth) * binWidth;
  const bins: HistogramBin[] = [];
  for (let from = start; from <= end; from += binWidth) bins.push({ from, to: from + binWidth, count: 0, tasks: [] });
  for (const task of tasks) {
    const bin = bins[Math.floor((task[metric] - start) / binWidth)];
    bin.count += 1;
    bin.tasks.push(task);
  }
  return bins;
}

/** A count or statistic as the paper prints it: whole numbers without decimals, otherwise one decimal. */
export function formatStat(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString('en-US') : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Share in percent with one decimal, for example "22.7%". */
export function formatShare(part: number, whole: number): string {
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`;
}
