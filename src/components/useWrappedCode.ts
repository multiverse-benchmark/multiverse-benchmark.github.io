import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

type CodeToken = { text: string };
const LINE_HEIGHT = 22;

/** Find the original source line containing a vertical pixel offset. */
function lineAt(offsets: Float64Array, top: number) {
  let lo = 0, hi = Math.max(0, offsets.length - 2);
  while (lo < hi) {
    const middle = Math.ceil((lo + hi) / 2);
    if (offsets[middle] <= top) lo = middle;
    else hi = middle - 1;
  }
  return lo;
}

/** Variable-height virtualization keeps original line numbers when code wraps. */
export function useWrappedCode(lines: CodeToken[][], viewer: RefObject<HTMLDivElement | null>, selectedLine: number, ready: boolean) {
  const [metrics, setMetrics] = useState({ columns: 80, width: 600, height: 500, font: '' });
  const [scrollTop, setScrollTop] = useState(0);
  const scrollPosition = useRef(0);
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const previous = useRef<{ offsets: Float64Array; lines: CodeToken[][]; selected: number } | null>(null);

  useLayoutEffect(() => {
    const element = viewer.current;
    if (!element) return;
    const context = document.createElement('canvas').getContext('2d');
    const measure = () => {
      const style = getComputedStyle(element);
      const font = `${style.fontSize} ${style.fontFamily}`;
      if (context) context.font = font;
      const characterWidth = context?.measureText('0').width || 6.6;
      const gutter = parseFloat(style.getPropertyValue('--source-gutter')) || 70;
      const padding = parseFloat(style.getPropertyValue('--source-code-padding')) || 20;
      const width = element.clientWidth;
      const next = { columns: Math.max(1, Math.floor((width - gutter - padding) / characterWidth)), width, height: element.clientHeight, font };
      setMetrics(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewer, ready]);

  const lengths = useMemo(() => lines.map(parts => {
    const text = parts.map(part => part.text).join('');
    // Most source is ASCII. Tab stops are four columns, matching the viewer.
    // Actual rendered heights below correct estimates for Unicode and fonts.
    if (!text.includes('\t')) return text.length;
    let column = 0;
    for (const character of text) column += character === '\t' ? 4 - column % 4 : 1;
    return column;
  }), [lines]);
  const measurements = useMemo(() => new Map<number, number>(), [lines, metrics.width, metrics.font]);
  const offsets = useMemo(() => {
    const values = new Float64Array(lines.length + 1);
    for (let line = 0; line < lines.length; line++) {
      values[line + 1] = values[line] + (measurements.get(line) ?? Math.max(1, Math.ceil(lengths[line] / metrics.columns)) * LINE_HEIGHT);
    }
    return values;
  }, [lines, lengths, metrics.columns, measurements, measurementVersion]);

  useLayoutEffect(() => {
    const element = viewer.current;
    if (!element || !ready || !lines.length) return;
    const old = previous.current;
    let top: number;
    if (!old || old.lines !== lines || old.selected !== selectedLine) {
      // Leave a little context above a selected original source line.
      top = Math.max(0, offsets[Math.max(0, Math.min(selectedLine, lines.length) - 1)] - 3 * LINE_HEIGHT);
    } else {
      // Keep the visible source line anchored while measurements or width change.
      const anchor = lineAt(old.offsets, scrollPosition.current);
      const oldHeight = old.offsets[anchor + 1] - old.offsets[anchor];
      const fraction = oldHeight ? (scrollPosition.current - old.offsets[anchor]) / oldHeight : 0;
      top = offsets[anchor] + fraction * (offsets[anchor + 1] - offsets[anchor]);
    }
    element.scrollTop = top;
    scrollPosition.current = element.scrollTop;
    setScrollTop(element.scrollTop);
    previous.current = { offsets, lines, selected: selectedLine };
  }, [offsets, lines, selectedLine, ready, viewer]);

  const firstLine = lineAt(offsets, Math.max(0, scrollTop - 300));
  const lastLine = Math.min(lines.length, lineAt(offsets, scrollTop + metrics.height + 300) + 1);

  useLayoutEffect(() => {
    const element = viewer.current;
    if (!element || !ready) return;
    const rows = [...element.querySelectorAll<HTMLElement>('.source-code-line')];
    const measure = () => {
      let changed = false;
      for (const row of rows) {
        const line = Number(row.dataset.line) - 1;
        const height = row.getBoundingClientRect().height;
        if (height > 0 && Math.abs(height - (offsets[line + 1] - offsets[line])) > .5) {
          measurements.set(line, height); changed = true;
        }
      }
      if (changed) setMeasurementVersion(value => value + 1);
    };
    // Measure before paint so adjacent wrapped lines never overlap visibly.
    measure();
    const observer = new ResizeObserver(measure);
    rows.forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [firstLine, lastLine, offsets, measurements, ready, viewer]);

  return {
    offsets, firstLine, lastLine, totalHeight: offsets[lines.length],
    onScroll: () => {
      if (!viewer.current) return;
      scrollPosition.current = viewer.current.scrollTop;
      setScrollTop(viewer.current.scrollTop);
    },
  };
}
