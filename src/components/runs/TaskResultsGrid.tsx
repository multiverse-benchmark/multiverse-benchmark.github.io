import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import type { ExplorerTaskType } from '@/types';
import { dataRoot } from '@/lib/release';
import { RUNS_RELEASE, harnessName, runHash, useRunIndex, type Loaded, type RunIndex } from '@/lib/runs';
import { fetchStaticJson } from '@/lib/staticData';
import { Segmented, type SegmentedOption } from '../paper/shared';
import { TERMINATION_COPY } from './copy';
import { HarnessBadge } from './HarnessBadge';
import './runs.css';

/*
 * The result explorer of the deep dive: the results behind the validation
 * leaderboard of the latest release, with one row per validation task, one
 * column per model and harness, and in each cell the outcome of its submitted
 * run. It is always open.
 *
 * A cell is a link to that run in the task explorer (its "Trajectories" tab),
 * which shows the verdict of each verifier and the trajectory. The task's
 * name opens the same tab without choosing a model.
 *
 * Reads the run index (src/lib/runs.ts) and the task list of the release, the
 * file the task explorer on this page reads as well.
 */

interface TaskEntry { id: string; title: string; taskType: ExplorerTaskType; validationIndex?: number }

type SettingFilter = 'all' | ExplorerTaskType;
type Order = 'tasks' | 'passed';

const SETTING_OPTIONS: SegmentedOption<SettingFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'ST', label: 'ST', title: 'Single-turn' },
  { value: 'IF', label: 'IF', title: 'Instruction following' },
  { value: 'MT', label: 'MT', title: 'Multi-turn' },
  { value: 'MTIF', label: 'MTIF', title: 'Multi-turn + instruction following' },
];
const ORDER_OPTIONS: SegmentedOption<Order>[] = [
  { value: 'tasks', label: 'Task order' },
  { value: 'passed', label: 'Fewest passes first' },
];

function useTasks(): Loaded<TaskEntry[]> {
  const [state, setState] = useState<Loaded<TaskEntry[]>>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fetchStaticJson<TaskEntry[] | { tasks: TaskEntry[] }>(`${dataRoot(RUNS_RELEASE)}tasks.json`, controller.signal).then(
      payload => { if (!controller.signal.aborted) setState({ status: 'loaded', value: Array.isArray(payload) ? payload : payload.tasks }); },
      error => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'The task list could not be loaded.' }); },
    );
    return () => controller.abort();
  }, []);
  return state;
}

function Grid({ index, tasks }: { index: RunIndex; tasks: TaskEntry[] }) {
  const [setting, setSetting] = useState<SettingFilter>('all');
  const [order, setOrder] = useState<Order>('tasks');
  const rows = useMemo(() => {
    const shown = tasks.filter(task => index.scoredCount(task.id) > 0 && (setting === 'all' || task.taskType === setting));
    return order === 'tasks' ? shown : [...shown].sort((a, b) => index.passedCount(a.id) - index.passedCount(b.id));
  }, [index, tasks, setting, order]);

  return <div className="rg-panel" style={{ '--rg-model-count': index.models.length } as CSSProperties}>
    <div className="rg-controls">
      <Segmented label="Task setting" options={SETTING_OPTIONS} value={setting} onChange={setSetting} />
      <Segmented label="Order" options={ORDER_OPTIONS} value={order} onChange={setOrder} />
      <span className="rg-count" aria-live="polite">{rows.length} tasks × {index.models.length} entries</span>
    </div>
    <p className="rg-scroll-hint">Scroll sideways to see all results.</p>
    <div className="rg-scroll" tabIndex={0} role="group" aria-label="Results of each model on each task, scrollable">
      <table className="rg-table">
        <caption className="mv-visually-hidden">Outcome of each model and harness on each validation task. A cell links to the run. A dash means no submitted run.</caption>
        <thead>
          <tr>
            <th scope="col" className="rg-task-head">Task</th>
            {index.models.map(model => <th key={model.id} scope="col" className="rg-model-head"><span className="rg-model-name">{model.name}</span><HarnessBadge harness={model.harness} /></th>)}
            <th scope="col" className="rg-passed-head">Runs passed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(task => <tr key={task.id} data-rg-task={task.id}>
            <th scope="row" className="rg-task">
              <div className="rg-task-content">
                <span className="rg-setting">{task.taskType}</span>
                <a href={`#${runHash(task.id)}`} title={task.title}>{task.title}</a>
              </div>
            </th>
            {index.models.map(model => {
              const cell = index.cell(task.id, model.id);
              if (!cell) return <td key={model.id}><span className="rg-missing" data-rg-missing aria-label={`${model.name}, ${harnessName(model.harness)}: no submitted run`} title="No submitted run">—</span></td>;
              const ending = cell.termination === 'completed' ? '' : `, ${(TERMINATION_COPY[cell.termination]?.label ?? cell.termination).toLowerCase()}`;
              const label = `${task.title} — ${model.name}, ${harnessName(model.harness)}: ${cell.passed ? 'passed' : 'failed'}${ending}`;
              return <td key={model.id}>
                <a className="rg-cell" data-passed={cell.passed} href={`#${runHash(task.id, model.id)}`} aria-label={label} title={label}>
                  <span className="rg-mark" data-passed={cell.passed} aria-hidden="true">{cell.passed ? <Check size={14} strokeWidth={2} /> : <X size={14} strokeWidth={2} />}</span>
                </a>
              </td>;
            })}
            <td className="rg-passed"><strong>{index.passedCount(task.id)}</strong><span> / {index.scoredCount(task.id)}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>  </div>;
}

export function TaskResultsGrid() {
  const index = useRunIndex();
  const tasks = useTasks();
  const failure = index.status === 'error' ? index.message : tasks.status === 'error' ? tasks.message : null;
  return <div className="rg" data-runs-grid>
    <div className="rg-heading">
      <ul className="rg-key" aria-label="Outcome legend">
        <li title="The run passed every applicable verifier"><span className="rg-mark" data-passed="true" aria-hidden="true"><Check size={14} strokeWidth={2} /></span><span>Passed<span className="mv-visually-hidden"> every applicable verifier</span></span></li>
        <li title="The run failed at least one verifier"><span className="rg-mark" data-passed="false" aria-hidden="true"><X size={14} strokeWidth={2} /></span><span>Failed<span className="mv-visually-hidden"> at least one verifier</span></span></li>
      </ul>
    </div>
    {failure
      ? <p className="rg-status" role="alert">The results could not be loaded. {failure}</p>
      : index.status === 'loaded' && tasks.status === 'loaded'
        ? <Grid index={index.value} tasks={tasks.value} />
        : <p className="rg-status" role="status">Loading the results…</p>}
  </div>;
}
