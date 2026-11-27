/**
 * "Instruction rubric categories": the number of instruction rubrics in each
 * of the nine categories, for the IF and the MTIF tasks. Each category opens
 * to show its definition and an example from the paper.
 */
import { useId, useMemo, useState, type CSSProperties, type JSX } from 'react';
import { ChevronRight } from 'lucide-react';
import { datasetCopy } from '../../content/dataset';
import { formatStat, useDataset } from '../../lib/dataset';
import { settingById } from '../../lib/results';
import { DataTable, TablePanel, TableToggle, plural } from './chart-parts';

const SERIES = ['IF', 'MTIF'] as const;

export function RubricChart(): JSX.Element {
  const dataset = useDataset();
  const DATASET = useMemo(() => datasetCopy(dataset), [dataset]);
  /** Keep the same taxonomy order when switching releases. */
  const CATEGORIES = useMemo(() => dataset.rubricCategories
    .map(category => ({ ...category, total: category.IF + category.MTIF })), [dataset]);
  const LARGEST = Math.max(...CATEGORIES.flatMap(category => SERIES.map(series => category[series])));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [tableOpen, setTableOpen] = useState(false);
  const titleId = useId();
  const detailId = useId();
  const tableId = useId();
  const allOpen = open.size === CATEGORIES.length;

  const toggle = (name: string) => setOpen(current => {
    const next = new Set(current);
    if (!next.delete(name)) next.add(name);
    return next;
  });

  return <section className="dst-card mv-card dst-rubrics" aria-labelledby={titleId} data-dst-rubrics="">
    <header className="dst-card-head dst-card-head--split">
      <div>
        <h3 id={titleId} className="dst-card-title">{DATASET.rubrics.title}</h3>
        <p className="dst-card-lead">{DATASET.rubrics.lead}</p>
      </div>
      <ul className="dst-legend" aria-label="Series">
        {SERIES.map(series => <li key={series} title={settingById(series).description}>
          <span className={`dst-swatch dst-swatch--${series.toLowerCase()}`} aria-hidden="true" />
          <span className="dst-legend-name">{series}</span>
          <span className="dst-legend-note">{formatStat(dataset.settingCounts[series])} tasks</span>
        </li>)}
      </ul>
    </header>

    <figure className="dst-figure-block">
      <div className="dst-rub-bar">
        <button
          type="button"
          className="mv-link dst-link"
          data-dst-expand-all=""
          onClick={() => setOpen(allOpen ? new Set() : new Set(CATEGORIES.map(category => category.name)))}
        >{allOpen ? 'Hide all definitions' : 'Show all definitions'}</button>
      </div>

      <ul className="dst-rub-rows">
        {CATEGORIES.map((category, index) => {
          const expanded = open.has(category.name);
          const panelId = `${detailId}-${index}`;
          return <li
            key={category.name}
            className="dst-rub-item"
            data-dst-category={category.name}
            data-if={category.IF}
            data-mtif={category.MTIF}
            data-open={expanded || undefined}
          >
            <div className="dst-rub-row">
              <h4 className="dst-rub-name">
                <button type="button" className="dst-rub-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(category.name)}>
                  <ChevronRight className="dst-rub-chevron" size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{category.name}</span>
                </button>
              </h4>
              <div
                className="dst-rub-bars"
                role="img"
                aria-label={SERIES.map(series => `${series}: ${formatStat(category[series])} ${plural('rubric', category[series])}`).join(', ')}
              >
                {SERIES.map(series => <div key={series} className="dst-rub-line">
                  <span className="dst-rub-series">{series}</span>
                  <span className="dst-rub-track">
                    <span className={`dst-bar dst-bar--${series.toLowerCase()}`} style={{ '--dst-v': category[series] / LARGEST } as CSSProperties} />
                    <span className="dst-bar-value">{formatStat(category[series])}</span>
                  </span>
                </div>)}
              </div>
            </div>
            <div id={panelId} className="dst-rub-detail" hidden={!expanded}>
              <dl className="dst-notes">
                <div>
                  <dt>Definition</dt>
                  <dd>{category.definition}</dd>
                </div>
                <div>
                  <dt>Example</dt>
                  <dd>{category.example}</dd>
                </div>
              </dl>
            </div>
          </li>;
        })}
      </ul>
    </figure>

    <div className="dst-foot dst-foot--end">
      <TableToggle open={tableOpen} onToggle={() => setTableOpen(current => !current)} controls={tableId} about="instruction rubric categories" />
    </div>

    <TablePanel id={tableId} open={tableOpen}>
      {() => <DataTable title="Instruction rubrics by category, for the IF and the MTIF tasks" text>
        <thead>
          <tr>
            <th scope="col">Category</th>
            {SERIES.map(series => <th key={series} scope="col">{series}</th>)}
            <th scope="col">Total</th>
            <th scope="col">Definition</th>
            <th scope="col">Example</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(category => <tr key={category.name}>
            <th scope="row">{category.name}</th>
            {SERIES.map(series => <td key={series}>{formatStat(category[series])}</td>)}
            <td>{formatStat(category.total)}</td>
            <td className="dst-cell-text">{category.definition}</td>
            <td className="dst-cell-text">{category.example}</td>
          </tr>)}
        </tbody>
      </DataTable>}
    </TablePanel>
  </section>;
}
