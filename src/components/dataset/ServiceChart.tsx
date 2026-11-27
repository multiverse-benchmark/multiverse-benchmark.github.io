/**
 * "Services and tools": one horizontal bar per service, grouped into the seven
 * service families. The bars show either the number of tools a service exposes
 * or the number of validation tasks whose gold solution uses it; the second
 * view adds the share of task-service pairs of each family.
 */
import { useId, useMemo, useState, type CSSProperties, type JSX, type PointerEvent } from 'react';
import { datasetCopy } from '../../content/dataset';
import { formatShare, formatStat, useDataset, type DatasetStats, type ServiceStat } from '../../lib/dataset';
import { Segmented, type SegmentedOption } from '../paper/shared';
import { ChartTooltip, DataTable, TablePanel, TableToggle, plural, useElementWidth, useMarks } from './chart-parts';

type ServiceMetric = 'tools' | 'goldTasks';

const METRICS: Record<ServiceMetric, { label: string; unit: string }> = {
  tools: { label: 'Tools per service', unit: 'tool' },
  // A family's subtotal counts a task once for each of the family's services it uses.
  goldTasks: { label: 'Validation tasks using the service', unit: 'task-service pair' },
};
const METRIC_OPTIONS: SegmentedOption<ServiceMetric>[] = (Object.keys(METRICS) as ServiceMetric[]).map(value => ({ value, label: METRICS[value].label }));

interface Group { name: string; services: ServiceStat[]; total: number }

/** Keep the shared taxonomy order and alphabetical service order across metrics and releases. */
function groupsFor(dataset: DatasetStats, metric: ServiceMetric): Group[] {
  return dataset.families
    .map(family => {
      const services = dataset.services.filter(service => service.family === family.name).sort((a, b) => a.name.localeCompare(b.name));
      return { name: family.name, services, total: services.reduce((sum, service) => sum + service[metric], 0) };
    });
}

/** Height of a group's header and the space under the group, in rows. */
const GROUP_OVERHEAD = 1.6;

/** Cuts the ordered groups into `count` runs so that the tallest column is as short as possible. */
function intoColumns(groups: Group[], count: number): Group[][] {
  if (count <= 1 || groups.length <= count) return count <= 1 ? [groups] : groups.map(group => [group]);
  const heightOf = (column: Group[]) => column.reduce((sum, group) => sum + group.services.length + GROUP_OVERHEAD, 0);
  let best: Group[][] = [groups];
  let bestHeight = Infinity;
  const cut = (start: number, columns: Group[][]) => {
    const remaining = count - columns.length;
    if (remaining === 1) {
      const candidate = [...columns, groups.slice(start)];
      const tallest = Math.max(...candidate.map(heightOf));
      if (tallest < bestHeight) {
        bestHeight = tallest;
        best = candidate;
      }
      return;
    }
    for (let end = start + 1; end <= groups.length - (remaining - 1); end++) cut(end, [...columns, groups.slice(start, end)]);
  };
  cut(0, []);
  return best;
}

export function ServiceChart({ columns }: { columns: number }): JSX.Element {
  const [metric, setMetric] = useState<ServiceMetric>('tools');
  const [tableOpen, setTableOpen] = useState(false);
  const titleId = useId();
  const hintId = useId();
  const tableId = useId();
  const [frame, frameWidth] = useElementWidth<HTMLDivElement>();

  const dataset = useDataset();
  const DATASET = useMemo(() => datasetCopy(dataset), [dataset]);
  const { services: SERVICES, families: SERVICE_FAMILIES, taskServicePairs: TASK_SERVICE_PAIRS, taskCount: DATASET_TASK_COUNT } = dataset;
  const groups = useMemo(() => groupsFor(dataset, metric), [dataset, metric]);
  const layout = useMemo(() => intoColumns(groups, columns), [groups, columns]);
  const ordered = groups.flatMap(group => group.services);
  const indexOf = new Map(ordered.map((service, index) => [service.id, index]));
  const largest = Math.max(...SERVICES.map(service => service[metric]));
  const marks = useMarks(ordered.length, 'y', frame);
  const active = marks.active === null ? null : ordered[marks.active];
  const { label, unit } = METRICS[metric];
  const caption = metric === 'tools' ? DATASET.services.toolsCaption : DATASET.services.usageCaption;

  const families = SERVICE_FAMILIES;
  const largestFamily = Math.max(...families.map(family => family.pairs));

  const markAt = (event: PointerEvent<HTMLElement>) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-dst-service]') : null;
    return row ? indexOf.get(row.dataset.dstService ?? '') ?? null : null;
  };
  const rowBox = (index: number) => frame.current?.querySelectorAll<HTMLElement>('[data-dst-mark]')[index]?.getBoundingClientRect() ?? null;
  const usageText = (service: ServiceStat) => `${formatStat(service.goldTasks)} of the ${formatStat(DATASET_TASK_COUNT)} validation tasks (${formatShare(service.goldTasks, DATASET_TASK_COUNT)})`;

  return <section className="dst-card mv-card dst-services" aria-labelledby={titleId} data-dst-services="">
    <header className="dst-card-head dst-card-head--split">
      <div>
        <h3 id={titleId} className="dst-card-title">{DATASET.services.title}</h3>
        <p className="dst-card-lead">{DATASET.services.lead}</p>
      </div>
      <div className="dst-card-control" data-dst-service-metric={metric}>
        <Segmented label="Show" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      </div>
    </header>

    <figure className="dst-figure-block">
      <div
        ref={frame}
        className="dst-svc"
        data-metric={metric}
        role="group"
        aria-label={`${label}: ${formatStat(SERVICES.length)} services in ${formatStat(SERVICE_FAMILIES.length)} families`}
        aria-describedby={hintId}
        onPointerMove={event => { if (event.pointerType !== 'touch') marks.hover(markAt(event)); }}
        onPointerLeave={() => marks.hover(null)}
      >
        <div className="dst-svc-columns" data-columns={layout.length}>
          {layout.map((column, columnIndex) => <div key={columnIndex} className="dst-svc-column">
            {column.map(group => <div key={group.name} className="dst-svc-group" data-dst-group={group.name} data-total={group.total}>
              <h4 className="dst-svc-head">
                <span>{group.name}</span>
                <span className="dst-svc-total">{formatStat(group.total)} {plural(unit, group.total)}</span>
              </h4>
              <ul className="dst-svc-rows">
                {group.services.map(service => {
                  const index = indexOf.get(service.id)!;
                  return <li key={service.id}>
                    <div
                      className="dst-svc-row"
                      role="img"
                      aria-label={`${service.name} (${service.id}), ${service.family}: ${formatStat(service.tools)} ${plural('tool', service.tools)}; used by ${usageText(service)}.`}
                      data-dst-service={service.id}
                      data-value={service[metric]}
                      onClick={() => marks.focusMark(index)}
                      {...marks.markProps(index)}
                    >
                      <span className="dst-svc-name">{service.name}</span>
                      <span className="dst-svc-track">
                        <span className="dst-bar" style={{ '--dst-v': service[metric] / largest } as CSSProperties} />
                        <span className="dst-bar-value">{formatStat(service[metric])}</span>
                      </span>
                    </div>
                  </li>;
                })}
              </ul>
            </div>)}
          </div>)}
        </div>

        {active && marks.active !== null && <ChartTooltip
          container={frame}
          anchorKey={`${metric}:${marks.active}:${frameWidth}:${columns}:${marks.byKeyboard}`}
          anchor={() => rowBox(marks.active!)}
        >
          <p className="dst-tip-name">{active.name}</p>
          <p className="dst-tip-id">{active.id}</p>
          <p className="dst-tip-line">{active.family}</p>
          <dl className="dst-tip-rows">
            <div data-current={metric === 'tools' || undefined}><dt>Tools</dt><dd>{formatStat(active.tools)}</dd></div>
            <div data-current={metric === 'goldTasks' || undefined}><dt>Validation tasks using it</dt><dd>{formatStat(active.goldTasks)}</dd></div>
            <div><dt>Share of the {formatStat(DATASET_TASK_COUNT)} tasks</dt><dd>{formatShare(active.goldTasks, DATASET_TASK_COUNT)}</dd></div>
          </dl>
          {marks.byKeyboard && <p className="dst-tip-keys">Arrow keys move between services.</p>}
        </ChartTooltip>}
      </div>
      <span id={hintId} hidden>Use the up and down arrow keys to move between services.</span>
      <figcaption className="dst-caption-text" data-dst-service-caption="">{caption}</figcaption>
    </figure>

    {metric === 'goldTasks' && <figure className="dst-fam" data-dst-families="">
      <h4 className="dst-sub-title">Service families</h4>
      <ol className="dst-fam-rows">
        {families.map(family => <li key={family.name} className="dst-fam-row" data-dst-family={family.name} data-pairs={family.pairs}>
          <span className="dst-fam-name">{family.name}</span>
          <span className="dst-fam-track" aria-hidden="true">
            <span className="dst-bar" style={{ '--dst-v': family.pairs / largestFamily } as CSSProperties} />
          </span>
          <span className="dst-fam-share">{formatShare(family.pairs, TASK_SERVICE_PAIRS)}</span>
          <span className="dst-fam-pairs">{formatStat(family.pairs)} {plural('pair', family.pairs)}</span>
        </li>)}
      </ol>
      <figcaption className="dst-caption-text">{DATASET.services.familyCaption}</figcaption>
    </figure>}

    <p className="mv-visually-hidden" aria-live="polite" aria-atomic="true">{`Showing: ${label}.`}</p>

    <div className="dst-foot dst-foot--end">
      <TableToggle open={tableOpen} onToggle={() => setTableOpen(open => !open)} controls={tableId} about="services and tools" />
    </div>

    <TablePanel id={tableId} open={tableOpen}>
      {() => <>
        <DataTable title={`The ${formatStat(SERVICES.length)} services: tools, and validation tasks whose gold solution uses the service`}>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Service id</th>
              <th scope="col">Family</th>
              <th scope="col">Tools</th>
              <th scope="col">Validation tasks using it</th>
              <th scope="col">Share of the {formatStat(DATASET_TASK_COUNT)} tasks</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(service => <tr key={service.id}>
              <th scope="row">{service.name}</th>
              <td className="dst-cell-id">{service.id}</td>
              <td className="dst-cell-text">{service.family}</td>
              <td>{formatStat(service.tools)}</td>
              <td>{formatStat(service.goldTasks)}</td>
              <td>{formatShare(service.goldTasks, DATASET_TASK_COUNT)}</td>
            </tr>)}
          </tbody>
        </DataTable>
        {metric === 'goldTasks' && <DataTable title={`Task-service pairs by service family (${formatStat(TASK_SERVICE_PAIRS)} pairs)`}>
          <thead>
            <tr>
              <th scope="col">Family</th>
              <th scope="col">Task-service pairs</th>
              <th scope="col">Share of pairs</th>
            </tr>
          </thead>
          <tbody>
            {families.map(family => <tr key={family.name}>
              <th scope="row">{family.name}</th>
              <td>{formatStat(family.pairs)}</td>
              <td>{formatShare(family.pairs, TASK_SERVICE_PAIRS)}</td>
            </tr>)}
          </tbody>
        </DataTable>}
      </>}
    </TablePanel>
  </section>;
}
