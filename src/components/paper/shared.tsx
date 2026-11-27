import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import './paper.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is an abbreviation or an icon. */
  ariaLabel?: string;
  title?: string;
  /** Shown, but not selectable: an option that has nothing behind it yet. The arrow keys pass over it. */
  disabled?: boolean;
}

/**
 * Single-choice segmented control with radio-group semantics: arrow keys move
 * and select, Home/End jump, and only the selected option is in the tab order.
 */
export function Segmented<T extends string>({ label, options, value, onChange, hideLabel = false, className = '' }: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hideLabel?: boolean;
  className?: string;
}) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The keys move among the options that can be selected.
    const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
    const at = enabled.indexOf(options.findIndex(option => option.value === value));
    const next = enabled.length === 0 ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? enabled[(at + 1) % enabled.length]
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? enabled[(Math.max(at, 0) + enabled.length - 1) % enabled.length]
      : event.key === 'Home' ? enabled[0]
      : event.key === 'End' ? enabled[enabled.length - 1]
      : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return <div className={`mv-seg-field ${className}`.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
    <span id={labelId} className={hideLabel ? 'mv-visually-hidden' : 'mv-seg-label'}>{label}</span>
    <div ref={group} className="mv-seg" role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      {/* A disabled option is marked with aria-disabled, not the disabled attribute, so that its title still shows on hover. */}
      {options.map(option => <button key={option.value} type="button" role="radio" className="mv-seg-option" aria-checked={option.value === value} aria-disabled={option.disabled || undefined} aria-label={option.ariaLabel} title={option.title} tabIndex={option.value === value ? 0 : -1} onClick={() => { if (!option.disabled) onChange(option.value); }}>{option.label}</button>)}
    </div>
  </div>;
}

/**
 * Proprietary / open-weight badge (the paper's terms for the two model groups).
 * The dot carries the colour; the word stays in ink. `short` is kept for
 * narrow layouts; the two words are already short, so it changes nothing.
 */
export function AccessBadge({ access }: { access: 'closed' | 'open'; short?: boolean }) {
  const text = access === 'closed' ? 'Proprietary' : 'Open-weight';
  return <span className={`mv-access mv-access--${access}`} data-access={access}>{text}</span>;
}
