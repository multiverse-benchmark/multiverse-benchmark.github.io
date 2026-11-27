/*
 * The paper's main findings, shown under the leaderboard and the bar chart.
 *
 * The first card (proprietary vs open-weight models) renders GAP_FINDING from
 * src/content/paper.ts verbatim; its headline difference and its two bars are
 * computed from the result table in src/lib/results.ts, and the page test
 * checks that they agree with the numbers the text quotes. The other cards
 * render FINDINGS verbatim.
 *
 * Every figure here is decorative for assistive technology (aria-hidden): the
 * card's stat and body already state each number the figure draws.
 */
import { useEffect, useId, useRef, type CSSProperties, type JSX, type ReactNode, type RefObject } from 'react';
import '../paper/paper.css';
import './findings.css';
import { AccessBadge } from '../paper/shared';
import { FINDINGS, GAP_FINDING, type Finding, type FindingChart } from '../../content/paper';
import { RESULTS, formatRate, type AccessGap, type ResultRow, type SettingId } from '../../lib/results';

/** The findings are those of the paper's study: the results of v1.0.0. */
const STUDY = RESULTS['paper-validation'];
const MODELS = STUDY.models;
const accessGap: typeof STUDY.accessGap = (scope, setting) => STUDY.accessGap(scope, setting);
const pairBehind: typeof STUDY.pairBehind = (row, setting) => STUDY.pairBehind(row, setting);

/** The lead finding compares model-harness pairs on the Average column. */
const SETTING: SettingId = 'Average';

/** Copy of the lead finding, from the paper. */
const GAP_COPY = GAP_FINDING;

/** A model-harness pair, named as in the paper: "GPT 6 Astra with OpenHands". */
const pairName = (row: ResultRow) => `${row.model.name} with ${row.harness.kind === 'bare' ? 'the bare harness' : row.harness.name}`;
const indexLabel = (position: number) => String(position).padStart(2, '0');
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Data-driven lengths and positions reach the stylesheet as custom properties. */
const vars = (values: Record<`--fnd-${string}`, number>) => values as CSSProperties;

/**
 * Keeps hyphenated terms such as "open-weight" and "model-harness" on one
 * line in short display text (titles, labels, captions). The text itself is
 * unchanged: each term is only wrapped in a span.
 */
function unbroken(text: string): ReactNode {
  const parts = text.split(/([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+)/u);
  return parts.map((part, index) => (index % 2 ? <span key={index} className="fnd-nowrap">{part}</span> : part));
}

/** Matches any model name. Longer names come first, so a shorter name never splits one. */
const MODEL_NAME = new RegExp(
  MODELS.map(model => model.name)
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

/**
 * Body text with two guards on line breaking: a model name ("Claude Opus 4.6")
 * is never split across lines, and the last two words stay together, so a
 * paragraph does not end on a single word. The text itself is unchanged: the
 * guarded stretches are only wrapped in spans.
 */
function typeset(text: string): ReactNode {
  const ranges = [...text.matchAll(MODEL_NAME)].map(match => [match.index, match.index + match[0].length]);
  const lastTwoWords = text.search(/\S+\s+\S+\s*$/);
  if (lastTwoWords >= 0) ranges.push([lastTwoWords, text.length]);
  ranges.sort((a, b) => a[0] - b[0]);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (let index = 0; index < ranges.length; index++) {
    const start = ranges[index][0];
    let end = ranges[index][1];
    // Overlapping stretches (a model name that reaches into the last two words) become one.
    while (index + 1 < ranges.length && ranges[index + 1][0] <= end) end = Math.max(end, ranges[++index][1]);
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(<span key={start} className="fnd-nowrap">{text.slice(start, end)}</span>);
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Plays the entrance motion of a card or a figure once, when it is scrolled
 * into view across an edge of the viewport.
 *
 * Content is complete without it. The hook only sets an attribute that starts
 * a CSS animation, so nothing is hidden where the observer never fires
 * (printing, full-page captures). An element that is on screen when the block
 * mounts, or that is already well inside the viewport when first seen (a jump
 * to an anchor, a restored scroll position, an automated capture), is left as
 * it is. Nothing plays under reduced motion.
 */
function useEntranceMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The margin below the viewport starts the motion just before the element shows.
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        const viewport = entry.rootBounds?.height ?? window.innerHeight;
        const { top, bottom } = entry.boundingClientRect;
        // Entering across the bottom edge (scrolling down) or the top edge (scrolling up).
        if (top > viewport * 0.7 || bottom < viewport * 0.3) target.dataset.fndMotion = 'play';
        observer.unobserve(target);
      }
    }, { rootMargin: '0px 0px 24px 0px' });
    for (const target of element.querySelectorAll<HTMLElement>('[data-fnd-motion]')) {
      const box = target.getBoundingClientRect();
      const onScreen = box.top < window.innerHeight && box.bottom > 0;
      if (!onScreen && target.dataset.fndMotion !== 'play') observer.observe(target);
    }
    return () => observer.disconnect();
  }, [root]);
}

/** A stat made of a number and a unit (a percent sign or a word): the number is set large, the unit smaller. */
function Stat({ value, plain }: { value: string; plain?: string }) {
  const match = /^([+−-]?\d[\d.,]*)(\s?(?:%|\p{L}+))$/u.exec(value);
  return (
    <p className="fnd-stat" data-finding-stat data-value={plain}>
      {match ? <>{match[1]}<span className="fnd-stat-unit">{match[2]}</span></> : value}
    </p>
  );
}

interface Tick {
  /** Position along the plot, from 0 to 1. */
  at: number;
  label: string;
}

/** Hairline scale under a plot. Its box is exactly as wide as the plotted range. */
function Axis({ ticks }: { ticks: Tick[] }) {
  return (
    <div className="fnd-axis" data-fnd-plot>
      {ticks.map(tick => (
        <span key={tick.at} className="fnd-tick" style={vars({ '--fnd-at': tick.at })}>
          {tick.label && <span className="fnd-tick-label">{tick.label}</span>}
        </span>
      ))}
    </div>
  );
}

const tickText = (value: number) => (Number.isInteger(value) ? String(value) : '');

/** One thin bar per item on a 0 to `max` scale, with the printed value at the bar's end. */
function BarsChart({ chart }: { chart: FindingChart }) {
  const unit = chart.items.every(item => item.display.endsWith('%')) ? '%' : '';
  const ticks: Tick[] = [
    { at: 0, label: '0' },
    { at: 0.5, label: tickText(chart.max / 2) },
    { at: 1, label: `${tickText(chart.max)}${unit}` },
  ];
  return (
    <div className="fnd-plot">
      {chart.items.map(item => (
        <div key={item.label} className="fnd-row" style={vars({ '--fnd-frac': clamp01(item.value / chart.max) })}>
          <span className="fnd-row-label">{unbroken(item.label)}</span>
          <span className="fnd-track">
            <span className="fnd-bar" data-finding-bar={item.label} data-value={item.value} />
            <span className="fnd-bar-value">{item.display}</span>
          </span>
        </div>
      ))}
      <Axis ticks={ticks} />
    </div>
  );
}

/** Bars that grow right of a zero line for positive values and left of it for negative ones. */
function DivergingChart({ chart }: { chart: FindingChart }) {
  const ticks: Tick[] = [
    { at: 0, label: `−${tickText(chart.max)}` },
    { at: 0.5, label: '0' },
    { at: 1, label: `+${tickText(chart.max)}` },
  ];
  return (
    <div className="fnd-div">
      <div className="fnd-div-rows">
        {chart.items.map(item => {
          const negative = item.value < 0;
          const name = <span className="fnd-div-name">{item.label}</span>;
          const bar = <span className={negative ? 'fnd-bar fnd-bar--neg' : 'fnd-bar'} data-finding-bar={item.label} data-value={item.value} />;
          const value = <span className="fnd-bar-value">{item.display}</span>;
          return (
            <div key={item.label} className="fnd-div-row" style={vars({ '--fnd-frac': clamp01(Math.abs(item.value) / chart.max) })}>
              <span className="fnd-div-half fnd-div-half--left">{negative ? <>{value}{bar}</> : name}</span>
              <span className="fnd-div-half fnd-div-half--right">{negative ? name : <>{bar}{value}</>}</span>
            </div>
          );
        })}
      </div>
      <Axis ticks={ticks} />
    </div>
  );
}

function ChartFigure({ chart }: { chart: FindingChart }) {
  return (
    <figure className="fnd-figure" aria-hidden="true" data-fnd-chart={chart.kind} data-max={chart.max} data-fnd-motion="">
      <figcaption className="fnd-figure-caption">{unbroken(chart.caption)}</figcaption>
      {chart.kind === 'diverging' ? <DivergingChart chart={chart} /> : <BarsChart chart={chart} />}
    </figure>
  );
}

/** The best pair of each group on a 0 to 100% scale, with a connector between the bar ends that carries the gap. */
function GapFigure({ gap }: { gap: AccessGap }) {
  const closed = gap.closed.best.cells[SETTING];
  const open = gap.open.best.cells[SETTING];
  const top = clamp01(closed.mean / 100);
  const bottom = clamp01(open.mean / 100);
  // The gap label sits after the longer bar's end, or before the shorter one when there is no room.
  const labelSide = 1 - Math.max(top, bottom) >= 0.2 || Math.min(top, bottom) < 0.4 ? 'after' : 'before';
  const ticks: Tick[] = [0, 25, 50, 75, 100].map(value => ({ at: value / 100, label: value === 100 ? '100%' : String(value) }));
  return (
    <figure className="fnd-figure fnd-gap" aria-hidden="true" data-fnd-chart="gap" data-max={100} data-fnd-motion="">
      <figcaption className="fnd-figure-caption">{GAP_COPY.caption}</figcaption>
      <div className="fnd-plot" style={vars({ '--fnd-top': top, '--fnd-bottom': bottom })}>
        <div className="fnd-gap-head">
          <AccessBadge access="closed" />
          <span className="fnd-gap-model">{pairName(pairBehind(gap.closed.best, SETTING))}</span>
        </div>
        <div className="fnd-track" style={vars({ '--fnd-frac': top })}>
          <span className="fnd-bar fnd-bar--closed" data-finding-bar="closed" data-value={closed.meanText} />
          <span className="fnd-bar-value">{closed.meanText}%</span>
        </div>
        <div className="fnd-gap-band">
          <span className={top >= bottom ? 'fnd-gap-link fnd-gap-link--fall' : 'fnd-gap-link fnd-gap-link--rise'} />
          <span className={`fnd-gap-delta fnd-gap-delta--${labelSide}`}>{formatRate(gap.bestGap)} {GAP_COPY.unit}</span>
        </div>
        <div className="fnd-track" style={vars({ '--fnd-frac': bottom })}>
          <span className="fnd-bar fnd-bar--open" data-finding-bar="open" data-value={open.meanText} />
          <span className="fnd-bar-value">{open.meanText}%</span>
        </div>
        <div className="fnd-gap-head">
          <AccessBadge access="open" />
          <span className="fnd-gap-model">{pairName(pairBehind(gap.open.best, SETTING))}</span>
        </div>
        <Axis ticks={ticks} />
      </div>
    </figure>
  );
}

/** Lead card: the gap between the strongest pair overall and the strongest pair with an open-weight model. */
function GapCard({ all }: { all: AccessGap }) {
  const titleId = `${useId()}-title`;
  const headline = formatRate(all.bestGap);
  return (
    <article className="fnd-card fnd-card--lead mv-card" data-finding="gap" aria-labelledby={titleId} data-fnd-motion="">
      <span className="fnd-index" aria-hidden="true">{indexLabel(1)}</span>
      <div className="fnd-lead-text">
        <Stat value={`${headline} ${GAP_COPY.unit}`} plain={headline} />
        <p className="fnd-stat-label">{unbroken(GAP_COPY.statLabel)}</p>
        <h3 className="fnd-title" id={titleId}>{unbroken(GAP_COPY.title)}</h3>
        <p className="fnd-body" data-finding-body>{typeset(GAP_COPY.body)}</p>
      </div>
      <GapFigure gap={all} />
    </article>
  );
}

/** A finding stated in the paper: stat, label, title, body, and its small chart when it has one. */
function PaperCard({ finding, position }: { finding: Finding; position: number }) {
  const titleId = `${useId()}-title`;
  return (
    <article className={`fnd-card mv-card ${finding.chart ? 'fnd-card--chart' : 'fnd-card--text'}`} data-finding={finding.id} aria-labelledby={titleId} data-fnd-motion="">
      <span className="fnd-index" aria-hidden="true">{indexLabel(position)}</span>
      <Stat value={finding.stat} />
      <p className="fnd-stat-label">{unbroken(finding.statLabel)}</p>
      <h3 className="fnd-title" id={titleId}>{unbroken(finding.title)}</h3>
      <p className="fnd-body">{typeset(finding.body)}</p>
      {finding.chart && <ChartFigure chart={finding.chart} />}
    </article>
  );
}

/**
 * On a wide screen the first two paper findings share a row and the rest sit
 * three to a row. When one card of the pair has a chart and the other does
 * not, the card with the chart is the wider one and puts the chart beside its text.
 */
function cellClass(index: number): string {
  if (index >= 2) return 'fnd-cell fnd-cell--third';
  const [first, second] = FINDINGS;
  const uneven = Boolean(second) && Boolean(first.chart) !== Boolean(second.chart);
  const span = !uneven ? 6 : FINDINGS[index].chart ? 7 : 5;
  return `fnd-cell fnd-cell--pair fnd-cell--span${span}`;
}

export function Findings(): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  useEntranceMotion(root);
  // Each model under its best harness: the best entries of the two groups are the paper's strongest model-harness pairs.
  const all = accessGap('best', SETTING);
  return (
    <div className="fnd mv-motion" ref={root} data-fnd>
      <ol className="fnd-grid" role="list">
        <li className="fnd-cell fnd-cell--lead">
          <GapCard all={all} />
        </li>
        {FINDINGS.map((finding, index) => (
          <li key={finding.id} className={cellClass(index)}>
            <PaperCard finding={finding} position={index + 2} />
          </li>
        ))}
      </ol>
    </div>
  );
}
