import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type Ref,
} from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { COMPARISON, PRINCIPLE_GROUPS } from '../../content/paper';
import {
  BUCKET_RULES,
  COMPARISON_COLUMNS,
  COMPARISON_GROUPS,
  type CellValue,
  type ColumnGroup,
  type ComparisonColumn,
  type ComparisonRow,
} from '../../lib/comparison';
import '../paper/paper.css';
import './principles.css';

export interface BenchmarkComparisonHandle {
  /** Moves focus to the first column that marks a principle, scrolling the table sideways when that column is out of view. */
  focusPrinciple: (principle: number) => void;
}

export interface BenchmarkComparisonProps {
  activePrinciple: number | null;
  onActivePrincipleChange: (principle: number | null) => void;
  onShowPrinciple: (principle: number) => void;
  /** Optional handle, used by PrinciplesSection to move focus into the table. */
  ref?: Ref<BenchmarkComparisonHandle>;
}

/* ---- derived from the table data -------------------------------------- */

const ALL_ROWS = COMPARISON_GROUPS.flatMap(group => group.rows);

/** Mark columns in which this work's benchmark is the only row with "yes". */
const ONLY_COLUMNS = new Set(
  COMPARISON_COLUMNS.filter(column => {
    if (column.kind !== 'mark') return false;
    const satisfied = ALL_ROWS.filter(row => row.values[column.id] === 'yes');
    return satisfied.length === 1 && satisfied[0].ours;
  }).map(column => column.id),
);
const ONLY_LABEL = 'Only benchmark in this table that satisfies the criterion';

const PRINCIPLE_TITLES = new Map(PRINCIPLE_GROUPS.flatMap(group => group.principles.map(principle => [principle.number, principle.title] as const)));
const GROUP_TITLES = new Map<string, string>(PRINCIPLE_GROUPS.map(group => [group.id, group.title]));

interface GroupSpan {
  group: ColumnGroup;
  count: number;
  first: number;
  last: number;
}

/** Runs of neighbouring columns that belong to the same principle group. */
const GROUP_SPANS = COMPARISON_COLUMNS.reduce<GroupSpan[]>((spans, column) => {
  const current = spans[spans.length - 1];
  if (current && current.group === column.group) {
    current.count += 1;
    current.first = Math.min(current.first, column.principle);
    current.last = Math.max(current.last, column.principle);
  } else {
    spans.push({ group: column.group, count: 1, first: column.principle, last: column.principle });
  }
  return spans;
}, []);

const BUCKET_COLUMNS = COMPARISON_COLUMNS.filter(column => column.kind === 'bucket' && BUCKET_RULES[column.id]);
const BUCKET_LEVELS = ['low', 'mid', 'high'] as const;
const MARK_VALUES = ['yes', 'partial', 'no', 'na'] as const;

/** "# Tools/task" becomes "tools per task", the noun used in a cell's accessible name. */
const unitOf = (column: ComparisonColumn) => column.label.replace(/^#\s*/, '').replace('/', ' per ').toLowerCase();

/** "< 6" becomes "fewer than 6" and "> 500" becomes "more than 500". */
const ruleInWords = (rule: string) => rule.replace(/^<\s*/, 'fewer than ').replace(/^>\s*/, 'more than ');

/** Words of a column label; "#" stays attached to the word after it. */
function labelWords(label: string): string[] {
  const words: string[] = [];
  for (const token of label.split(' ')) {
    if (words.length > 0 && words[words.length - 1] === '#') words[words.length - 1] = `# ${token}`;
    else words.push(token);
  }
  return words;
}

function cellName(column: ComparisonColumn, row: ComparisonRow): string {
  const value = row.values[column.id];
  const count = row.counts[column.id];
  const name = count ? `${COMPARISON.legend[value]}: ${count} ${unitOf(column)}` : COMPARISON.legend[value];
  return row.ours && ONLY_COLUMNS.has(column.id) ? `${name}. ${ONLY_LABEL}` : name;
}

/* ---- column help: "Satisfied: ... Partial: ... Not satisfied: ..." ------ */

const LEVEL_VALUES: Record<string, CellValue> = {
  Satisfied: 'yes',
  Partial: 'partial',
  'Not satisfied': 'no',
  'Not applicable': 'na',
};

interface HelpPart {
  label: string | null;
  value: CellValue | null;
  text: string;
}

/** Splits a column's help text at the paper's level labels so each level can carry its mark. */
function splitHelp(text: string): HelpPart[] {
  const pattern = /(^|\.\s+)(Satisfied|Partial|Not satisfied|Not applicable):\s+/g;
  const marks: { labelStart: number; textStart: number; label: string }[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    marks.push({ labelStart: match.index + match[1].length, textStart: match.index + match[0].length, label: match[2] });
  }
  if (marks.length === 0) return [{ label: null, value: null, text }];
  const parts: HelpPart[] = [];
  const lead = text.slice(0, marks[0].labelStart).trim();
  if (lead) parts.push({ label: null, value: null, text: lead });
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].labelStart : text.length;
    parts.push({ label: mark.label, value: LEVEL_VALUES[mark.label] ?? null, text: text.slice(mark.textStart, end).trim() });
  });
  return parts;
}

/* ---- icons ------------------------------------------------------------ */

/** Table glyphs. Marks carry the outcome colours; buckets stay in neutral ink. Also used by the checklist table. */
export function CellIcon({ value }: { value: CellValue }) {
  switch (value) {
    case 'yes':
      return <svg className="cmp-icon cmp-icon--yes" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6 6.4 12 13 4.4" /></svg>;
    case 'partial':
      return <svg className="cmp-icon cmp-icon--partial" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 9 5.6 12.2 11.8 5" /><path d="M6.6 2.4 13 13" /></svg>;
    case 'no':
      return <svg className="cmp-icon cmp-icon--no" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" /></svg>;
    case 'low':
      return <svg className="cmp-icon cmp-icon--bucket" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25" /></svg>;
    case 'mid':
      return <svg className="cmp-icon cmp-icon--bucket" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25" /><path className="cmp-icon-half" d="M8 2.75a5.25 5.25 0 0 0 0 10.5z" /></svg>;
    case 'high':
      return <svg className="cmp-icon cmp-icon--bucket" viewBox="0 0 16 16" aria-hidden="true"><circle className="cmp-icon-fill" cx="8" cy="8" r="5.25" /></svg>;
    default:
      return <svg className="cmp-icon cmp-icon--na" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 8h6" /></svg>;
  }
}

function OnlyMark() {
  return <svg className="cmp-only-star" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .9l1.5 3.2 3.5.4-2.6 2.4.7 3.5L6 8.7l-3.1 1.7.7-3.5L1 4.5l3.5-.4z" /></svg>;
}

/* ---- component -------------------------------------------------------- */

interface HelpState {
  column: string;
  /** Opened by a click: stays until dismissed. Otherwise it follows hover and focus. */
  pinned: boolean;
}

interface HelpPosition {
  column: string;
  left: number;
  top: number;
  arrow: number;
  /** above: over the header, the default. beside: under the header row, next to the column. below: under the header, when neither fits. */
  placement: 'above' | 'beside' | 'below';
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Space kept free at the top of the viewport for the site's sticky header. */
const TOP_CLEARANCE = 96;
const POPOVER_GAP = 10;
const HOVER_OPEN_DELAY = 140;
/** Long enough to move the pointer from a header onto its explanation. */
const HOVER_CLOSE_DELAY = 220;

export function BenchmarkComparison({ activePrinciple, onActivePrincipleChange, onShowPrinciple, ref }: BenchmarkComparisonProps) {
  const uid = useId();
  const captionId = `${uid}-caption`;
  const helpId = `${uid}-help`;
  const rulesId = `${uid}-rules`;
  const figureRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const keepScroll = useRef(false);
  const [help, setHelp] = useState<HelpState | null>(null);
  const [position, setPosition] = useState<HelpPosition | null>(null);
  const [scroll, setScroll] = useState({ overflow: false, atEnd: true });
  const [rulesOpen, setRulesOpen] = useState(false);

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const showHelp = useCallback((column: string) => {
    clearTimers();
    setHelp(previous => (previous?.column === column ? previous : { column, pinned: false }));
  }, [clearTimers]);
  const hideHelp = useCallback(() => {
    clearTimers();
    setHelp(null);
  }, [clearTimers]);
  const hoverIn = useCallback((column: string) => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      setHelp(previous => (previous?.column === column || previous?.pinned ? previous : { column, pinned: false }));
    }, help ? 0 : HOVER_OPEN_DELAY);
  }, [help]);
  const hoverOut = useCallback((column: string) => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setHelp(previous => (previous && previous.column === column && !previous.pinned ? null : previous));
    }, HOVER_CLOSE_DELAY);
  }, []);
  const togglePinned = useCallback((column: string) => {
    clearTimers();
    setHelp(previous => (previous?.column === column && previous.pinned ? null : { column, pinned: true }));
  }, [clearTimers]);

  useImperativeHandle(ref, () => ({
    focusPrinciple(principle: number) {
      const region = regionRef.current;
      const badge = region?.querySelector<HTMLElement>(`[data-cmp-principle="${principle}"]`);
      if (!region || !badge) return;
      // This jump scrolls the table itself (smoothly), so the focus handler must not also move it.
      keepScroll.current = true;
      badge.focus({ preventScroll: true });
      keepScroll.current = false;
      const header = badge.closest('th');
      if (header && region.scrollWidth - region.clientWidth > 1) {
        const nameWidth = region.querySelector<HTMLElement>('.cmp-corner')?.offsetWidth ?? 0;
        region.scrollTo({ left: Math.max(0, header.offsetLeft - nameWidth - 12), behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
      }
    },
  }), []);

  /*
   * A column header reached with the keyboard must be fully in view. Browsers
   * leave a control that is partly visible where it is, and they do not know
   * about the sticky name column, so the table is scrolled sideways here when
   * needed. Pointer focus is left alone: content must not move under a press.
   */
  const revealHeader = useCallback((header: HTMLElement, focused: Element) => {
    const region = regionRef.current;
    if (!region || keepScroll.current || !focused.matches(':focus-visible') || region.scrollWidth - region.clientWidth <= 1) return;
    const regionBox = region.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const nameWidth = region.querySelector<HTMLElement>('.cmp-corner')?.getBoundingClientRect().width ?? 0;
    const left = regionBox.left + region.clientLeft + nameWidth;
    const right = regionBox.left + region.clientLeft + region.clientWidth;
    if (headerBox.left < left) region.scrollLeft -= left - headerBox.left + 8;
    else if (headerBox.right > right) region.scrollLeft += headerBox.right - right + 8;
  }, []);

  // Whether the table is wider than its region, and whether it is scrolled to the end.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const update = () => {
      const overflow = region.scrollWidth - region.clientWidth > 1;
      const atEnd = region.scrollLeft + region.clientWidth >= region.scrollWidth - 1;
      setScroll(previous => (previous.overflow === overflow && previous.atEnd === atEnd ? previous : { overflow, atEnd }));
    };
    update();
    region.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(region);
    const table = region.querySelector('table');
    if (table) observer?.observe(table);
    // Text set in the fallback font can be wider than in the web font, so measure again once fonts are in.
    let mounted = true;
    void document.fonts?.ready.then(() => { if (mounted) update(); });
    return () => {
      mounted = false;
      region.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  /*
   * Place the open explanation. Above its column header when the viewport has
   * room there: nothing in the table is covered. Otherwise under the header
   * row and beside the column, so the column it explains stays readable. On a
   * screen too narrow for that, under the header.
   */
  const helpColumn = help?.column ?? null;
  const placeHelp = useCallback((afterScroll: boolean) => {
    const figure = figureRef.current;
    const region = regionRef.current;
    const popover = popoverRef.current;
    const header = helpColumn ? region?.querySelector<HTMLElement>(`th[data-cmp-col="${helpColumn}"]`) : null;
    if (!helpColumn || !figure || !region || !popover || !header) return;
    const figureBox = figure.getBoundingClientRect();
    const regionBox = region.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    if (afterScroll) {
      // The table was scrolled sideways until the column left the region: its explanation goes with it.
      const nameWidth = region.querySelector<HTMLElement>('.cmp-corner')?.getBoundingClientRect().width ?? 0;
      if (headerBox.right <= regionBox.left + nameWidth + 4 || headerBox.left >= regionBox.right - 4) {
        hideHelp();
        return;
      }
    }
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    // A header can be partly scrolled out of the region: point at the part that shows.
    const anchor = clamp(headerBox.left + headerBox.width / 2, regionBox.left + 14, regionBox.right - 14) - figureBox.left;
    const centred = clamp(anchor - width / 2, 0, figureBox.width - width);
    if (headerBox.top - height - POPOVER_GAP >= TOP_CLEARANCE) {
      setPosition({ column: helpColumn, left: centred, top: headerBox.top - figureBox.top - height - POPOVER_GAP, arrow: clamp(anchor - centred, 16, width - 16), placement: 'above' });
      return;
    }
    const top = headerBox.bottom - figureBox.top + POPOVER_GAP;
    const toTheRight = headerBox.right - figureBox.left + POPOVER_GAP;
    const toTheLeft = headerBox.left - figureBox.left - POPOVER_GAP - width;
    if (toTheRight + width <= figureBox.width) setPosition({ column: helpColumn, left: toTheRight, top, arrow: 0, placement: 'beside' });
    else if (toTheLeft >= 0) setPosition({ column: helpColumn, left: toTheLeft, top, arrow: 0, placement: 'beside' });
    else setPosition({ column: helpColumn, left: centred, top, arrow: clamp(anchor - centred, 16, width - 16), placement: 'below' });
  }, [helpColumn, hideHelp]);

  useLayoutEffect(() => {
    if (helpColumn) placeHelp(false);
    else setPosition(null);
  }, [helpColumn, placeHelp]);

  /*
   * While an explanation is open: Escape or a press elsewhere dismisses it. A
   * sideways scroll of the table or a resize moves it along with its column
   * (focusing a column that is off screen scrolls the table to it).
   */
  useEffect(() => {
    if (!helpColumn) return;
    const region = regionRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideHelp();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`th[data-cmp-col="${helpColumn}"]`) || popoverRef.current?.contains(target)) return;
      hideHelp();
    };
    const onScroll = () => placeHelp(true);
    const onResize = () => placeHelp(false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onResize);
    region?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      region?.removeEventListener('scroll', onScroll);
    };
  }, [helpColumn, hideHelp, placeHelp]);

  const helpSpec = help ? COMPARISON_COLUMNS.find(column => column.id === help.column) : undefined;
  const placed = help && position && position.column === help.column ? position : null;

  return (
    <div className="cmp-root" data-overflow={scroll.overflow ? 'true' : undefined} data-at-end={scroll.atEnd ? 'true' : undefined}>
      <h3 className="cmp-title">How MultiVerse compares</h3>

      <figure className="cmp-figure" ref={figureRef}>
        <figcaption className="cmp-caption">
          <span id={captionId}>{COMPARISON.caption}</span>
          <span className="cmp-hint">
            <ArrowLeftRight size={14} aria-hidden="true" />
            Scroll sideways to see all columns
          </span>
        </figcaption>

        <div className="cmp-frame">
          <div className="cmp-scroll" role="region" aria-label="Benchmark comparison table" tabIndex={0} ref={regionRef}>
            <table className="cmp-table" aria-labelledby={captionId} style={{ '--cmp-cols': COMPARISON_COLUMNS.length } as CSSProperties}>
              <colgroup>
                <col className="cmp-colw-name" />
              </colgroup>
              {GROUP_SPANS.map(span => <colgroup key={span.group} span={span.count} />)}
              <thead>
                <tr>
                  <th className="cmp-corner" scope="col" rowSpan={2}>Benchmark</th>
                  {GROUP_SPANS.map(span => (
                    <th key={span.group} className={`cmp-band cmp-band--${span.group}`} scope="colgroup" colSpan={span.count}>
                      <span className="cmp-band-inner">
                        <span className="cmp-band-title">{GROUP_TITLES.get(span.group) ?? span.group}</span>
                        <span className="cmp-band-range">D{span.first} to D{span.last}</span>
                      </span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {COMPARISON_COLUMNS.map((column, index) => {
                    const groupStart = index > 0 && COMPARISON_COLUMNS[index - 1].group !== column.group;
                    return (
                      <th
                        key={column.id}
                        className={`cmp-col cmp-col--${column.group}${groupStart ? ' cmp-group-start' : ''}`}
                        scope="col"
                        data-cmp-col={column.id}
                        data-active={activePrinciple === column.principle ? 'true' : undefined}
                        onMouseEnter={() => {
                          onActivePrincipleChange(column.principle);
                          hoverIn(column.id);
                        }}
                        onMouseLeave={() => {
                          onActivePrincipleChange(null);
                          hoverOut(column.id);
                        }}
                        onFocus={(event: FocusEvent<HTMLTableCellElement>) => {
                          onActivePrincipleChange(column.principle);
                          revealHeader(event.currentTarget, event.target);
                        }}
                        onBlur={(event: FocusEvent<HTMLTableCellElement>) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActivePrincipleChange(null);
                        }}
                      >
                        <button
                          type="button"
                          className="cmp-col-button"
                          aria-describedby={help?.column === column.id ? helpId : undefined}
                          onFocus={() => showHelp(column.id)}
                          onBlur={() => setHelp(previous => (previous?.column === column.id ? null : previous))}
                          onClick={() => togglePinned(column.id)}
                        >
                          <span className="cmp-col-label">
                            {labelWords(column.label).map((word, wordIndex) => (
                              <Fragment key={wordIndex}>{wordIndex > 0 && ' '}<span className="cmp-word">{word}</span></Fragment>
                            ))}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="cmp-p"
                          data-cmp-principle={column.principle}
                          aria-describedby={`${uid}-principle-${column.principle}`}
                          onClick={() => onShowPrinciple(column.principle)}
                        >
                          <span className="cmp-p-pill">D{column.principle}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {COMPARISON_GROUPS.map(group => {
                const ours = group.rows.length > 0 && group.rows.every(row => row.ours);
                return (
                  <tbody key={group.id} data-cmp-rowgroup={group.id}>
                    {!ours && (
                      <tr className="cmp-group-row" data-cmp-group={group.id}>
                        <th className="cmp-group-title" scope="rowgroup" colSpan={COMPARISON_COLUMNS.length + 1}>
                          <span>{group.title}</span>
                        </th>
                      </tr>
                    )}
                    {group.rows.map(row => (
                      <tr key={row.name} className={`cmp-row${row.ours ? ' cmp-row--ours' : ''}`} data-cmp-row={row.name} data-ours={row.ours ? 'true' : undefined}>
                        <th className="cmp-name" scope="row">
                          <span className="cmp-name-text">{row.name}</span>
                          {row.ours && <span className="cmp-ours-tag"><span className="mv-visually-hidden">, </span>{group.title}</span>}
                        </th>
                        {COMPARISON_COLUMNS.map((column, index) => {
                          const value = row.values[column.id];
                          const count = row.counts[column.id];
                          const groupStart = index > 0 && COMPARISON_COLUMNS[index - 1].group !== column.group;
                          const only = row.ours && ONLY_COLUMNS.has(column.id);
                          return (
                            <td
                              key={column.id}
                              className={`cmp-cell cmp-cell--${column.group}${groupStart ? ' cmp-group-start' : ''}`}
                              data-cmp-cell={column.id}
                              data-value={value}
                              data-col-active={activePrinciple === column.principle ? 'true' : undefined}
                            >
                              <span className="cmp-glyph">
                                <CellIcon value={value} />
                                {only && <span className="cmp-only" data-cmp-only aria-hidden="true"><OnlyMark /></span>}
                              </span>
                              {count && <span className="cmp-count" aria-hidden="true">{count}</span>}
                              <span className="mv-visually-hidden">{cellName(column, row)}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
          <div className="cmp-fade" aria-hidden="true" />
        </div>

        {/* What each P badge does, for assistive technology. Kept outside the table so that header cells read as "<label> P<n>". */}
        <div hidden>
          {Array.from(PRINCIPLE_TITLES, ([number, title]) => (
            <span key={number} id={`${uid}-principle-${number}`}>Show design dimension {number}: {title}</span>
          ))}
        </div>

        {help && helpSpec && (
          <div
            ref={popoverRef}
            role="tooltip"
            className={`cmp-pop cmp-pop--${helpSpec.group}`}
            data-cmp-help={help.column}
            data-placement={placed?.placement}
            data-placed={placed ? 'true' : undefined}
            style={placed ? ({ left: placed.left, top: placed.top, '--cmp-arrow': `${placed.arrow}px` } as CSSProperties) : undefined}
            onMouseEnter={() => window.clearTimeout(closeTimer.current)}
            onMouseLeave={() => hoverOut(help.column)}
          >
            <p className="cmp-pop-head">
              <span className="cmp-pop-title">{helpSpec.label}</span>
              <span className="cmp-pop-p">D{helpSpec.principle}</span>
            </p>
            {PRINCIPLE_TITLES.has(helpSpec.principle) && (
              <p className="cmp-pop-principle">Dimension {helpSpec.principle}: {PRINCIPLE_TITLES.get(helpSpec.principle)}</p>
            )}
            <div id={helpId} className="cmp-pop-body">
              <HelpBody column={helpSpec} />
            </div>
          </div>
        )}
      </figure>

      <div className="cmp-legend" role="group" aria-label="Legend">
        <ul className="cmp-legend-group">
          {MARK_VALUES.map(value => (
            <li key={value} className="cmp-legend-item"><CellIcon value={value} /><span>{COMPARISON.legend[value]}</span></li>
          ))}
        </ul>
        <ul className="cmp-legend-group">
          {BUCKET_LEVELS.map(value => (
            <li key={value} className="cmp-legend-item"><CellIcon value={value} /><span>{COMPARISON.legend[value]}</span></li>
          ))}
        </ul>
        {ONLY_COLUMNS.size > 0 && (
          <ul className="cmp-legend-group">
            <li className="cmp-legend-item">
              <span className="cmp-glyph"><CellIcon value="yes" /><span className="cmp-only"><OnlyMark /></span></span>
              <span>{ONLY_LABEL}</span>
            </li>
          </ul>
        )}
      </div>

      <div className="cmp-foot">
        <button type="button" className="cmp-rules-toggle" aria-expanded={rulesOpen} aria-controls={rulesId} onClick={() => setRulesOpen(open => !open)}>
          <ChevronDown className="cmp-rules-icon" size={15} aria-hidden="true" />
          How the buckets are defined
        </button>
        <p className="mv-note cmp-note">{COMPARISON.taskCountNote}</p>
      </div>
      <ul className="cmp-rules" id={rulesId} hidden={!rulesOpen}>
        {BUCKET_COLUMNS.map(column => (
          <li key={column.id} className="cmp-rule">
            <strong className="cmp-rule-name">{column.label}</strong>
            <span className="mv-visually-hidden">: </span>
            {BUCKET_LEVELS.map((level, index) => (
              <span key={level} className="cmp-rule-level">
                <CellIcon value={level} />
                <span>{COMPARISON.legend[level].toLowerCase()} is {ruleInWords(BUCKET_RULES[column.id][level])}{index < BUCKET_LEVELS.length - 1 && <span className="mv-visually-hidden">, </span>}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>

      <p className="cmp-takeaway">{COMPARISON.takeaway}</p>
    </div>
  );
}

/** The explanation shown for one column: its criterion, split by level where the paper states levels. */
function HelpBody({ column }: { column: ComparisonColumn }) {
  const text = COMPARISON.columnHelp[column.id];
  const parts = text ? splitHelp(text) : [];
  const rules = column.kind === 'bucket' ? BUCKET_RULES[column.id] : undefined;
  return (
    <>
      {parts.map((part, index) => (part.label
        ? (
          <p key={index} className="cmp-pop-level">
            {part.value && <CellIcon value={part.value} />}
            <span><strong>{part.label}:</strong> {part.text}</span>
          </p>
        )
        : <p key={index} className="cmp-pop-text">{part.text}</p>))}
      {rules && (
        <p className="cmp-pop-buckets">
          {BUCKET_LEVELS.map(level => (
            <span key={level} className="cmp-pop-bucket">
              <CellIcon value={level} />
              <span><strong>{COMPARISON.legend[level]}:</strong> {ruleInWords(rules[level])}</span>
            </span>
          ))}
        </p>
      )}
      {COMPARISON.taskCountNote.includes(column.label) && <p className="cmp-pop-text">{COMPARISON.taskCountNote}</p>}
    </>
  );
}
