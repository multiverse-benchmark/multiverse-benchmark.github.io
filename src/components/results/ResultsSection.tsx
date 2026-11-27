import { useId, useRef, type JSX, type KeyboardEvent } from 'react';
import { ArrowUpRight, Download, Mail } from 'lucide-react';
import '../paper/paper.css';
import './results.css';
import { HARNESS_AVAILABILITY, LEADERBOARD_CONTACT, LEADERBOARD_TABS, RESULTS_COPY } from '../../content/paper';
import { RESULT_EXPLORER } from '../../content/site';
import { LATEST_RELEASE, PAPER_RELEASE, setRelease, setResultSet, type ResultSet } from '../../lib/release';
import { RESULTS, useResults, type Results } from '../../lib/results';
import { boardOf } from '../../lib/resultsBoard';
import { hasRuns } from '../../lib/runs';
import { LeaderboardBoard } from '../leaderboard/LeaderboardBoard';
import type { UnavailableHarnessCopy } from '../leaderboard/LeaderboardControls';
import { RUNS_COPY } from '../runs/copy';
import { keepReadingPosition } from '../site/ReleaseSwitch';
import { RESULT_EXPLORER_URL } from '../site/SiteChrome';

const CSV_FILE_NAME: Record<ResultSet, string> = {
  'paper-validation': `multiverse-${PAPER_RELEASE}-validation-results.csv`,
  validation: `multiverse-${LATEST_RELEASE}-validation-results.csv`,
  test: `multiverse-${LATEST_RELEASE}-test-results.csv`,
};

function downloadCsv(results: Results) {
  const url = URL.createObjectURL(new Blob([results.csv()], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = CSV_FILE_NAME[results.set];
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The tabs of the leaderboard: the validation set and the test set of the
 * latest release. A tab selects a result set for the whole site
 * (src/lib/release.ts); both belong to the same release, so the other sections
 * stay as they are.
 */
function ResultSetTabs({ selected, tabId, panelId }: { selected: ResultSet; tabId: (set: ResultSet) => string; panelId: string }) {
  const list = useRef<HTMLDivElement>(null);

  /* The arrow keys, Home, and End move between the tabs and select, as in a tab list. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const count = LEADERBOARD_TABS.length;
    const index = LEADERBOARD_TABS.findIndex(tab => tab.set === selected);
    const next = event.key === 'ArrowRight' ? (index + 1) % count
      : event.key === 'ArrowLeft' ? (index + count - 1) % count
      : event.key === 'Home' ? 0
      : event.key === 'End' ? count - 1
      : -1;
    if (next < 0 || next === index) return;
    event.preventDefault();
    setResultSet(LEADERBOARD_TABS[next].set);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return <div ref={list} className="res-sets" role="tablist" aria-label="Result set" data-res-sets onKeyDown={onKeyDown}>
    {LEADERBOARD_TABS.map(tab => <button
      key={tab.set}
      type="button"
      role="tab"
      id={tabId(tab.set)}
      className="res-set"
      aria-selected={tab.set === selected}
      aria-controls={panelId}
      tabIndex={tab.set === selected ? 0 : -1}
      data-res-set={tab.set}
      onClick={() => setResultSet(tab.set)}
    >
      <span className="res-set-name">{tab.label}</span>
      <span className="res-set-note">{tab.note(RESULTS[tab.set].totalTasks)}</span>
    </button>)}
  </div>;
}

/**
 * The results section below the page's section heading, for the result set
 * selected on the site.
 *
 * v1.1.0 has tabs for the validation set and the test set, with a contact
 * message for the selected split. The paper's release has no contact callout.
 *
 * In both, the leaderboard itself (src/components/leaderboard) is the same:
 * its controls, then its chart, then its ranked table. It draws the result
 * files that ship with the site (src/lib/resultsBoard.ts); the page asks no
 * server for anything.
 *
 * The latest release has results under the bare harness only. Its harness
 * control still names the end-user harnesses, which cannot be selected, and a
 * note under it says why (HARNESS_AVAILABILITY): the results under them are
 * not available for this release yet, the paper reports them for its own
 * release, and they can be submitted. The note's two actions show the paper's
 * results and lead to the contact for submissions.
 *
 * Under the validation leaderboard of the latest release, a sentence links to
 * the result explorer on the deep-dive page, which shows the same results task
 * by task and links back.
 */
export function ResultsSection(): JSX.Element {
  const results = useResults();
  const copy = RESULTS_COPY[results.set];
  const board = boardOf(results.set);
  const isLeaderboard = results.release !== PAPER_RELEASE;
  // The result explorer shows the runs behind the validation leaderboard of the latest release.
  const hasResultExplorer = results.set === 'validation' && hasRuns(results.release);
  const baseId = useId();
  const tabId = (set: ResultSet) => `${baseId}-tab-${set}`;
  const panelId = `${baseId}-panel`;
  const panel = useRef<HTMLDivElement>(null);
  const contact = useRef<HTMLDivElement>(null);

  /* The note that offers this is gone once the paper's results show, so the focus moves to the panel that holds them. */
  function showPaperResults() {
    keepReadingPosition();
    setRelease(PAPER_RELEASE);
    panel.current?.focus({ preventScroll: true });
  }

  function showContact() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    contact.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    contact.current?.focus({ preventScroll: true });
  }

  const unavailableHarnesses: UnavailableHarnessCopy | undefined = isLeaderboard ? {
    title: HARNESS_AVAILABILITY.title,
    ariaLabel: HARNESS_AVAILABILITY.ariaLabel,
    lead: HARNESS_AVAILABILITY.lead,
    more: HARNESS_AVAILABILITY.more,
    actions: [
      { key: 'paper-results', label: HARNESS_AVAILABILITY.showPaper, onSelect: showPaperResults },
      { key: 'submit', label: HARNESS_AVAILABILITY.submit, onSelect: showContact },
    ],
  } : undefined;

  return <div className="res" data-res data-result-set={results.set}>
    {isLeaderboard && <div ref={contact} className="res-callout res-contact" role="note" aria-label="Leaderboard submissions" tabIndex={-1} data-res-contact>
      <span className="res-callout-icon" aria-hidden="true"><Mail size={18} strokeWidth={1.8} /></span>
      <div className="res-callout-text">
        {results.set === 'validation' ? <p className="res-callout-lead">
          {LEADERBOARD_CONTACT.validation.lead}{' '}
          <a className="res-contact-email" href={`mailto:${LEADERBOARD_CONTACT.email}`} data-res-contact-email>{LEADERBOARD_CONTACT.email}</a>{' '}
          {LEADERBOARD_CONTACT.validation.details}
        </p> : <>
          <p className="res-callout-lead">{LEADERBOARD_CONTACT.test.lead}</p>
          <p className="res-callout-more">
            {LEADERBOARD_CONTACT.test.contact}{' '}
            <a className="res-contact-email" href={`mailto:${LEADERBOARD_CONTACT.email}`} data-res-contact-email>{LEADERBOARD_CONTACT.email}</a>{' '}
            {LEADERBOARD_CONTACT.test.details}
          </p>
        </>}
      </div>
    </div>}
    {isLeaderboard && <ResultSetTabs selected={results.set} tabId={tabId} panelId={panelId} />}

    <div
      ref={panel}
      className="res-panel"
      id={panelId}
      tabIndex={-1}
      role={isLeaderboard ? 'tabpanel' : undefined}
      aria-labelledby={isLeaderboard ? tabId(results.set) : undefined}
    >
      <LeaderboardBoard
        models={board.models}
        runCount={results.runs}
        availableTaskSettings={board.settings}
        availableHarnesses={board.harnesses}
        unavailableHarnesses={unavailableHarnesses}
        boardKey={results.set}
        metric={copy.metric}
      />

      <div className="res-export">
        {/* The same results task by task: the result explorer on the deep-dive page, which links back here. */}
        {hasResultExplorer && <p className="res-explore" data-res-result-explorer>
          {RUNS_COPY.fromLeaderboard.before}{' '}
          <a className="mv-text-link" href={RESULT_EXPLORER_URL}>{RESULT_EXPLORER.title}<ArrowUpRight size={13} aria-hidden="true" /></a>
          {RUNS_COPY.fromLeaderboard.after}
        </p>}
        <button type="button" className="res-download" data-res-download onClick={() => downloadCsv(results)}>
          <Download size={15} strokeWidth={2} aria-hidden="true" />
          Download results (CSV)
        </button>
      </div>

    </div>
  </div>;
}
