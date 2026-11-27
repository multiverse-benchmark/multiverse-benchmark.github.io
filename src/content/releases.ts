/**
 * Copy about the two releases of the benchmark: the line under the title block
 * of the main page, and the deep dive's section on how the releases differ
 * (components/releases/ReleasesSection.tsx).
 *
 * Where the text comes from:
 *
 * - The account of the two releases follows the paper: it describes the APIs
 *   and tasks of v1.0.0 and reports its experimental results on them; v1.1.0
 *   fixes bugs found in the APIs after those experiments, brings IF and MTIF
 *   from 97 and 99 to 100 tasks, and is recommended for new evaluations and
 *   extensions.
 * - What the bugs were, how the tasks were updated, and where the added tasks
 *   come from are the sentences of the paper's appendix on the later release
 *   (paragraph "Changes to the benchmark"), and "reproducing or directly
 *   comparing with the paper's experiments" is from its first paragraph.
 * - Every number (tasks, tasks per setting, tools, services) is read from the
 *   data of the release it describes, never typed here.
 */
import { LATEST_RELEASE, PAPER_RELEASE, type Release } from '../lib/release';

/** Under the title block: "Showing release <name>" continues with this, for the release that is shown. */
export const RELEASE_LINE: Record<Release, string> = {
  [LATEST_RELEASE]: `, recommended for new evaluations and extensions. The paper describes ${PAPER_RELEASE}.`,
  [PAPER_RELEASE]: `, the version the paper describes. We recommend ${LATEST_RELEASE} for new evaluations and extensions.`,
};

/** The link to the deep dive's section on the releases, wherever the page names both. */
export const RELEASE_DIFFERENCES_LINK = 'How the releases differ';

/** What the section needs to know about one release; the component fills it in from the release's data. */
export interface ReleaseFacts {
  taskCount: number;
  settingCounts: Record<'ST' | 'IF' | 'MT' | 'MTIF', number>;
  tools: number;
  services: number;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (value: number) => NUMBER_WORDS[value] ?? String(value);
const settingsLine = (facts: ReleaseFacts) => (['ST', 'IF', 'MT', 'MTIF'] as const).map(id => `${id} ${facts.settingCounts[id]}`).join(' · ');

/** What the results section of the main page shows for each release. */
const RESULTS_ON_SITE: Record<Release, string> = {
  [PAPER_RELEASE]: 'The results presented in the paper: every model under a bare harness and four end-user harnesses, averaged over three runs',
  [LATEST_RELEASE]: 'The leaderboard: validation set and hidden test set, under the bare harness, with one scored trajectory per model and task',
};

export const RELEASES_SECTION = {
  id: 'releases',
  title: 'Releases',
  lead: `MultiVerse has two releases. The paper describes the APIs and tasks of ${PAPER_RELEASE} and reports its experimental results on them. ${LATEST_RELEASE} fixes bugs that we found in the APIs after those experiments and adds tasks to two task settings. It also includes targeted revisions to task instructions and evaluation criteria, alongside corrections to initial states and reference outcomes. We recommend ${LATEST_RELEASE} for new evaluations and extensions.`,

  changesTitle: `What changed in ${LATEST_RELEASE}`,
  /** The three changes, in the order the section lists them. */
  changes: (paper: ReleaseFacts, latest: ReleaseFacts) => [
    {
      key: 'apis',
      title: 'Bugs in the APIs are fixed',
      text: `After the paper’s experiments, we found bugs in the APIs: service behaviors that rejected valid requests or failed to preserve intended state changes. The bugs did not affect the solvability of the tasks, because agents usually found workarounds. ${LATEST_RELEASE} fixes them.`,
    },
    {
      key: 'tasks',
      title: 'Targeted task and evaluation revisions',
      text: 'Tasks are updated for the corrected APIs. The release also includes targeted revisions to task instructions and evaluation criteria, alongside corrections to initial states and reference outcomes.',
    },
    {
      key: 'counts',
      title: `IF and MTIF are replenished to ${latest.settingCounts.IF} tasks each`,
      text: `In ${PAPER_RELEASE}, the IF setting has ${paper.settingCounts.IF} validation tasks and the MTIF setting has ${paper.settingCounts.MTIF}. The ${LATEST_RELEASE} validation set preserves all ${paper.taskCount} task identities of ${PAPER_RELEASE} and adds ${word(latest.taskCount - paper.taskCount)} tasks from the larger annotated pool.`,
    },
  ],

  tableTitle: 'The two releases side by side',
  /** Under the comparison: how to see either release on the site. */
  /** The column headings: the release's name is added by the component. */
  columns: {
    [PAPER_RELEASE]: 'Described in the paper',
    [LATEST_RELEASE]: 'Recommended',
  } as Record<Release, string>,
  resultsLinks: {
    [PAPER_RELEASE]: { label: 'View paper results', anchor: 'results' },
    [LATEST_RELEASE]: { label: 'View leaderboard', anchor: 'leaderboard' },
  } as Record<Release, { label: string; anchor: string }>,
  /** The rows of the comparison, each with one value per release. */
  rows: (facts: Record<Release, ReleaseFacts>) => [
    { key: 'tasks', label: 'Validation tasks', value: (release: Release) => String(facts[release].taskCount) },
    { key: 'settings', label: 'Tasks per setting', value: (release: Release) => settingsLine(facts[release]) },
    { key: 'tools', label: 'Tools', value: (release: Release) => `${facts[release].tools} tools in ${facts[release].services} services` },
    { key: 'results', label: 'Results on this site', value: (release: Release) => RESULTS_ON_SITE[release] },
    {
      key: 'developer-instructions',
      label: 'Developer instruction placement',
      value: (release: Release) => (release === PAPER_RELEASE
        ? 'Developer instructions are placed in the system instructions for the bare harness and in the user prompt for the end-user harnesses.'
        : 'Developer instructions are placed in the system instructions for evaluation.'),
    },
    {
      key: 'use',
      label: 'Use it for',
      value: (release: Release) => (release === PAPER_RELEASE
        ? 'Reproducing or directly comparing with the paper’s experiments'
        : 'New evaluations and extensions'),
    },
  ],
} as const;
