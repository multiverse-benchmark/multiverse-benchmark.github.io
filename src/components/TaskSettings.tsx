import { ArrowRight, Check, Minus } from 'lucide-react';
import { TASK_SETTINGS, TASK_SETTING_FACTORS } from '../content/paper';
import { useDataset } from '../lib/dataset';
import { TASK_EXPLORER_URL } from './site/SiteChrome';
import './paper/paper.css';
import './task-settings.css';

/** Whether a setting has a factor: a mark and, for assistive technology, a word. */
function Mark({ on }: { on: boolean }) {
  return <span className="tset-mark" data-on={on ? 'true' : 'false'}>
    {on ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : <Minus size={15} strokeWidth={2} aria-hidden="true" />}
    <span className="mv-visually-hidden">{on ? 'Yes' : 'No'}</span>
  </span>;
}

/**
 * The four task settings as one comparison: what each setting adds to a task
 * (additional instructions, information that only the user holds), how many
 * validation tasks it has in the release that is shown, and what its tasks
 * test.
 */
export function TaskSettings() {
  const { settingCounts: DATASET_SETTING_COUNTS, release } = useDataset();
  return <div className="tset" data-tset-release={release}>
    <table className="tset-table">
      <caption className="mv-visually-hidden">The four task settings and the two respects in which they differ</caption>
      <thead>
        <tr>
          <th scope="col">Task setting</th>
          <th scope="col" className="tset-num">Validation tasks</th>
          {TASK_SETTING_FACTORS.map(factor => <th key={factor.id} scope="col" className="tset-factor">{factor.label}</th>)}
          <th scope="col">What the tasks test</th>
        </tr>
      </thead>
      <tbody>
        {TASK_SETTINGS.map(setting => <tr key={setting.id} data-tset={setting.id}>
          <th scope="row" className="tset-name">
            <span className="tset-name-inner"><span className="setting-code">{setting.id}</span><span>{setting.name}</span></span>
          </th>
          <td className="tset-num" data-label="Validation tasks">{DATASET_SETTING_COUNTS[setting.id]}</td>
          {TASK_SETTING_FACTORS.map(factor => <td key={factor.id} className="tset-factor" data-label={factor.label} data-factor={factor.id}>
            <Mark on={setting[factor.id]} />
          </td>)}
          <td className="tset-tests" data-label="What the tasks test">{setting.tests}</td>
        </tr>)}
      </tbody>
    </table>
    {/* The task explorer is on the deep-dive page. */}
    <a href={TASK_EXPLORER_URL} className="text-button">Find these tasks in the explorer <ArrowRight size={16} /></a>
  </div>;
}
