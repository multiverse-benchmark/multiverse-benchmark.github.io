import { ArrowUpRight } from 'lucide-react';
import { DatasetStatistics } from './components/dataset/DatasetStatistics';
import { Explorer } from './components/explorer/Explorer';
import { PrinciplesSection } from './components/principles/PrinciplesSection';
import { TaskResultsGrid } from './components/runs/TaskResultsGrid';
import { RUNS_COPY } from './components/runs/copy';
import { DiveCards } from './components/site/DiveCards';
import { SectionHeading } from './components/site/SectionHeading';
import { HOME_URL, MAIN_PAGE_SECTIONS, SiteFooter, SiteHeader, VALIDATION_LEADERBOARD_URL, useHashScroll, type NavItem } from './components/site/SiteChrome';
import { ReleasesSection } from './components/releases/ReleasesSection';
import { ToolExplorer } from './components/ToolExplorer';
import { RELEASES_SECTION } from './content/releases';
import { DEEP_DIVE, RESULT_EXPLORER, TASK_EXPLORER } from './content/site';
import { useDataset } from './lib/dataset';
import { hasRuns } from './lib/runs';

/*
 * The deep dive: the parts of the site for readers who want to look closely
 * at the benchmark itself. The main page (App.tsx) introduces MultiVerse and
 * its results and links here. As on the main page, each section has a plain
 * numbered title.
 *
 * The page opens with the two explorers: the task explorer, and for the
 * latest release the result explorer, whose cells open a model's run of a
 * task in the task explorer above it. The result explorer's lead links to the
 * validation leaderboard on the main page, which links back to it. The other
 * release has no result explorer, so the sections after it are numbered from
 * one lower.
 */

/** The tabs of the navigation, for a release with or without the result explorer. */
const navigationFor = (withResults: boolean): NavItem[] => [
  { href: HOME_URL, label: 'Main page', kind: 'back' },
  { href: `#${TASK_EXPLORER.id}`, label: 'Tasks' },
  ...(withResults ? [{ href: `#${RESULT_EXPLORER.id}`, label: 'Results' }] : []),
  { href: '#principles', label: 'Design' },
  { href: '#comparison', label: 'Comparison' },
  { href: '#dataset', label: 'Statistics' },
  { href: '#tools', label: 'Tools' },
  { href: `#${RELEASES_SECTION.id}`, label: RELEASES_SECTION.title },
];

/** The checklist assessment is on the main page; a link to it on this page leads there. */
const FORWARD = { ids: MAIN_PAGE_SECTIONS, url: HOME_URL };

export default function DeepDive() {
  useHashScroll(FORWARD);
  // The explorers, the dataset statistics and the tool explorer show the release selected with the switch at the corner of the window.
  const { taskCount, release } = useDataset();
  const withResults = hasRuns(release);
  // The sections are numbered in the order of the page.
  let section = 0;
  const number = () => String(++section);
  return <>
    <a className="skip-link" href={`#${TASK_EXPLORER.id}`}>Skip to task explorer</a>
    <SiteHeader brandHref={HOME_URL} navigation={navigationFor(withResults)} />
    <main>
      <section className="dive-hero page-width">
        <h1 className="page-title">MultiVerse: {DEEP_DIVE.name.toLowerCase()}</h1>
        <DiveCards/>
      </section>

      <section id={TASK_EXPLORER.id} className="explorer-section section-space"><div className="page-width">
        <SectionHeading title={TASK_EXPLORER.title} number={number()}/>
        <Explorer/>
      </div></section>

      {/* The results behind the validation leaderboard of the latest release, task by task. */}
      {withResults && <section id={RESULT_EXPLORER.id} className="result-explorer-section section-space"><div className="page-width">
        <SectionHeading title={RESULT_EXPLORER.title} number={number()} lead={<>
          {RUNS_COPY.grid.lead.before}{' '}
          <a className="mv-text-link" href={VALIDATION_LEADERBOARD_URL} data-result-explorer-leaderboard>{RUNS_COPY.grid.lead.link}<ArrowUpRight size={13} aria-hidden="true" /></a>
          {RUNS_COPY.grid.lead.after}
        </>}/>
        <TaskResultsGrid/>
      </div></section>}

      <section id="principles" className="principles-section section-space"><div className="page-width">
        <SectionHeading title="Design dimensions" number={number()}
          lead="Eleven design dimensions for tool-use benchmarks, how MultiVerse meets each one, and how other benchmarks compare."/>
        <PrinciplesSection/>
      </div></section>

      <section id="dataset" className="dataset-section section-space"><div className="page-width">
        <SectionHeading title="Dataset statistics" number={number()}
          lead={<>Statistics of the {taskCount} validation tasks: the tools and services each task exposes, the length of its gold solution, and the instruction rubrics it is scored on.</>}/>
        <DatasetStatistics/>
      </div></section>

      <section id="tools" className="tools-section section-space"><div className="page-width">
        <SectionHeading title="Tool explorer" number={number()}/>
        <ToolExplorer/>
      </div></section>

      {/* How the two releases differ. The main page links here from its title block and from the paper's results. */}
      <section id={RELEASES_SECTION.id} className="releases-section section-space"><div className="page-width">
        <SectionHeading title={RELEASES_SECTION.title} number={number()} lead={RELEASES_SECTION.lead}/>
        <ReleasesSection/>
      </div></section>
    </main>
    <SiteFooter brandHref={HOME_URL} />
  </>;
}
