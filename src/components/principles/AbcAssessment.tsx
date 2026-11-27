import { Fragment, useId, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowUpRight, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { ABC } from '../../content/paper';
import {
  ABC_BENCHMARKS,
  ABC_CATEGORIES,
  ABC_CHECKLIST,
  ABC_DEFINITIONS,
  ABC_DEFINITION_SOURCE,
  ABC_EXPLANATIONS,
  ABC_ITEMS,
  ABC_NOTES,
  ABC_OURS,
  ABC_TOTALS,
  abcScore,
  abcTotal,
  type AbcCategoryId,
  type AbcItem,
  type AbcMark,
  type AbcTotal,
} from '../../lib/abc';
import { CellIcon } from './BenchmarkComparison';
import '../paper/paper.css';
import './principles.css';
import './abc.css';

/* ---- derived from the table data -------------------------------------- */

const OTHER_BENCHMARKS = ABC_BENCHMARKS.length - 1;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (count: number) => NUMBER_WORDS[count] ?? String(count);

const SCORE_WORDS = 'satisfied';

/** Segments of a benchmark's bar, in drawing order. Every count is out of all checklist items. */
const SEGMENTS: { id: AbcMark; count: (total: AbcTotal) => number }[] = [
  { id: 'yes', count: total => total.satisfied },
  { id: 'no', count: total => total.notSatisfied },
  { id: 'na', count: total => total.notApplicable },
];
const MARKS: AbcMark[] = ['yes', 'no', 'na'];
const MARKS_IN_USE = MARKS.filter(mark => ABC_ITEMS.some(item => Object.values(item.marks).includes(mark)));

/** Per category and benchmark: the counts behind the concise table. */
const CATEGORY_TOTALS = new Map(ABC_CATEGORIES.map(category => [
  category.id,
  new Map(ABC_BENCHMARKS.map(benchmark => [benchmark.id, abcTotal(category.items, benchmark.id)])),
]));
const ALL_CATEGORIES = ABC_CATEGORIES.map(category => category.id);
const share = (total: AbcTotal) => (total.applicable > 0 ? abcScore(total) / total.applicable : 0);
const BEST_SHARE = Math.max(...ABC_BENCHMARKS.map(benchmark => share(ABC_TOTALS[benchmark.id])));

/** Note marker -> ids of the items that carry it in some cell. */
const MARKED_ITEMS = new Map<string, string[]>();
for (const item of ABC_ITEMS) {
  for (const marker of new Set(Object.values(item.noteMarks))) {
    MARKED_ITEMS.set(marker, [...(MARKED_ITEMS.get(marker) ?? []), item.id]);
  }
}

/** "28 satisfied, 5 not satisfied, 10 not applicable" (zero counts are left out). */
function breakdown(total: AbcTotal): string {
  return SEGMENTS
    .map(segment => ({ count: segment.count(total), label: ABC.legendShort[segment.id].toLowerCase() }))
    .filter(part => part.count > 0)
    .map(part => `${part.count} ${part.label}`)
    .join(', ');
}

/* ---- icons ------------------------------------------------------------ */

/** The checklist's marks. */
function MarkIcon({ mark }: { mark: AbcMark }) {
  return <CellIcon value={mark} />;
}

/** Hover or focus for the original wording; the item links to the source checklist. */
function ChecklistItem({ item, visible }: { item: AbcItem; visible: boolean }) {
  const [open, setOpen] = useState(false);
  const definition = ABC_DEFINITIONS[item.id];
  return (
    <Tooltip.Root open={visible && open} onOpenChange={setOpen}>
      <Tooltip.Trigger asChild>
        <a
          className="abc-item-inner abc-definition-trigger"
          data-abc-definition={item.id}
          href={`${ABC_DEFINITION_SOURCE.url}#S4.F${definition.figure}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`${item.id}: ${item.requirement}. Read original definition (opens in new tab).`}
        >
          <span className="abc-id">{item.id}</span>
          <span className="abc-req">{item.requirement}</span>
        </a>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="abc-explanation abc-definition" side="top" sideOffset={8} collisionPadding={12}>
          <p className="abc-explanation-heading">{definition.sourceId} · Definition</p>
          <p className="abc-explanation-body">{definition.definition}</p>
          <Tooltip.Arrow className="abc-explanation-arrow" width={12} height={6} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Hover and keyboard focus explain a cross; clicking also opens it on touch screens. */
function ExplainedCross({ benchmark, item, requirement, explanation, visible }: {
  benchmark: string;
  item: string;
  requirement: string;
  explanation: string;
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Root open={visible && open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        type="button"
        className="abc-explain-trigger"
        aria-label={`${benchmark}, ${item}: not satisfied. Show explanation.`}
        // Pointer focus can scroll a partly visible cell and immediately dismiss its tooltip.
        // Keyboard focus still opens and describes the explanation normally.
        onPointerDown={event => event.preventDefault()}
        onClick={event => {
          // Radix normally closes tooltips on click. Keep this one available to touch users.
          event.preventDefault();
          setOpen(true);
        }}
      >
        <MarkIcon mark="no" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="abc-explanation" side="top" sideOffset={8} collisionPadding={12}>
          <p className="abc-explanation-heading">{benchmark} · {item}</p>
          <p className="abc-explanation-requirement">{requirement}</p>
          <p className="abc-explanation-body">{explanation}</p>
          <Tooltip.Arrow className="abc-explanation-arrow" width={12} height={6} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** "7/10": the denominator is its own element so that it can drop to a second line in narrow columns. */
function Fraction({ total }: { total: AbcTotal }) {
  return <span className="abc-frac" aria-hidden="true">{abcScore(total)}<span className="abc-frac-of">/{total.applicable}</span></span>;
}

/* ---- component -------------------------------------------------------- */

/** What the assessment is, in one sentence, with a link to the checklist's own paper. */
export function AbcLead() {
  return <>
    We assess {ABC_OURS.name} and the {inWords(OTHER_BENCHMARKS)} released benchmarks closest to it in domain against
    the {ABC_CHECKLIST.itemCount} items of the {ABC_CHECKLIST.name} ({ABC_CHECKLIST.abbr} {ABC_CHECKLIST.version};{' '}
    <a className="abc-source" href={ABC.source.url} target="_blank" rel="noreferrer" title={ABC.source.title}>
      {ABC.source.label}<ArrowUpRight size={12} aria-hidden="true" />
    </a>
    ), which cover outcome validity, task validity, and benchmark reporting.
  </>;
}

/**
 * The paper's Agentic Benchmark Checklist assessment: the six totals and a
 * concise table with one row per checklist category. A category unfolds into
 * its items. The bars and the table's columns list the benchmarks in the same
 * order.
 *
 * `heading`: the component's own title and lead. A page section that gives
 * the assessment its own heading (with <AbcLead /> as the lead) turns it off.
 */
export function AbcAssessment({ heading = true }: { heading?: boolean }) {
  const uid = useId();
  const chartTitleId = `${uid}-chart`;
  const captionId = `${uid}-caption`;
  const [open, setOpen] = useState<ReadonlySet<AbcCategoryId>>(new Set());
  const allOpen = open.size === ALL_CATEGORIES.length;

  const toggle = (category: AbcCategoryId) => setOpen(previous => {
    const next = new Set(previous);
    if (!next.delete(category)) next.add(category);
    return next;
  });

  return (
    <Tooltip.Provider delayDuration={150}>
    <div className={heading ? 'abc-root' : 'abc-root abc-root--section'}>
      {heading && <>
        <h3 className="cmp-title">The Agentic Benchmark Checklist</h3>
        <p className="abc-lead"><AbcLead /></p>
      </>}

      {/* One figure across the full width: the takeaway and the bars' key on the left, the bars on the right. */}
      <figure className="abc-summary" aria-labelledby={chartTitleId} data-abc-summary>
        <figcaption className="abc-summary-text">
          <p className="abc-takeaway">{ABC.takeaway}</p>
          <div className="abc-key">
            <p className="abc-chart-title" id={chartTitleId}>Checklist items {SCORE_WORDS}, out of the applicable items</p>
            <ul className="abc-chart-legend" aria-label="Legend">
              {MARKS_IN_USE.map(mark => (
                <li key={mark} className="abc-chart-legend-item">
                  <span className={`abc-swatch abc-seg--${mark}`} aria-hidden="true" />
                  {ABC.legendShort[mark]}
                </li>
              ))}
            </ul>
          </div>
        </figcaption>
        <ol className="abc-bars">
          {ABC_BENCHMARKS.map(benchmark => {
            const total = ABC_TOTALS[benchmark.id];
            return (
              <li key={benchmark.id} className="abc-bar-row" data-abc-bar={benchmark.id} data-ours={benchmark.ours ? 'true' : undefined}>
                <span className="abc-bar-name" aria-hidden="true">
                  {benchmark.name}
                  {benchmark.ours && <span className="abc-ours-tag">This work</span>}
                </span>
                <span className="abc-bar" aria-hidden="true">
                  {SEGMENTS.map(segment => {
                    const count = segment.count(total);
                    return count > 0 && (
                      <span
                        key={segment.id}
                        className={`abc-seg abc-seg--${segment.id}`}
                        style={{ flexGrow: count }}
                        title={`${benchmark.name}: ${count} ${ABC.legendShort[segment.id].toLowerCase()}`}
                      />
                    );
                  })}
                </span>
                <span className="abc-bar-score" aria-hidden="true">
                  <strong>{abcScore(total)}</strong><span className="abc-bar-of"> / {total.applicable}</span>
                </span>
                <span className="mv-visually-hidden">
                  {benchmark.name}{benchmark.ours ? ' (this work)' : ''}: {abcScore(total)} of {total.applicable} applicable items {SCORE_WORDS} ({breakdown(total)}).
                </span>
              </li>
            );
          })}
        </ol>
      </figure>

      <figure className="abc-figure">
        <figcaption className="abc-caption">
          <span id={captionId}>Items {SCORE_WORDS}, out of those applicable, by checklist category.</span>
          <button
            type="button"
            className="prn-expand-all abc-expand-all"
            data-abc-expand-all
            onClick={() => setOpen(allOpen ? new Set() : new Set(ALL_CATEGORIES))}
          >
            {allOpen ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}
            <span>{allOpen ? 'Collapse all' : `Show all ${ABC_CHECKLIST.itemCount} items`}</span>
          </button>
        </figcaption>

        <div className="abc-frame">
          <table className="abc-table" aria-labelledby={captionId}>
            <colgroup>
              <col />
              {ABC_BENCHMARKS.map(benchmark => <col key={benchmark.id} className="abc-colw-mark" />)}
            </colgroup>
            <thead>
              <tr>
                <th className="abc-th abc-th--item" scope="col">Checklist category</th>
                {ABC_BENCHMARKS.map(benchmark => (
                  <th key={benchmark.id} className="abc-th abc-th--mark" scope="col" data-ours={benchmark.ours ? 'true' : undefined} title={benchmark.name}>
                    <span className="abc-bm-full">{benchmark.name}</span>
                    <span className="abc-bm-abbr">
                      <span aria-hidden="true">{benchmark.id}</span>
                      <span className="mv-visually-hidden">{benchmark.name}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {ABC_CATEGORIES.map(category => {
              const isOpen = open.has(category.id);
              const itemsId = `${uid}-items-${category.id}`;
              return (
                <Fragment key={category.id}>
                  {/* The row itself takes the click; the button inside it carries the keyboard and the expanded state. */}
                  <tbody className="abc-cat" data-abc-category={category.id}>
                    <tr className="abc-cat-row" data-open={isOpen ? 'true' : undefined} onClick={() => toggle(category.id)}>
                      <th className="abc-cat-head" scope="row">
                        <button type="button" className="abc-cat-toggle" aria-expanded={isOpen} aria-controls={itemsId}>
                          <ChevronDown className="abc-cat-icon" size={16} aria-hidden="true" />
                          <span className="abc-cat-title">{category.title}</span>
                          <span className="abc-cat-count">{category.items.length} items</span>
                        </button>
                      </th>
                      {ABC_BENCHMARKS.map(benchmark => {
                        const total = CATEGORY_TOTALS.get(category.id)?.get(benchmark.id) ?? abcTotal(category.items, benchmark.id);
                        return (
                          <td key={benchmark.id} className="abc-cat-cell" data-ours={benchmark.ours ? 'true' : undefined}>
                            <Fraction total={total} />
                            <span className="abc-meter" aria-hidden="true"><span className="abc-meter-fill" style={{ width: `${share(total) * 100}%` }} /></span>
                            <span className="mv-visually-hidden">{abcScore(total)} of {total.applicable} applicable items {SCORE_WORDS}</span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                  <tbody className="abc-items" id={itemsId} hidden={!isOpen} data-abc-items={category.id}>
                    {category.items.map(item => {
                      const inapplicable = Object.values(item.marks).every(mark => mark === 'na');
                      return (
                        <tr key={item.id} className="abc-row" data-abc-item={item.id} data-inapplicable={inapplicable ? 'true' : undefined}>
                          <th className="abc-item" scope="row">
                            <ChecklistItem item={item} visible={isOpen} />
                          </th>
                          {ABC_BENCHMARKS.map(benchmark => {
                            const mark = item.marks[benchmark.id];
                            const note = item.noteMarks[benchmark.id];
                            const explanation = ABC_EXPLANATIONS[item.id]?.[benchmark.id];
                            return (
                              <td key={benchmark.id} className="abc-cell" data-value={mark} data-ours={benchmark.ours ? 'true' : undefined}>
                                {mark === 'no' && explanation ? (
                                  <ExplainedCross
                                    benchmark={benchmark.name}
                                    item={item.id}
                                    requirement={item.requirement}
                                    explanation={explanation}
                                    visible={isOpen}
                                  />
                                ) : <>
                                <span className="cmp-glyph">
                                  <MarkIcon mark={mark} />
                                  {note && <span className="abc-cell-note" aria-hidden="true">{note}</span>}
                                </span>
                                <span className="mv-visually-hidden">{ABC.legend[mark]}{note ? ` (see note ${note})` : ''}</span>
                                </>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </Fragment>
              );
            })}

            <tfoot>
              <tr className="abc-total-row">
                <th className="abc-total-label" scope="row">All {ABC_CHECKLIST.itemCount} items</th>
                {ABC_BENCHMARKS.map(benchmark => {
                  const total = ABC_TOTALS[benchmark.id];
                  return (
                    <td key={benchmark.id} className="abc-total" data-ours={benchmark.ours ? 'true' : undefined} data-best={share(total) === BEST_SHARE ? 'true' : undefined}>
                      <Fraction total={total} />
                      <span className="mv-visually-hidden">{abcScore(total)} of {total.applicable} applicable items {SCORE_WORDS}</span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </figure>

      <div className="abc-legend" role="group" aria-label="Legend">
        <ul className="abc-legend-marks">
          {MARKS_IN_USE.map(mark => (
            <li key={mark} className="cmp-legend-item"><MarkIcon mark={mark} /><span>{ABC.legend[mark]}</span></li>
          ))}
        </ul>
        <ul className="abc-legend-names" aria-label="Column abbreviations">
          {ABC_BENCHMARKS.map(benchmark => (
            <li key={benchmark.id}><strong>{benchmark.id}</strong> {benchmark.name}</li>
          ))}
        </ul>
      </div>

      <ul className="abc-notes">
        {ABC_NOTES.map(note => (
          <li key={note.text} className="mv-note">
            {/* A marked note names its item: the item's row may be folded away. */}
            {note.marker && <span className="abc-note-marker">{note.marker} {MARKED_ITEMS.get(note.marker)?.join(', ')}: </span>}
            {note.text}
          </li>
        ))}
      </ul>

    </div>
    </Tooltip.Provider>
  );
}
