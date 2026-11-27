/**
 * The runs behind the validation leaderboard of the latest release: for every
 * model, harness and validation task, one submitted scored trajectory.
 *
 * scripts/export_runs.py writes them next to the task files of the release:
 *
 *   data/v1.1.0/runs/index.json                 the outcome and the verdict of
 *                                               each verifier, per task and model
 *   data/v1.1.0/runs/<entry>/<task>.json.gz     one run: the verifiers with
 *                                               their votes, and the trajectory
 *
 * The task explorer shows them in the "Trajectories" tab of a task
 * (components/runs/TaskRuns.tsx). The index is small and is read once per
 * visit; a run is read when it is opened. Only the validation set of the
 * latest release has runs here: the
 * paper's release reports its results from several runs under five harnesses,
 * and the test tasks are hidden.
 */
import { useEffect, useState } from 'react';
import type { ReferenceTrajectoryStep } from '@/types';
import { LATEST_RELEASE, dataRoot, type Release } from './release';
import { RESULTS, type Model } from './results';
import { fetchStaticJson } from './staticData';

export const RUNS_RELEASE: Release = LATEST_RELEASE;
export const hasRuns = (release: Release): boolean => release === RUNS_RELEASE;

/** The verifiers, in the order the page lists them. Names and descriptions: VERIFIER_COPY in components/runs/copy.ts. */
export const VERIFIER_IDS = ['assertion', 'dbdiff', 'response', 'instruction'] as const;
export type VerifierId = typeof VERIFIER_IDS[number];
export type Verdict = 'pass' | 'fail' | 'na';

/** One model's run of one task, as the index holds it. */
export interface RunCell {
  passed: boolean;
  verdicts: Record<VerifierId, Verdict>;
  /** "completed", or why the run ended early. */
  termination: string;
}

/** One submitted model/harness combination. Its id is the storage and deep-link key. */
export interface RunModel extends Model {
  /** Base model identity, shared by submissions under different harnesses. */
  modelId: string;
  /** Harness id recorded in the submitted run files. */
  harness: string;
}

export interface RunModelEntry {
  id: string;
  modelId: string;
  harness: string;
  name?: string;
}

export interface RunIndexFile {
  schemaVersion: number;
  release: string;
  split: string;
  /** The harness of the entries given as a plain string; an entry given as an object carries its own. */
  harness?: string;
  models: (string | RunModelEntry)[];
  verifiers: string[];
  /** One slot per entry: P/F for the run, then p/f/n per verifier. Null or an omitted trailing slot is unsubmitted. */
  cells: Record<string, (string | null)[]>;
  /** Terminations are keyed by task id, then the unique submission entry id. */
  terminations?: Record<string, Record<string, string>>;
}

export interface RunIndex {
  /** Submitted model/harness entries, in their source order. */
  models: RunModel[];
  taskIds: string[];
  cell(taskId: string, entryId: string): RunCell | undefined;
  /** How many submitted entries have a scored result for the task. */
  scoredCount(taskId: string): number;
  /** How many submitted entries passed the task. */
  passedCount(taskId: string): number;
}

const VERDICT_OF: Record<string, Verdict> = { p: 'pass', f: 'fail', n: 'na' };

/** Known harness ids use the source results' display names; custom harness names stay intact. */
export const harnessName = (harness: string): string =>
  RESULTS['paper-validation'].harnesses.find(entry => entry.id === harness)?.name ?? harness;

export function readRunIndex(file: RunIndexFile): RunIndex {
  if (file.schemaVersion !== 1 || file.release !== RUNS_RELEASE || file.split !== 'validation'
    || !Array.isArray(file.verifiers) || file.verifiers.join() !== VERIFIER_IDS.join()
    || !Array.isArray(file.models) || !file.models.length) throw new Error('The run index has an unexpected format.');
  const known = new Map(RESULTS.validation.models.map(model => [model.id, model]));
  const models: RunModel[] = file.models.map(entry => {
    const source: { id: string; modelId: string; harness?: string; name?: string } =
      typeof entry === 'string' ? { id: entry, modelId: entry, harness: file.harness } : entry;
    if (!source || [source.id, source.modelId, source.harness].some(value => typeof value !== 'string' || !value.trim())
      || (source.name !== undefined && (typeof source.name !== 'string' || !source.name.trim()))) {
      throw new Error('Every run entry must name its identity, base model and harness.');
    }
    const base = known.get(source.modelId);
    return {
      ...(base ?? { name: source.modelId, developer: '', access: 'closed' as const, reference: false }),
      id: source.id,
      modelId: source.modelId,
      harness: source.harness!,
      name: source.name ?? base?.name ?? source.modelId,
    };
  });
  const position = new Map(models.map((model, index) => [model.id, index]));
  if (position.size !== models.length) throw new Error('Run entry ids must be unique across model and harness submissions.');
  const cells = new Map<string, (RunCell | undefined)[]>();
  for (const [taskId, codes] of Object.entries(file.cells)) {
    if (!Array.isArray(codes) || codes.length > models.length) throw new Error(`The run index has unexpected cells for task ${taskId}.`);
    cells.set(taskId, models.map((model, index) => {
      const code = codes[index];
      if (code == null) return undefined;
      if (typeof code !== 'string' || !/^[PF][pfn]{4}$/.test(code)) throw new Error(`The run index has an invalid result for ${taskId}/${model.id}.`);
      return {
        passed: code[0] === 'P',
        verdicts: Object.fromEntries(VERIFIER_IDS.map((id, at) => [id, VERDICT_OF[code[at + 1]]])) as Record<VerifierId, Verdict>,
        termination: file.terminations?.[taskId]?.[model.id] ?? 'completed',
      };
    }));
  }
  return {
    models,
    taskIds: Object.keys(file.cells),
    cell: (taskId, entryId) => cells.get(taskId)?.[position.get(entryId) ?? -1],
    scoredCount: taskId => cells.get(taskId)?.filter(cell => cell !== undefined).length ?? 0,
    passedCount: taskId => cells.get(taskId)?.filter(cell => cell?.passed).length ?? 0,
  };
}

const runsRoot = `${dataRoot(RUNS_RELEASE)}runs/`;
let indexRequest: Promise<RunIndex> | null = null;

/** The index, requested once per visit. A failed request is tried again on the next call. */
export function loadRunIndex(): Promise<RunIndex> {
  if (!indexRequest) {
    indexRequest = fetchStaticJson<RunIndexFile>(`${runsRoot}index.json`).then(readRunIndex);
    indexRequest.catch(() => { indexRequest = null; });
  }
  return indexRequest;
}

export type Loaded<T> = { status: 'loading' } | { status: 'loaded'; value: T } | { status: 'error'; message: string };

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function useRunIndex(): Loaded<RunIndex> {
  const [state, setState] = useState<Loaded<RunIndex>>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    loadRunIndex().then(
      value => { if (current) setState({ status: 'loaded', value }); },
      error => { if (current) setState({ status: 'error', message: messageOf(error, 'The run index could not be loaded.') }); },
    );
    return () => { current = false; };
  }, []);
  return state;
}

/** One vote of an LLM verifier: its verdict and the rationale it gave. */
export interface RunVote { passed: boolean; text: string }

export interface RunVerifier {
  id: VerifierId;
  /** False when the task has nothing for this verifier to check. */
  applicable: boolean;
  passed?: boolean;
  /** Assertion code: the message of the assertion that failed, when it has one. */
  message?: string;
  /** LLM verifiers: the votes, and which of them gives the rationale shown first. */
  votes?: RunVote[];
  shown?: number;
}

export interface Run {
  taskId: string;
  /** Base model id, which can occur under more than one submitted harness. */
  modelId: string;
  harness: string;
  setting: string;
  passed: boolean;
  termination: string;
  verifiers: RunVerifier[];
  toolCalls: number;
  modelCalls: number | null;
  turns: number | null;
  finalResponse: string;
  steps: ReferenceTrajectoryStep[];
}

export function useRun(taskId: string, model: RunModel): Loaded<Run> {
  const [state, setState] = useState<Loaded<Run>>({ status: 'loading' });
  const { id: entryId, modelId, harness } = model;
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchStaticJson<Run>(`${runsRoot}${encodeURIComponent(entryId)}/${encodeURIComponent(taskId)}.json.gz`, controller.signal).then(
      value => {
        if (controller.signal.aborted) return;
        if (value.taskId !== taskId || value.modelId !== modelId || value.harness !== harness) setState({ status: 'error', message: 'The file request returned another model or harness run. Please retry.' });
        else setState({ status: 'loaded', value });
      },
      error => { if (!controller.signal.aborted) setState({ status: 'error', message: messageOf(error, 'The run could not be loaded.') }); },
    );
    return () => controller.abort();
  }, [taskId, entryId, modelId, harness]);
  return state;
}

/** The section of a task in the task explorer that shows the models' runs (its "Trajectories" tab). */
export const RUNS_SECTION = 'trajectories';

/** The model query parameter identifies a unique submission entry. */
export const runHash = (taskId: string, entryId?: string): string =>
  `task=${encodeURIComponent(taskId)}&section=${RUNS_SECTION}${entryId ? `&model=${encodeURIComponent(entryId)}` : ''}`;
