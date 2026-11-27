import { useSyncExternalStore } from 'react';

/**
 * Which release of the benchmark the page shows, as one selection for the
 * whole site.
 *
 * The benchmark has two public releases. v1.0.0 is the version the paper
 * describes and runs its experiments on; v1.1.0 fixes bugs found in the APIs
 * after those experiments, updates the tasks for the corrected APIs, and is
 * recommended for new evaluations and extensions. The deep dive has a section
 * on how the two differ (components/releases/ReleasesSection.tsx). The results
 * section distinguishes three result sets: the paper's results on the
 * validation set of v1.0.0 and the leaderboard of v1.1.0 on its validation
 * and test sets. The other parts of the site (task
 * settings, task explorer, dataset statistics, tool explorer, services) differ
 * by release only.
 *
 * So the selection is stored as a result set and read as a release:
 *
 *   result set          release
 *   paper-validation    v1.0.0  (PAPER_RELEASE)
 *   validation          v1.1.0  (LATEST_RELEASE)
 *   test                v1.1.0  (LATEST_RELEASE)
 *
 * The whole site turns from one release to the other with one switch, fixed
 * at the corner of the window (ReleaseSwitch.tsx). It writes this one value,
 * and every section reads it, on all pages of the site.
 * The two tabs of the leaderboard (validation set, test set) write the same
 * value with setResultSet(); both belong to the latest release, so nothing
 * else moves.
 *
 * Every visit opens on the latest release (validation): that is the default,
 * and the release we recommend. A choice lasts for the visit only: it is kept
 * in the tab's session storage, so it holds across the site's pages and a
 * reload, and a new visit (a new tab, a later day) starts from the default
 * again. A link can name a release: ?release=v1.0.0 or ?release=v1.1.0.
 *
 * The names of the releases are written in this file only. Everything else
 * refers to PAPER_RELEASE and LATEST_RELEASE. The data files carry the same
 * names (src/data/*.<release>.json, public/data/<release>/), and so do the
 * export scripts that write them.
 */
/** The release the paper describes and evaluates. Its data files have no release in their names. */
export const PAPER_RELEASE = 'v1.0.0';
/** The release recommended for new evaluations and extensions. */
export const LATEST_RELEASE = 'v1.1.0';
export type Release = typeof PAPER_RELEASE | typeof LATEST_RELEASE;
export type ResultSet = 'paper-validation' | 'validation' | 'test';

export const RELEASES: readonly Release[] = [LATEST_RELEASE, PAPER_RELEASE];
export const RESULT_SETS: readonly ResultSet[] = ['paper-validation', 'validation', 'test'];
export const DEFAULT_RESULT_SET: ResultSet = 'validation';

/** What each release is, in a few words (the tooltips of the switch). */
export const RELEASE_NOTES: Record<Release, string> = {
  [LATEST_RELEASE]: 'Corrected APIs and updated tasks. Recommended for new evaluations and extensions.',
  [PAPER_RELEASE]: 'The version the paper describes and runs its experiments on.',
};

export const releaseOf = (set: ResultSet): Release => (set === 'paper-validation' ? PAPER_RELEASE : LATEST_RELEASE);

/** Folder of a release's exported data, relative to the site's base: the task explorer's files and the tool source. */
export const dataRoot = (release: Release): string => (release === PAPER_RELEASE ? 'data/' : `data/${release}/`);

const STORAGE_KEY = 'multiverse-result-set';
const isResultSet = (value: unknown): value is ResultSet => RESULT_SETS.includes(value as ResultSet);
const isRelease = (value: unknown): value is Release => RELEASES.includes(value as Release);
const firstSetOf = (release: Release): ResultSet => (release === PAPER_RELEASE ? 'paper-validation' : 'validation');

function initial(): ResultSet {
  if (typeof window === 'undefined') return DEFAULT_RESULT_SET;
  const requested = new URLSearchParams(window.location.search).get('release');
  if (isRelease(requested)) {
    remember(firstSetOf(requested));
    return firstSetOf(requested);
  }
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (isResultSet(saved)) return saved;
  } catch { /* The selection also works when browser storage is disabled. */ }
  return DEFAULT_RESULT_SET;
}

/** Keeps the choice for this visit: the site's other pages and a reload in this tab see it. */
function remember(set: ResultSet) {
  try { window.sessionStorage.setItem(STORAGE_KEY, set); } catch { /* Storage is optional. */ }
}

let current: ResultSet = initial();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

/** Select a result set (a leaderboard's tabs). The release of the rest of the site follows. */
export function setResultSet(set: ResultSet) {
  if (set === current) return;
  current = set;
  remember(set);
  notify();
}

/** Select a release (the site's switch). Within the latest release, a leaderboard keeps the set it was on. */
export function setRelease(release: Release) {
  if (releaseOf(current) !== release) setResultSet(firstSetOf(release));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useResultSet(): ResultSet {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_RESULT_SET);
}

export function useRelease(): Release {
  return releaseOf(useResultSet());
}

/** The selection at this moment, for code outside React. */
export const currentRelease = (): Release => releaseOf(current);
