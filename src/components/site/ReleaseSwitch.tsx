import { RELEASES, RELEASE_NOTES, setRelease, useRelease, type Release } from '../../lib/release';
import './release-switch.css';

/**
 * Keeps the section the reader is in at the same place in the window while the
 * page changes under it. The sections above it can change height when the
 * release changes (other task counts, other texts), and some of their content
 * arrives a moment later, so the place is restored once the page has rendered
 * and again shortly after, unless the reader has scrolled in between.
 * Call it before the release changes; a link inside a section that switches
 * the release uses it too.
 */
export function keepReadingPosition() {
  if (window.scrollY <= 2) return;
  const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
  const sections = [...document.querySelectorAll<HTMLElement>('main > section')];
  const section = sections.find(candidate => candidate.getBoundingClientRect().bottom > headerBottom + 1);
  if (!section) return;
  const offset = section.getBoundingClientRect().top;
  let expected = window.scrollY;
  const restore = () => {
    if (!section.isConnected || Math.abs(window.scrollY - expected) > 2) return;
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - offset, left: window.scrollX, behavior: 'instant' });
    expected = window.scrollY;
  };
  requestAnimationFrame(() => requestAnimationFrame(restore));
  window.setTimeout(restore, 700);
}

/**
 * The switch between the two releases of the benchmark, fixed at the corner of
 * the window on every page. It turns the whole site from one release to the
 * other: the services and tools, the task settings, the task explorer, the
 * dataset statistics, and the tool explorer all show the selected release
 * (src/lib/release.ts).
 */
export function ReleaseSwitch() {
  const release = useRelease();
  const select = (next: Release) => {
    if (next === release) return;
    keepReadingPosition();
    setRelease(next);
  };
  return <div className="release-switch" role="group" aria-label="Benchmark release" data-release-switch data-release={release}>
    <span className="release-switch-label" aria-hidden="true">Release</span>
    {RELEASES.map(option => <button key={option} type="button" aria-pressed={option === release} title={RELEASE_NOTES[option]} onClick={() => select(option)}>{option}</button>)}
  </div>;
}
