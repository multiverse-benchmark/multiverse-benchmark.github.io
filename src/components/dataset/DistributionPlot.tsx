/**
 * "What a task involves": the distribution of one per-task quantity over the
 * validation tasks, for all applicable tasks or within one task setting.
 *
 * Geometry. The horizontal axis always covers every task the quantity is
 * defined for, so it stays in place when the setting changes; bins outside
 * the selected tasks' range are empty slots. The count axis has one scale for
 * all tasks and one shared by the single settings, which have about the same
 * number of tasks, so that settings can be compared by switching.
 */
import { useId, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { datasetCopy } from '../../content/dataset';
import {
  DATASET_SETTINGS, TASK_METRICS, formatShare, formatStat, histogram, summarize, taskMetricById, tasksForMetric, useDataset,
  type DatasetSetting, type DatasetStats, type DatasetTask, type TaskMetric, type TaskMetricId,
} from '../../lib/dataset';
import { PAPER_RELEASE } from '../../lib/release';
import { settingById } from '../../lib/results';
import {
  ChartTooltip, ChoiceGroup, DataTable, TablePanel, TableToggle, capitalize, countScale, listOf, plural, useElementWidth, useMarks,
  type ChoiceOption,
} from './chart-parts';

type SettingChoice = 'All' | DatasetSetting;

/** One position on the horizontal axis. `inRange` is false for a slot outside the bins of the selected tasks. */
interface Slot { from: number; to: number; count: number; tasks: DatasetTask[]; inRange: boolean }

function distributionOf(dataset: DatasetStats, metric: TaskMetric, setting: SettingChoice) {
  const valueOf = (task: DatasetTask) => task[metric.id];
  const applicable = tasksForMetric(dataset, metric.id);
  const tasks = setting === 'All' ? applicable : tasksForMetric(dataset, metric.id, [setting]);
  // The slots are the bins of all applicable tasks; the bins of the selected tasks fill the ones they cover.
  const selected = new Map(histogram(metric.id, tasks).map(bin => [bin.from, bin]));
  const slots: Slot[] = histogram(metric.id, applicable).map(({ from, to }) => {
    const bin = selected.get(from);
    return { from, to, count: bin?.count ?? 0, tasks: bin?.tasks ?? [], inRange: Boolean(bin) };
  });
  const bySetting = metric.settings.map(id => {
    const subset = tasksForMetric(dataset, metric.id, [id]);
    return {
      id,
      summary: summarize(subset.map(valueOf)),
      peak: Math.max(...histogram(metric.id, subset).map(bin => bin.count)),
    };
  });
  // The count axis reaches the tallest column of all tasks, or of any single setting when one setting is shown.
  const peak = setting === 'All' ? Math.max(...slots.map(slot => slot.count)) : Math.max(...bySetting.map(entry => entry.peak));
  const summary = summarize(tasks.map(valueOf));
  return {
    slots,
    bySetting,
    summary,
    scale: countScale(peak),
    // The first task in data order with the extreme value.
    most: tasks.find(task => valueOf(task) === summary.max)!,
    fewest: tasks.find(task => valueOf(task) === summary.min)!,
  };
}
type Distribution = ReturnType<typeof distributionOf>;

/**
 * Horizontal axis. With one bar per integer a value sits at the centre of its
 * bar; with wider bins the axis is continuous and labels mark bin edges.
 */
function axisOf(metric: TaskMetric, slots: Slot[]) {
  const start = slots[0].from;
  const end = slots[slots.length - 1].to;
  const discrete = metric.binWidth === 1;
  const at = (value: number) => (discrete ? (value - start + 0.5) / slots.length : (value - start) / (end - start));
  return { end, discrete, at };
}

/** Width of one digit of an axis label (11px Manrope, tabular figures) and the least space between two labels. */
const DIGIT_WIDTH = 6.6;
const LABEL_GAP = 18;
const LABEL_EVERY = [1, 2, 5, 10, 20, 50];

/** Axis labels that fit side by side: every bin where there is room, otherwise every second, fifth, tenth, and so on. */
function labelledValues(metric: TaskMetric, slots: Slot[], plotWidth: number): number[] {
  if (plotWidth <= 0) return [];
  const { end, discrete } = axisOf(metric, slots);
  const values = discrete ? slots.map(slot => slot.from) : [...slots.map(slot => slot.from), end];
  const widest = formatStat(values[values.length - 1]).length * DIGIT_WIDTH + LABEL_GAP;
  const slotWidth = plotWidth / slots.length;
  const every = LABEL_EVERY.find(step => step * slotWidth >= widest) ?? LABEL_EVERY[LABEL_EVERY.length - 1];
  const labelled = values.filter(value => value % (every * metric.binWidth) === 0);
  return labelled.length >= 2 ? labelled : [values[0], values[values.length - 1]];
}

/** "120 to 139 candidate tools", or "6 connected services" when each bar is one value. */
function binText(metric: TaskMetric, slot: Slot): string {
  return metric.binWidth === 1
    ? `${formatStat(slot.from)} ${plural(metric.unit, slot.from)}`
    : `${formatStat(slot.from)} to ${formatStat(slot.to - 1)} ${plural(metric.unit, 2)}`;
}

const countIn = (slot: Slot, setting: DatasetSetting) => slot.tasks.filter(task => task.setting === setting).length;

/** The selected tasks in words: the setting, "all settings", or "MT and MTIF" for a quantity that only those settings have. */
function selectionOf(metric: TaskMetric, setting: SettingChoice): string {
  if (setting !== 'All') return setting;
  return metric.settings.length === DATASET_SETTINGS.length ? 'all settings' : listOf(metric.settings);
}

function MarkerGlyph({ kind }: { kind: 'median' | 'mean' }): JSX.Element {
  return <svg className={`dst-glyph dst-glyph--${kind}`} width="9" height="8" viewBox="0 0 9 8" aria-hidden="true" focusable="false">
    <path d={kind === 'median' ? 'M0 0.25h9L4.5 7.75z' : 'M0.9 0.9h7.2L4.5 6.9z'} />
  </svg>;
}

function Histogram({ metric, setting, view }: { metric: TaskMetric; setting: SettingChoice; view: Distribution }): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const [plot, plotWidth] = useElementWidth<HTMLDivElement>();
  const hintId = useId();
  const { slots, summary, scale } = view;
  const marks = useMarks(slots.length, 'x', plot);
  const axis = axisOf(metric, slots);
  const selection = setting === 'All' ? '' : `${setting} `;

  const indexAt = (clientX: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || !box.width) return 0;
    return Math.min(slots.length - 1, Math.max(0, Math.floor(((clientX - box.left) / box.width) * slots.length)));
  };
  const slotBox = (index: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return null;
    const width = box.width / slots.length;
    return { left: box.left + index * width, right: box.left + (index + 1) * width, top: box.top, bottom: box.bottom };
  };
  const shareText = (slot: Slot) => `${formatShare(slot.count, summary.n)} of the ${formatStat(summary.n)} ${selection}tasks`;
  const describe = (slot: Slot) => {
    const split = setting === 'All' ? ` ${metric.settings.map(id => `${id} ${formatStat(countIn(slot, id))}`).join(', ')}.` : '';
    return `${binText(metric, slot)}: ${formatStat(slot.count)} ${plural('task', slot.count)}, ${shareText(slot)}.${split}`;
  };
  const active = marks.active === null ? null : slots[marks.active];

  return <div className="dst-hist" ref={frame} style={{ '--dst-n': slots.length } as CSSProperties}>
    <div className="dst-hist-head">
      <span className="dst-axis-title" aria-hidden="true">Tasks</span>
      <ul className="dst-key" aria-label="Markers in the plot">
        <li><MarkerGlyph kind="median" />Median <b>{formatStat(summary.median)}</b></li>
        <li><MarkerGlyph kind="mean" />Mean <b>{formatStat(summary.mean)}</b></li>
      </ul>
    </div>

    <div className="dst-hist-body">
      <div className="dst-yaxis" aria-hidden="true">
        {scale.ticks.map(tick => <span key={tick} className="dst-ytick" style={{ bottom: `${(tick / scale.max) * 100}%` }}>{formatStat(tick)}</span>)}
      </div>
      <div
        ref={plot}
        className="dst-plot"
        role="group"
        aria-label={`${metric.label}, ${selectionOf(metric, setting)}: histogram of ${formatStat(summary.n)} tasks`}
        aria-describedby={hintId}
        data-dst-plot={metric.id}
        data-dst-ymax={scale.max}
        onPointerMove={event => { if (event.pointerType !== 'touch') marks.hover(indexAt(event.clientX)); }}
        onPointerLeave={() => marks.hover(null)}
        onClick={event => marks.focusMark(indexAt(event.clientX))}
      >
        {marks.active !== null && <span className="dst-band" aria-hidden="true" style={{ '--dst-i': marks.active } as CSSProperties} />}
        {scale.ticks.slice(1).map(tick => <span key={tick} className="dst-gridline" aria-hidden="true" style={{ bottom: `calc(${(tick / scale.max) * 100}% - 1px)` }} />)}
        {/* Keyed by quantity: a new quantity draws new columns, a new setting changes the height of the same ones. */}
        <div className="dst-cols" key={metric.id}>
          {/* The two rules lie behind the columns: they show above a column and between columns. */}
          <span className="dst-marker dst-marker--mean" aria-hidden="true" style={{ left: `${axis.at(summary.mean) * 100}%` }}><MarkerGlyph kind="mean" /></span>
          <span className="dst-marker dst-marker--median" aria-hidden="true" style={{ left: `${axis.at(summary.median) * 100}%` }}><MarkerGlyph kind="median" /></span>
          {slots.map((slot, index) => <div
            key={slot.from}
            className="dst-col"
            role="img"
            aria-label={describe(slot)}
            {...(slot.inRange ? { 'data-dst-bin': slot.from, 'data-count': slot.count } : { 'data-dst-pad': slot.from })}
            style={{ '--dst-i': index, height: `${(slot.count / scale.max) * 100}%` } as CSSProperties}
            {...marks.markProps(index)}
          />)}
        </div>
      </div>
    </div>

    <div className={axis.discrete ? 'dst-xaxis' : 'dst-xaxis dst-xaxis--edges'} aria-hidden="true">
      {labelledValues(metric, slots, plotWidth).map(value => <span key={value} className="dst-xtick" style={{ left: `${axis.at(value) * 100}%` }}>{formatStat(value)}</span>)}
    </div>
    <p className="dst-xaxis-title" aria-hidden="true">{metric.label}</p>
    <span id={hintId} hidden>Use the left and right arrow keys to move between columns.</span>

    {active && marks.active !== null && <ChartTooltip
      container={frame}
      anchorKey={`${metric.id}:${setting}:${marks.active}:${plotWidth}:${marks.byKeyboard}`}
      anchor={() => slotBox(marks.active!)}
      fallback="beside"
    >
      <p className="dst-tip-title">{binText(metric, active)}</p>
      <p className="dst-tip-value"><strong>{formatStat(active.count)}</strong> {plural('task', active.count)}</p>
      <p className="dst-tip-line">{shareText(active)}</p>
      {setting === 'All' && <dl className="dst-tip-split">
        {metric.settings.map(id => <div key={id}><dt>{id}</dt><dd>{formatStat(countIn(active, id))}</dd></div>)}
      </dl>}
      {marks.byKeyboard && <p className="dst-tip-keys">Arrow keys move between columns.</p>}
    </ChartTooltip>}
  </div>;
}

/**
 * The definition and the release's statistics for a quantity. The texts of all
 * quantities are rendered, and only the selected one is visible and exposed to
 * assistive technology: in the medium and wide layouts they share one grid
 * cell (see .dst-stack), so the block is as tall as the longest text and the
 * card keeps its height when the quantity changes.
 */
function QuantityTexts({ current, parts, definitionId, notes, noteLabel }: {
  current: TaskMetricId;
  parts: ('definition' | 'note')[];
  definitionId: string;
  /** The sentence shown for each quantity, with the numbers of the release that is shown. */
  notes: Record<TaskMetricId, string>;
  noteLabel: string;
}): JSX.Element {
  return <>
    {TASK_METRICS.map(entry => {
      const selected = entry.id === current;
      return <dl key={entry.id} className="dst-notes" data-current={selected || undefined} aria-hidden={selected ? undefined : true}>
        {parts.includes('definition') && <div>
          <dt>Definition</dt>
          <dd id={selected ? definitionId : undefined} data-dst-definition={selected ? '' : undefined}>{entry.description}</dd>
        </div>}
        {parts.includes('note') && <div>
          <dt>{noteLabel}</dt>
          <dd data-dst-note={selected ? '' : undefined}>{notes[entry.id]}</dd>
        </div>}
      </dl>;
    })}
  </>;
}

/** The card: quantity and setting selectors, the histogram, its summary, the paper's sentence, and links to the extremes. */
export function DistributionCard({ wide }: { wide: boolean }): JSX.Element {
  const [metricId, setMetricId] = useState<TaskMetricId>(TASK_METRICS[0].id);
  const [setting, setSetting] = useState<SettingChoice>('All');
  const [tableOpen, setTableOpen] = useState(false);
  const titleId = useId();
  const selectId = useId();
  const tableId = useId();
  const definitionId = useId();
  const metric = taskMetricById(metricId);
  const dataset = useDataset();
  const DATASET = useMemo(() => datasetCopy(dataset), [dataset]);
  // The paper states these sentences for its own release (v1.0.0); for a later release they carry that release's numbers.
  const noteLabel = dataset.release === PAPER_RELEASE && metricId !== 'goldUserTurns' ? 'From the paper' : `In ${dataset.release}`;
  const view = useMemo(() => distributionOf(dataset, metric, setting), [dataset, metric, setting]);
  const { summary } = view;
  const units = plural(metric.unit, 2);
  const selectionText = selectionOf(metric, setting);
  const restricted = metric.settings.length < DATASET_SETTINGS.length;

  function chooseMetric(id: TaskMetricId) {
    setMetricId(id);
    // A setting the new quantity is not defined for falls back to all tasks.
    if (setting !== 'All' && !taskMetricById(id).settings.includes(setting)) setSetting('All');
  }

  const unavailable = `${capitalize(units)} exist only in ${listOf(metric.settings)} tasks.`;
  const settingOptions: ChoiceOption<SettingChoice>[] = [
    { value: 'All', label: 'All', ariaLabel: restricted ? `All: ${listOf(metric.settings)}` : 'All settings', title: 'All tasks the quantity is defined for' },
    ...DATASET_SETTINGS.map((id): ChoiceOption<SettingChoice> => {
      const name = settingById(id).description;
      return metric.settings.includes(id)
        ? { value: id, label: id, ariaLabel: `${id}: ${name}`, title: name }
        : { value: id, label: id, ariaLabel: `${id}: ${name}. ${unavailable}`, title: unavailable, disabled: true };
    }),
  ];

  const stats: [string, string, number][] = [
    ['n', 'Tasks', summary.n],
    ['median', 'Median', summary.median],
    ['mean', 'Mean', summary.mean],
    ['min', 'Minimum', summary.min],
    ['max', 'Maximum', summary.max],
  ];

  return <section className="dst-card mv-card dst-dist" aria-labelledby={titleId} data-dst-distribution="">
    <header className="dst-card-head">
      <h3 id={titleId} className="dst-card-title">{DATASET.distribution.title}</h3>
    </header>

    <div className="dst-dist-grid">
      {/* Quantity options sit beside the plot where there is room, otherwise in a native select. */}
      {wide && <div className="dst-quantity">
        <ChoiceGroup
          label="Quantity"
          variant="list"
          options={TASK_METRICS.map(entry => ({ value: entry.id, label: entry.label }))}
          value={metricId}
          onChange={chooseMetric}
          hook="data-dst-metric"
          describedBy={definitionId}
        />
        <div className="dst-quantity-text dst-stack">
          <QuantityTexts current={metricId} parts={['definition']} definitionId={definitionId} notes={DATASET.distribution.notes} noteLabel={noteLabel} />
        </div>
      </div>}

      <div className="dst-dist-main">
        <div className="dst-dist-controls">
          {!wide && <div className="dst-select-field">
            <label className="mv-seg-label" htmlFor={selectId}>Quantity</label>
            <span className="dst-select-box">
              <select
                id={selectId}
                className="dst-select"
                data-dst-metric={metricId}
                aria-describedby={definitionId}
                value={metricId}
                onChange={event => chooseMetric(event.target.value as TaskMetricId)}
              >
                {TASK_METRICS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </div>}
          <ChoiceGroup label="Task setting" variant="segmented" options={settingOptions} value={setting} onChange={setSetting} hook="data-dst-setting" />
        </div>

        <figure className="dst-figure" aria-label={`${metric.label}, ${selectionText}`}>
          <Histogram metric={metric} setting={setting} view={view} />

          <div className="dst-side">
            <dl className="dst-summary">
              {stats.map(([key, label, value]) => <div key={key} className="dst-summary-row">
                <dt>{label}</dt>
                <dd data-dst-summary={key}>{formatStat(value)}</dd>
              </div>)}
            </dl>
            <table className="dst-medians">
              <caption>Median by task setting</caption>
              <thead>
                <tr>{view.bySetting.map(entry => <th key={entry.id} scope="col" data-current={entry.id === setting || undefined}>{entry.id}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{view.bySetting.map(entry => <td key={entry.id} data-dst-median={entry.id} data-current={entry.id === setting || undefined}>{formatStat(entry.summary.median)}</td>)}</tr>
              </tbody>
            </table>
          </div>

          {/* Wide: the definition is under the list of quantities, and the caption is the paper's sentence. */}
          <figcaption className="dst-caption dst-stack">
            <QuantityTexts current={metricId} parts={wide ? ['note'] : ['definition', 'note']} definitionId={definitionId} notes={DATASET.distribution.notes} noteLabel={noteLabel} />
          </figcaption>
        </figure>

        <p className="mv-visually-hidden" aria-live="polite" aria-atomic="true" data-dst-live="">
          {`${metric.label}, ${selectionText}: ${formatStat(summary.n)} tasks, median ${formatStat(summary.median)}, mean ${formatStat(summary.mean)}, minimum ${formatStat(summary.min)}, maximum ${formatStat(summary.max)}.`}
        </p>

        <div className="dst-foot">
          <ul className="dst-links">
            <li>
              {/* The task explorer is on this page: the link opens the task in it, for the release that is shown. */}
              <a className="mv-link dst-link" href={`#task=${encodeURIComponent(view.most.id)}`} data-dst-extreme="max">
                Open the task with the most {units} <span className="dst-nowrap">({formatStat(summary.max)})<ArrowUpRight size={13} aria-hidden="true" /></span>
              </a>
            </li>
            <li>
              <a className="mv-link dst-link" href={`#task=${encodeURIComponent(view.fewest.id)}`} data-dst-extreme="min">
                Open the task with the fewest {units} <span className="dst-nowrap">({formatStat(summary.min)})<ArrowUpRight size={13} aria-hidden="true" /></span>
              </a>
            </li>
          </ul>
          <TableToggle open={tableOpen} onToggle={() => setTableOpen(open => !open)} controls={tableId} about={`${metric.label}, ${selectionText}`} />
        </div>

        <TablePanel id={tableId} open={tableOpen}>
          {() => <DataTable title={`${metric.label}, ${selectionText}: number of tasks per ${metric.binWidth === 1 ? 'value' : 'bin'}`}>
            <thead>
              <tr>
                <th scope="col">{capitalize(units)}</th>
                <th scope="col">Tasks</th>
                <th scope="col">Share of tasks</th>
                {setting === 'All' && metric.settings.map(id => <th key={id} scope="col">{id}</th>)}
              </tr>
            </thead>
            <tbody>
              {view.slots.filter(slot => slot.inRange).map(slot => <tr key={slot.from}>
                <th scope="row">{metric.binWidth === 1 ? formatStat(slot.from) : `${formatStat(slot.from)} to ${formatStat(slot.to - 1)}`}</th>
                <td>{formatStat(slot.count)}</td>
                <td>{formatShare(slot.count, summary.n)}</td>
                {setting === 'All' && metric.settings.map(id => <td key={id}>{formatStat(countIn(slot, id))}</td>)}
              </tr>)}
            </tbody>
          </DataTable>}
        </TablePanel>
      </div>
    </div>
  </section>;
}
