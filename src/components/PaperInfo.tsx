import { useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, Code2, Compass, Copy, Database, FileText, ListChecks, ListOrdered, Quote, Scale } from 'lucide-react';
import { AFFILIATIONS, AUTHORS, BIBTEX, CODE_IS_PUBLIC, CODE_URL, DATA_IS_PUBLIC, DATA_URL, LICENSES, PAPER_IS_PUBLIC, PAPER_TITLE, PAPER_URL } from '../content/citation';
import { CONTACT_EMAIL } from '../content/paper';
import { RELEASE_DIFFERENCES_LINK, RELEASE_LINE } from '../content/releases';
import { RELEASES, setRelease, useRelease } from '../lib/release';
import { SectionHeading } from './site/SectionHeading';
import { RELEASES_URL } from './site/SiteChrome';
import './paper-info.css';

// Preserve the paper's author-group breaks while names still wrap within each group.
const AUTHOR_GROUP_ENDS = new Set(['Rafael Mosquera-Gómez', 'Peter Mattson']);

/** Authors with their marks, affiliations, what the marks mean, and the contact address. */
function Byline() {
  return <>
    <p className="paper-authors">
      {AUTHORS.flatMap((author, index) => [
        <span key={`${author.given} ${author.family}`} className={`paper-author${author.core ? ' paper-byline-emphasis' : ''}`}>
          {author.given} {author.family}
          <sup>
            {author.affiliations.join(',')}
            {author.core && '*'}
            {author.lead && '†'}
          </sup>
          {index < AUTHORS.length - 1 && ','}
        </span>,
        // Keep each name and its superscripts together; break the line between the author groups.
        AUTHOR_GROUP_ENDS.has(`${author.given} ${author.family}`)
          ? <br key={`break-after-${author.given}-${author.family}`} />
          : ' ',
      ])}
    </p>
    <p className="paper-affiliations">
      {AFFILIATIONS.map((name, index) => <span key={name} className={name === 'Google DeepMind' ? 'paper-byline-emphasis' : undefined}><sup>{index + 1}</sup>{name}</span>)}
    </p>
    <p className="paper-marks"><span><sup>*</sup>Core contributor</span><span><sup>†</sup>Project lead</span></p>
    <p className="paper-contact"><a className="mv-link" href={`mailto:${CONTACT_EMAIL}`} data-paper-contact>{CONTACT_EMAIL}</a></p>
  </>;
}

/** Links to the paper, the codebase, and the dataset. One that is not public yet is marked "coming soon"; the paper's leads to a placeholder page until then. */
function PaperLinks() {
  return <>
    <a className="primary-button mv-focusable paper-button paper-button--paper" href={PAPER_URL} target="_blank" rel="noreferrer">
      <span className="paper-link-label"><FileText size={16} /> Paper{!PAPER_IS_PUBLIC && <span className="paper-soon">coming soon</span>}</span>
      <ArrowUpRight size={18} />
    </a>
    <a className="primary-button mv-focusable paper-button paper-button--code" href={CODE_URL} target="_blank" rel="noreferrer">
      <span className="paper-link-label"><Code2 size={16} /> Codebase{!CODE_IS_PUBLIC && <span className="paper-soon">coming soon</span>}</span>
      <ArrowUpRight size={18} />
    </a>
    <a className="primary-button mv-focusable paper-button paper-button--data" href={DATA_URL} target="_blank" rel="noreferrer">
      <span className="paper-link-label"><Database size={16} /> Dataset{!DATA_IS_PUBLIC && <span className="paper-soon">coming soon</span>}</span>
      <ArrowUpRight size={18} />
    </a>
  </>;
}

/** A section of the site that a button of the title block leads to. */
export interface PaperSectionLink {
  href: string;
  label: string;
}

/**
 * The parts of the site that the title block's buttons lead to: the results section of this page
 * under the name it has for the release that is shown ("Leaderboard" for the latest release,
 * "Results" for the release the paper describes), the task explorer on the deep-dive page, and
 * next to it the result explorer for a release that has one.
 */
export interface PaperSectionLinks {
  explorer: PaperSectionLink;
  results: PaperSectionLink;
  /** Absent for a release without a result explorer. */
  resultExplorer?: PaperSectionLink;
}

/**
 * A button that moves down this page to the results section, and buttons that open the task
 * explorer and the result explorer on the deep-dive page.
 */
function SectionLinks({ sections }: { sections: PaperSectionLinks }) {
  return <>
    <a className="primary-button mv-focusable paper-button paper-button--results" href={sections.results.href}>
      <span className="paper-link-label"><ListOrdered size={16} /> {sections.results.label}</span>
      <ArrowDown size={17} />
    </a>
    <a className="primary-button mv-focusable paper-button paper-button--explorer" href={sections.explorer.href}>
      <span className="paper-link-label"><Compass size={16} /> {sections.explorer.label}</span>
      <ArrowUpRight size={18} />
    </a>
    {sections.resultExplorer && <a className="primary-button mv-focusable paper-button paper-button--result-explorer" href={sections.resultExplorer.href}>
      <span className="paper-link-label"><ListChecks size={16} /> {sections.resultExplorer.label}</span>
      <ArrowUpRight size={18} />
    </a>}
  </>;
}

/** The licenses of the release, in small print under the links. */
function Licenses() {
  return <p className="paper-licenses" data-paper-licenses>
    <span className="paper-licenses-label"><Scale size={13} aria-hidden="true" />License</span>
    {LICENSES.map(item => <span key={item.what}>{item.what}: <strong>{item.license}</strong></span>)}
  </p>;
}

/**
 * Which release of the benchmark the site is showing, which one the paper describes and which
 * one is recommended, a link to the deep dive's section on how the two differ, and a way to the
 * other release. The switch at the corner of the window does the same from anywhere on the page.
 */
function ReleaseLine() {
  const release = useRelease();
  const other = RELEASES.find(candidate => candidate !== release)!;
  return <p className="paper-release" data-paper-release={release}>
    <span>Showing release <strong>{release}</strong>{RELEASE_LINE[release]}</span>
    <a className="mv-link" href={RELEASES_URL} data-paper-release-differences>{RELEASE_DIFFERENCES_LINK}<ArrowUpRight size={13} aria-hidden="true" /></a>
    <button type="button" className="mv-link" onClick={() => setRelease(other)}>Show {other}</button>
  </p>;
}

/** The BibTeX entry with a copy button. */
function Bibtex() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BIBTEX);
    } catch {
      // Clipboard API unavailable (for example over plain http): fall back to a hidden textarea.
      const area = document.createElement('textarea');
      area.value = BIBTEX;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } finally { area.remove(); }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return <div className="paper-bibtex">
    <div className="paper-bibtex-head">
      <span className="mv-seg-label">BibTeX</span>
      <button type="button" className="mv-link" onClick={copy}>
        {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
      </button>
      <span className="mv-visually-hidden" role="status">{copied ? 'BibTeX copied' : ''}</span>
    </div>
    <pre tabIndex={0} aria-label="BibTeX entry"><code>{BIBTEX}</code></pre>
  </div>;
}

/**
 * The title block that opens the page, as on a paper's first page: title,
 * authors, and links to the paper, the codebase, and the dataset, followed by
 * buttons to the results section of this page and to the task explorer. The BibTeX
 * entry is the Citation section at the end of the page (<Citation />).
 */
export function PaperInfo({ sections }: { sections: PaperSectionLinks }) {
  return <section id="paper" className="paper-info page-width" aria-label="Paper and code">
    {/* The Codebase tab of the navigation lands on this block too, and marks the Codebase button. */}
    <span id="codebase" className="paper-anchor" aria-hidden="true" />
    <h1 className="paper-title">{PAPER_TITLE}</h1>
    <Byline />
    <div className="paper-links">
      {/* Published elsewhere, then on this page: the row breaks between the two groups first. */}
      <div className="paper-links-group">
        <PaperLinks />
      </div>
      <div className="paper-links-group">
        <SectionLinks sections={sections} />
        <a className="primary-button mv-focusable paper-button paper-button--cite" href="#citation">
          <span className="paper-link-label"><Quote size={15} /> BibTeX</span>
          <ArrowDown size={17} />
        </a>
      </div>
    </div>
    <Licenses />
    <ReleaseLine />
  </section>;
}

/** How to cite the paper, at the end of the page. */
export function Citation() {
  return <section id="citation" className="citation-section section-space">
    <div className="page-width">
      <SectionHeading title="Citation" />
      <Bibtex />
    </div>
  </section>;
}
