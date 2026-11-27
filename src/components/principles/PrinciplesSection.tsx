import { useCallback, useEffect, useRef, useState } from 'react';
import { BenchmarkComparison, type BenchmarkComparisonHandle } from './BenchmarkComparison';
import { DesignPrinciples, type DesignPrinciplesHandle } from './DesignPrinciples';
import '../paper/paper.css';
import './principles.css';

/** While the page scrolls to the table, elements passing under the pointer must not steal the highlight. */
const PIN_SETTLE_MS = 1200;
/** How long the columns of a principle stay highlighted after "Show P<n> in the comparison". */
const PIN_HOLD_MS = 6000;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The paper's design principles (Figure 2) and its benchmark comparison
 * (Table 1). The two blocks share one piece of state, the active principle:
 * pointing at a principle lights its columns in the table, and pointing at a
 * column header emphasises its principle.
 */
export function PrinciplesSection() {
  const [pointed, setPointed] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const principlesRef = useRef<DesignPrinciplesHandle>(null);
  const comparisonRef = useRef<BenchmarkComparisonHandle>(null);
  const comparisonBlockRef = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const holdTimer = useRef<number | undefined>(undefined);

  const clearPin = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    window.clearTimeout(holdTimer.current);
    settling.current = false;
    setPinned(null);
  }, []);
  useEffect(() => () => {
    window.clearTimeout(settleTimer.current);
    window.clearTimeout(holdTimer.current);
  }, []);

  const handleActiveChange = useCallback((principle: number | null) => {
    setPointed(principle);
    // Pointing at something else ends a pinned highlight: the visitor has moved on.
    if (principle !== null && !settling.current) clearPin();
  }, [clearPin]);

  const showInComparison = useCallback((principle: number) => {
    window.clearTimeout(settleTimer.current);
    window.clearTimeout(holdTimer.current);
    settling.current = true;
    setPinned(principle);
    settleTimer.current = window.setTimeout(() => { settling.current = false; }, PIN_SETTLE_MS);
    holdTimer.current = window.setTimeout(() => setPinned(null), PIN_HOLD_MS);

    // Keyboard focus follows the visitor into the table, to the principle's first column.
    comparisonRef.current?.focusPrinciple(principle);

    comparisonBlockRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
  }, []);

  const showPrinciple = useCallback((principle: number) => {
    clearPin();
    principlesRef.current?.reveal(principle);
  }, [clearPin]);

  const activePrinciple = pinned ?? pointed;

  return (
    <div className="prn-section">
      <DesignPrinciples
        ref={principlesRef}
        activePrinciple={activePrinciple}
        onActivePrincipleChange={handleActiveChange}
        onShowInComparison={showInComparison}
      />
      <div className="prn-section-comparison" id="comparison" ref={comparisonBlockRef}>
        <BenchmarkComparison
          ref={comparisonRef}
          activePrinciple={activePrinciple}
          onActivePrincipleChange={handleActiveChange}
          onShowPrinciple={showPrinciple}
        />
      </div>
    </div>
  );
}
