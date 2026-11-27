import { useMemo } from 'react';
import { HowItWorks } from './components/HowItWorks';
import { Citation, PaperInfo, type PaperSectionLinks } from './components/PaperInfo';
import { TaskSettings } from './components/TaskSettings';
import { ToolsEnvironment } from './components/ToolsEnvironment';
import { OverviewFigure, type OverviewLinks } from './components/overview/OverviewFigure';
import { AbcAssessment, AbcLead } from './components/principles/AbcAssessment';
import { ResultsSection } from './components/results/ResultsSection';
import { DiveCards } from './components/site/DiveCards';
import { SectionHeading } from './components/site/SectionHeading';
import { DEEP_DIVE_SECTIONS, DEEP_DIVE_URL, RESULT_EXPLORER_URL, SiteFooter, SiteHeader, TASK_EXPLORER_URL, useHashScroll, type NavItem } from './components/site/SiteChrome';
import { ENVIRONMENT, RESULTS_COPY, type ResultsCopy } from './content/paper';
import { DEEP_DIVE, RESULT_EXPLORER, TASK_EXPLORER } from './content/site';
import { useDataset } from './lib/dataset';
import { useResults } from './lib/results';
import { hasRuns } from './lib/runs';
import { useServices } from './lib/services';

/*
 * The main page: what MultiVerse is, one worked example, the results, and the
 * benchmark's assessment against an external checklist. The material for a
 * closer look (the task explorer, the result explorer, design principles and
 * comparisons, dataset statistics, the tool explorer, and how the two releases
 * differ) is on the deep-dive page (DeepDive.tsx), which this page links to.
 *
 * The results section is the leaderboard of v1.1.0 (validation and test set)
 * or, for v1.0.0, the results presented in the paper, which are not called a
 * leaderboard. Each fact is stated once where it belongs, and nothing here
 * fixes the number of models: the leaderboard takes new results.
 *
 * The page opens with the paper's title block (title, authors, links), gives
 * each section a plain numbered title, and ends with the citation. Under the
 * title block is the overview figure (components/overview), the benchmark in
 * one schematic, whose parts link to the sections below.
 */

/**
 * The sections that the title block's buttons, the overview figure under it and
 * the navigation lead to, with the id and the title each has on this page.
 */
const SECTIONS = {
  environment: { id: 'tools-environment', title: 'Tools and environment' },
  settings: { id: 'settings', title: 'Task settings' },
  walkthrough: { id: 'how-it-works', title: 'How it works' },
  quality: { id: 'checklist', title: 'Benchmark quality' },
} as const;
const linkTo = (section: { id: string; title: string }) => ({ href: `#${section.id}`, label: section.title });

/** The tabs of the navigation. The results tab carries the name the section has for the selected release. */
const navigationFor = (results: ResultsCopy): NavItem[] => [
  { href: '#paper', label: 'Paper' },
  { href: '#codebase', label: 'Codebase' },
  { href: '#how-it-works', label: 'How it works' },
  { href: `#${results.anchor}`, label: results.name },
  { href: DEEP_DIVE_URL, label: DEEP_DIVE.name, kind: 'out' },
];

/** Links to sections that are on the deep-dive page, and links that open a task, lead there. */
const FORWARD = { ids: DEEP_DIVE_SECTIONS, url: DEEP_DIVE_URL };

export default function App() {
  useHashScroll(FORWARD);
  // Every section that differs between the releases shows the one selected with the switch at the
  // corner of the window: tools, task settings, and the results.
  const { taskCount } = useDataset();
  const { toolCount } = useServices();
  const results = useResults();
  const resultsCopy = RESULTS_COPY[results.set];
  const navigation = useMemo(() => navigationFor(resultsCopy), [resultsCopy]);
  // Each part of the overview figure leads to the section that describes it.
  const overviewLinks = useMemo<OverviewLinks>(() => ({
    task: linkTo(SECTIONS.settings),
    agent: { href: `#${resultsCopy.anchor}`, label: resultsCopy.name },
    services: linkTo(SECTIONS.environment),
    verifiers: linkTo(SECTIONS.quality),
    walkthrough: linkTo(SECTIONS.walkthrough),
  }), [resultsCopy]);
  // The title block's buttons: to the results on this page, and to the task explorer and (for a
  // release that has one) the result explorer on the deep-dive page.
  const withResultExplorer = hasRuns(results.release);
  const sectionLinks = useMemo<PaperSectionLinks>(() => ({
    explorer: { href: TASK_EXPLORER_URL, label: TASK_EXPLORER.title },
    results: { href: `#${resultsCopy.anchor}`, label: resultsCopy.name },
    resultExplorer: withResultExplorer ? { href: RESULT_EXPLORER_URL, label: RESULT_EXPLORER.title } : undefined,
  }), [resultsCopy, withResultExplorer]);
  return <>
    <a className="skip-link" href={`#${resultsCopy.anchor}`}>Skip to {resultsCopy.name.toLowerCase()}</a>
    <SiteHeader navigation={navigation} />
    <main>
      {/* The paper's title block: title, authors, links, licenses, and the release that is shown. */}
      <PaperInfo sections={sectionLinks}/>

      {/* The benchmark in one figure, where the abstract was: the paper's Figure 1 without its example. */}
      <OverviewFigure links={overviewLinks}/>

      {/* The environment first: every simulated service, inside the sandbox. */}
      <section id={SECTIONS.environment.id} className="environment-section section-space"><div className="page-width">
        <SectionHeading title={SECTIONS.environment.title} number="1" lead={ENVIRONMENT.lead(toolCount)}/>
        <ToolsEnvironment toolExplorerPage={DEEP_DIVE_URL}/>
      </div></section>

      <section id={SECTIONS.settings.id} className="settings-section section-space"><div className="page-width">
        <SectionHeading title={SECTIONS.settings.title} number="2"
          lead={<>The {taskCount} validation tasks span four task settings that emphasize different demands.</>}/>
        <TaskSettings/>
      </div></section>

      <section id={SECTIONS.walkthrough.id} className="how-section page-width section-space">
        <SectionHeading title={SECTIONS.walkthrough.title} number="3"
          lead="Follow the example of the paper’s Figure 1 step by step: a user query, three developer/user instructions, and one detail that only the user knows. Compare a failure case and a success case, see how each verifier responds, and open the same records in the MultiVerse desktop."/>
        <HowItWorks/>
      </section>

      {/* "Results" (#results) for v1.0.0, the paper's release; "Leaderboard" (#leaderboard) for v1.1.0. */}
      <section id={resultsCopy.anchor} className="results-section page-width section-space">
        {/* A link that uses the section's other name still lands here. */}
        <span id={resultsCopy.anchor === 'results' ? 'leaderboard' : 'results'} className="results-anchor" aria-hidden="true" />
        <SectionHeading title={resultsCopy.name} number="4" lead={resultsCopy.lead(results.totalTasks)}/>
        <ResultsSection/>
      </section>

      {/* Why the numbers above can be trusted: the benchmark assessed against an external checklist. */}
      <section id={SECTIONS.quality.id} className="quality-section section-space"><div className="page-width">
        <SectionHeading title={SECTIONS.quality.title} number="5" lead={<AbcLead/>}/>
        <AbcAssessment heading={false}/>
      </div></section>

      {/* The page points to the deep dive: its parts as cards. */}
      <section id="deep-dive" className="dive-section section-space"><div className="page-width">
        <SectionHeading title={DEEP_DIVE.name} number="6"/>
        <DiveCards base={DEEP_DIVE_URL}/>
      </div></section>

      <Citation/>
    </main>
    <SiteFooter />
  </>;
}
