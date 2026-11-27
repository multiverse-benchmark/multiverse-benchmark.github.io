/**
 * Pieces shared by the three plots of the dataset statistics section: element
 * measurement, the count axis, the hover and focus state of a plot's marks,
 * the tooltip, the "Show as table" toggle, and a single-choice control that
 * can disable options.
 */
import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type FocusEvent, type JSX, type KeyboardEvent, type ReactNode, type RefObject,
} from 'react';
import { Table2 } from 'lucide-react';

/* ---- measurement -------------------------------------------------------- */

/** Width of an element in CSS pixels, kept current with a ResizeObserver. It is 0 until the element is measured. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/* ---- words and scales --------------------------------------------------- */

/** "tool call" becomes "tool calls" unless the count is one. Every unit of the dataset module takes a plain "s". */
export const plural = (unit: string, count: number): string => (count === 1 ? unit : `${unit}s`);

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "MT and MTIF", "ST, IF, and MT". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/** A count axis from zero: whole-number ticks, at most `intervals` steps, top tick at or above the largest count. */
export function countScale(largest: number, intervals = 5): { max: number; ticks: number[] } {
  const step = TICK_STEPS.find(candidate => Math.ceil(largest / candidate) <= intervals) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const steps = Math.max(1, Math.ceil(largest / step));
  return { max: steps * step, ticks: Array.from({ length: steps + 1 }, (_, index) => index * step) };
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/* ---- marks: hover, focus, arrow keys ------------------------------------ */

export interface MarkProps {
  tabIndex: number;
  'data-dst-mark': '';
  'data-active': 'true' | undefined;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface Marks {
  /** Index of the mark whose tooltip is shown, or null. */
  active: number | null;
  /** True when the active mark was reached with the keyboard. */
  byKeyboard: boolean;
  /** Report the mark under the pointer (null when the pointer leaves). */
  hover: (index: number | null) => void;
  /** Move keyboard focus to a mark, which also shows its tooltip. */
  focusMark: (index: number) => void;
  /** Props for the element of mark `index`. */
  markProps: (index: number) => MarkProps;
}

/**
 * State of a plot's marks. Each mark is an element with `data-dst-mark`
 * inside `container`, in index order. One mark is in the tab order; the arrow
 * keys along `axis` move between them, Home and End jump to the ends, and
 * Escape hides the tooltip. The tooltip follows the pointer, and otherwise
 * the focused mark.
 */
export function useMarks(count: number, axis: 'x' | 'y', container: RefObject<HTMLElement | null>): Marks {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [byKeyboard, setByKeyboard] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tabStop, setTabStop] = useState(0);

  const focusMark = (index: number) => {
    container.current?.querySelectorAll<HTMLElement>('[data-dst-mark]')[index]?.focus();
  };

  // A tap outside the plot releases a tooltip that a tap opened.
  useEffect(() => {
    if (focused === null) return;
    const release = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !(event.target instanceof Node) || container.current?.contains(event.target)) return;
      if (document.activeElement instanceof HTMLElement && container.current?.contains(document.activeElement)) document.activeElement.blur();
    };
    document.addEventListener('pointerdown', release);
    return () => document.removeEventListener('pointerdown', release);
  }, [focused, container]);

  const current = hovered ?? focused;
  const active = dismissed || current === null || current >= count ? null : current;
  const stop = clamp(tabStop, 0, Math.max(0, count - 1));
  const [previous, next] = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];

  return {
    active,
    byKeyboard: byKeyboard && hovered === null,
    hover: index => {
      setHovered(index);
      if (index !== null) setDismissed(false);
    },
    focusMark,
    markProps: index => ({
      tabIndex: index === stop ? 0 : -1,
      'data-dst-mark': '',
      'data-active': active === index ? 'true' : undefined,
      onFocus: event => {
        setFocused(index);
        setTabStop(index);
        setDismissed(false);
        setByKeyboard(event.currentTarget.matches(':focus-visible'));
      },
      onBlur: () => {
        setFocused(null);
        setByKeyboard(false);
      },
      onKeyDown: event => {
        if (event.key === 'Escape') {
          setDismissed(true);
          return;
        }
        const target = event.key === previous ? index - 1
          : event.key === next ? index + 1
          : event.key === 'Home' ? 0
          : event.key === 'End' ? count - 1
          : null;
        if (target === null) return;
        event.preventDefault();
        focusMark(clamp(target, 0, count - 1));
      },
    }),
  };
}

/* ---- tooltip ------------------------------------------------------------ */

export interface AnchorBox { left: number; right: number; top: number; bottom: number }

/** Space kept free at the top of the viewport for the page's sticky header. */
const VIEWPORT_TOP = 84;
const TOOLTIP_GAP = 8;

/**
 * Tooltip for the active mark. It is centred above the mark's box and kept
 * inside `container` horizontally. When it would leave the top of the
 * viewport there, it moves below the box, or, for a tall box such as a
 * histogram slot, beside the box at its top. It is decoration for assistive
 * technology: the same content is in the mark's accessible name and in the
 * table view.
 */
export function ChartTooltip({ container, anchor, anchorKey, fallback = 'below', children }: {
  /** Positioned ancestor that the tooltip is placed in. */
  container: RefObject<HTMLElement | null>;
  /** Box of the active mark in viewport coordinates. */
  anchor: () => AnchorBox | null;
  /** Changes whenever the tooltip must be placed again. */
  anchorKey: string;
  /** Where the tooltip goes when there is no room above the box. */
  fallback?: 'below' | 'beside';
  children: ReactNode;
}): JSX.Element {
  const tooltip = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ key: string; left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = tooltip.current;
    const box = anchor();
    if (!element || !container.current || !box) return;
    const frame = container.current.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const limit = Math.max(0, frame.width - width);
    let left = clamp((box.left + box.right) / 2 - frame.left - width / 2, 0, limit);
    let top = box.top - TOOLTIP_GAP - height;
    if (top < VIEWPORT_TOP) {
      // Beside the box: to its right, or to its left when the right side has no room. Below it when neither side has.
      const toRight = box.right + TOOLTIP_GAP - frame.left;
      const toLeft = box.left - TOOLTIP_GAP - width - frame.left;
      const side = fallback === 'beside' ? (toRight <= limit ? toRight : toLeft >= 0 ? toLeft : null) : null;
      if (side === null) top = box.bottom + TOOLTIP_GAP;
      else {
        left = side;
        top = box.top + TOOLTIP_GAP;
      }
    }
    setPlaced({ key: anchorKey, left, top: top - frame.top });
    // `anchor` is a new closure on every render, so it is not a dependency: `anchorKey` says when its result changes.
  }, [anchorKey]);

  const ready = placed?.key === anchorKey;
  const style: CSSProperties = ready ? { left: placed.left, top: placed.top } : { left: 0, top: 0, visibility: 'hidden' };
  return <div ref={tooltip} className="dst-tip" data-dst-tip="" aria-hidden="true" style={style}>{children}</div>;
}

/* ---- table view --------------------------------------------------------- */

/** Button that shows or hides the table with a plot's numbers. `about` completes its accessible name. */
export function TableToggle({ open, onToggle, controls, about }: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  about: string;
}): JSX.Element {
  const text = open ? 'Hide table' : 'Show as table';
  return <button type="button" className="dst-table-toggle" aria-label={`${text}: ${about}`} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
    <Table2 size={14} strokeWidth={1.8} aria-hidden="true" />
    <span>{text}</span>
  </button>;
}

/** The part of a card that a table toggle shows or hides. Its tables are rendered only while it is open. */
export function TablePanel({ id, open, children }: { id: string; open: boolean; children: () => ReactNode }): JSX.Element {
  return <div id={id} className="dst-table-panel" hidden={!open}>{open && children()}</div>;
}

/**
 * A table with a plot's numbers. The title stays in place above the table;
 * a table wider than the card scrolls inside its own region, with the first
 * column kept in view.
 */
export function DataTable({ title, text = false, children }: {
  title: string;
  /** The table has columns of running text, which may wrap. */
  text?: boolean;
  children: ReactNode;
}): JSX.Element {
  const titleId = useId();
  return <div className="dst-table-box">
    <p id={titleId} className="dst-table-title">{title}</p>
    <div className="dst-table-scroll" role="region" aria-labelledby={titleId} tabIndex={0}>
      <table className={text ? 'dst-table dst-table--text' : 'dst-table'} aria-labelledby={titleId}>{children}</table>
    </div>
  </div>;
}

/* ---- single-choice control with disabled options ------------------------ */

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is an abbreviation. */
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}

/**
 * Single-choice control with radio-group semantics, like `Segmented` in
 * ../paper/shared.tsx (whose markup and classes the "segmented" variant
 * reuses), with two additions that the shared control does not have: options
 * can be disabled, and a "list" variant stacks the options vertically.
 * Arrow keys move and select, skipping disabled options; Home and End jump.
 */
export function ChoiceGroup<T extends string>({ label, options, value, onChange, variant, hook, describedBy }: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant: 'segmented' | 'list';
  /** Name of a data attribute for tests; it is set on the radio group and holds the current value. */
  hook?: `data-${string}`;
  /** Id of an element that describes the current choice. */
  describedBy?: string;
}): JSX.Element {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const vertical = variant === 'list';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = options.map((option, index) => ({ option, index })).filter(entry => !entry.option.disabled);
    const at = enabled.findIndex(entry => entry.option.value === value);
    if (!enabled.length) return;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const target = forward ? enabled[(at + 1) % enabled.length]
      : backward ? enabled[(at + enabled.length - 1) % enabled.length]
      : event.key === 'Home' ? enabled[0]
      : event.key === 'End' ? enabled[enabled.length - 1]
      : null;
    if (!target) return;
    event.preventDefault();
    onChange(target.option.value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[target.index]?.focus();
  }

  const hookProps = hook ? { [hook]: value } : {};
  return <div className={vertical ? 'dst-choice dst-choice--list' : 'dst-choice dst-choice--segmented mv-seg-field'}>
    <span id={labelId} className="mv-seg-label">{label}</span>
    <div
      ref={group}
      className={vertical ? 'dst-choice-list' : 'mv-seg'}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-orientation={vertical ? 'vertical' : undefined}
      onKeyDown={onKeyDown}
      {...hookProps}
    >
      {options.map(option => <button
        key={option.value}
        type="button"
        role="radio"
        className={vertical ? 'dst-choice-option' : 'mv-seg-option'}
        aria-checked={option.value === value}
        aria-label={option.ariaLabel}
        aria-disabled={option.disabled || undefined}
        disabled={option.disabled}
        title={option.title}
        tabIndex={option.value === value ? 0 : -1}
        data-value={option.value}
        onClick={() => onChange(option.value)}
      >{option.label}</button>)}
    </div>
  </div>;
}
