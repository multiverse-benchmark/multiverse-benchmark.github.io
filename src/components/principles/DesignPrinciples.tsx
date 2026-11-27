import {
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { PRINCIPLES_INTRO, PRINCIPLE_GROUPS, type PrincipleGroupId } from '../../content/paper';
import { columnsForPrinciple } from '../../lib/comparison';
import '../paper/paper.css';
import './principles.css';

export interface DesignPrinciplesHandle {
  /** Opens a principle's definition, moves focus to it, and scrolls it into view. */
  reveal: (principle: number) => void;
}

export interface DesignPrinciplesProps {
  activePrinciple: number | null;
  onActivePrincipleChange: (principle: number | null) => void;
  onShowInComparison: (principle: number) => void;
  /** Optional handle, used by PrinciplesSection to open a principle from the comparison table. */
  ref?: Ref<DesignPrinciplesHandle>;
}

type IntroPart = string | { group: PrincipleGroupId; text: string };

/**
 * Splits the intro sentence where it uses a group's tagline ("pose the real
 * problem", "measure it correctly"), so each phrase can be marked in the colour
 * of the panel that carries it. The words themselves stay the paper's.
 */
function splitIntro(): IntroPart[] {
  let parts: IntroPart[] = [PRINCIPLES_INTRO];
  for (const group of PRINCIPLE_GROUPS) {
    parts = parts.flatMap((part): IntroPart[] => {
      if (typeof part !== 'string') return [part];
      const start = part.toLowerCase().indexOf(group.tagline.toLowerCase());
      if (start < 0) return [part];
      const end = start + group.tagline.length;
      return [part.slice(0, start), { group: group.id, text: part.slice(start, end) }, part.slice(end)];
    });
  }
  return parts.filter(part => typeof part !== 'string' || part.length > 0);
}

const INTRO_PARTS = splitIntro();
const ALL_NUMBERS = PRINCIPLE_GROUPS.flatMap(group => group.principles.map(principle => principle.number));

/** idle: shown, no motion. pending: waiting off screen for the entrance. done: entrance played or playing. */
type EntranceState = 'idle' | 'pending' | 'done';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function DesignPrinciples({ activePrinciple, onActivePrincipleChange, onShowInComparison, ref }: DesignPrinciplesProps) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [entrance, setEntrance] = useState<EntranceState>('idle');
  const allExpanded = expanded.size === ALL_NUMBERS.length;

  const toggle = useCallback((principle: number) => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (!next.delete(principle)) next.add(principle);
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    reveal(principle: number) {
      flushSync(() => {
        setExpanded(previous => (previous.has(principle) ? previous : new Set(previous).add(principle)));
        setEntrance(state => (state === 'pending' ? 'done' : state));
      });
      const item = rootRef.current?.querySelector<HTMLElement>(`[data-prn-principle="${principle}"]`);
      if (!item) return;
      // Focus first without scrolling, so the browser's jump does not cancel the smooth scroll.
      item.querySelector<HTMLElement>('[data-prn-toggle]')?.focus({ preventScroll: true });
      item.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'center' });
    },
  }), []);

  /*
   * Entrance. The principles fade and rise once, when the block first scrolls
   * into view. They are hidden beforehand only after the visitor has started
   * scrolling and while the block is still below the viewport, so a page that
   * is never scrolled (a print, a full-page capture) shows them as they are.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const belowViewport = () => root.getBoundingClientRect().top >= window.innerHeight;
    if (!belowViewport()) {
      setEntrance('done');
      return;
    }
    let observer: IntersectionObserver | undefined;
    const arm = () => {
      window.removeEventListener('scroll', arm);
      if (!belowViewport()) return;
      setEntrance('pending');
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        setEntrance('done');
        observer?.disconnect();
      }, { rootMargin: '0px 0px -10% 0px' });
      observer.observe(root);
    };
    window.addEventListener('scroll', arm, { passive: true });
    return () => {
      window.removeEventListener('scroll', arm);
      observer?.disconnect();
    };
  }, []);

  /*
   * Equal weight for the two panels. One group has five principles and the
   * other six, so the rows of the shorter panel are spaced a little further
   * apart until both panels are the same height with every definition closed:
   * first rows start level and last rows end level, as in the paper's figure.
   * The spacing is computed from the always-visible part of each row, so
   * opening a definition in one panel never moves the rows of the other.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-prn-group]')).map(panel => ({
      panel,
      head: panel.querySelector<HTMLElement>('.prn-group-head'),
      list: panel.querySelector<HTMLElement>('.prn-list'),
      rows: Array.from(panel.querySelectorAll<HTMLElement>('.prn-main')),
    }));
    const balance = () => {
      const sideBySide = panels.length > 1 && panels.every(({ panel }) => Math.abs(panel.offsetTop - panels[0].panel.offsetTop) < 2);
      const heights = panels.map(({ head, rows }) => (head?.getBoundingClientRect().height ?? 0) + rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0));
      const tallest = Math.max(...heights);
      panels.forEach(({ list, rows }, index) => {
        if (!list) return;
        const gaps = rows.length - 1;
        const extra = sideBySide && gaps > 0 ? Math.max(0, (tallest - heights[index]) / gaps) : 0;
        const value = `${extra.toFixed(2)}px`;
        if (list.style.getPropertyValue('--prn-balance') !== value) list.style.setProperty('--prn-balance', value);
      });
    };
    // Rebalance on the next frame: writing sizes inside the observer callback would resize what it observes.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(balance);
    });
    observer.observe(root);
    for (const { head, rows } of panels) {
      if (head) observer.observe(head);
      rows.forEach(row => observer.observe(row));
    }
    balance();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="prn-root" ref={rootRef} data-reveal={entrance}>
      <div className="prn-top">
        <p className="prn-intro">
          {INTRO_PARTS.map((part, index) => (typeof part === 'string'
            ? part
            : <span key={index} className={`prn-hinge prn-hinge--${part.group}`}>{part.text}</span>))}
        </p>
        <button
          type="button"
          className="prn-expand-all"
          data-prn-expand-all
          onClick={() => setExpanded(allExpanded ? new Set<number>() : new Set(ALL_NUMBERS))}
        >
          {allExpanded ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}
          <span>{allExpanded ? 'Collapse all' : 'Expand all definitions'}</span>
        </button>
      </div>

      <div className="prn-columns">
        {PRINCIPLE_GROUPS.map(group => {
          const first = group.principles[0]?.number;
          const last = group.principles[group.principles.length - 1]?.number;
          const titleId = `${uid}-group-${group.id}`;
          return (
            <section key={group.id} className={`prn-group prn-group--${group.id}`} data-prn-group={group.id} aria-labelledby={titleId}>
              <header className="prn-group-head">
                <p className="prn-group-range">Dimensions {first}–{last}</p>
                <div className="prn-group-line">
                  <h3 className="prn-group-title" id={titleId}>{group.title}</h3>
                  <p className="prn-group-tagline">{group.tagline}</p>
                </div>
              </header>
              <ol className="prn-list" start={first}>
                {group.principles.map((principle, index) => {
                  const open = expanded.has(principle.number);
                  const moreId = `${uid}-more-${principle.number}`;
                  const columns = columnsForPrinciple(principle.number);
                  return (
                    <li
                      key={principle.number}
                      className="prn-item"
                      data-prn-principle={principle.number}
                      data-active={activePrinciple === principle.number ? 'true' : undefined}
                      data-expanded={open ? 'true' : undefined}
                      style={{ '--prn-i': index } as CSSProperties}
                      onMouseEnter={() => onActivePrincipleChange(principle.number)}
                      onMouseLeave={() => onActivePrincipleChange(null)}
                      onFocus={() => onActivePrincipleChange(principle.number)}
                      onBlur={(event: FocusEvent<HTMLLIElement>) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActivePrincipleChange(null);
                      }}
                    >
                      <div className="prn-main">
                        <span className="prn-badge" aria-hidden="true">{principle.number}</span>
                        <div className="prn-body">
                          <div className="prn-headline">
                            <h4 className="prn-title">
                              <span className="mv-visually-hidden">Dimension {principle.number}: </span>
                              {principle.title}
                            </h4>
                            <button
                              type="button"
                              className="prn-toggle"
                              data-prn-toggle
                              aria-expanded={open}
                              aria-controls={moreId}
                              onClick={() => toggle(principle.number)}
                            >
                              <span className="prn-toggle-text">
                                Definition
                                <span className="mv-visually-hidden"> of dimension {principle.number}, {principle.title}</span>
                              </span>
                              <ChevronDown className="prn-toggle-icon" size={15} aria-hidden="true" />
                            </button>
                          </div>
                          <p className="prn-short">{principle.short}</p>
                          <p className="prn-mv" data-prn-in-multiverse>
                            <span className="prn-mv-icon" aria-hidden="true"><Check size={11} strokeWidth={3.2} /></span>
                            <span className="prn-mv-copy">
                              <span className="prn-mv-label">In MultiVerse</span>
                              <span className="mv-visually-hidden">: </span>
                              {principle.inMultiVerse}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="prn-more" id={moreId} data-open={open ? 'true' : undefined}>
                        <div className="prn-more-clip">
                          <div className="prn-more-body">
                            <p className="prn-definition" data-prn-definition>{principle.definition}</p>
                            {columns.length > 0 && (
                              <p className="prn-cols">
                                <span className="prn-cols-label">{columns.length === 1 ? 'Column in the comparison' : 'Columns in the comparison'}</span>
                                <span className="mv-visually-hidden">: </span>
                                {columns.map((column, columnIndex) => (
                                  <span key={column.id} className="mv-chip">
                                    {column.label}
                                    {columnIndex < columns.length - 1 && <span className="mv-visually-hidden">, </span>}
                                  </span>
                                ))}
                              </p>
                            )}
                            <button
                              type="button"
                              className="mv-link prn-show"
                              data-prn-show-comparison={principle.number}
                              onClick={() => onShowInComparison(principle.number)}
                            >
                              Show D{principle.number} in the comparison
                              <ArrowDown size={13} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
