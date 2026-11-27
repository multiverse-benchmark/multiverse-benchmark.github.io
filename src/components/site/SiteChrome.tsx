import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Menu, Moon, Sun, X } from 'lucide-react';
import brandLockup from '../../assets/multiverse-service-orbit-lockup.svg';
import brandLockupInverse from '../../assets/multiverse-service-orbit-lockup-inverse.svg';
import { setColorTheme, useColorTheme } from '../../lib/colorTheme';
import { useDataset } from '../../lib/dataset';
import { LATEST_RELEASE } from '../../lib/release';
import { ReleaseSwitch } from './ReleaseSwitch';
import '../paper/paper.css';
import '../paper/page.css';
import '../brand.css';
import './color-scales.css';

/*
 * What every page of the site shares: the header with its navigation, the
 * footer, and the handling of section links. The pages are separate HTML entries that
 * sit side by side (index.html, deep-dive.html, coming-soon.html), so a link
 * from one to another is relative to the site's base.
 */

/** The main page, from any page. */
export const HOME_URL = import.meta.env.BASE_URL;
/** The deep dive: the task explorer, the result explorer, design principles and comparisons, dataset statistics, the tool explorer, and the releases. */
export const DEEP_DIVE_URL = `${import.meta.env.BASE_URL}deep-dive.html`;
/** The deep dive's task explorer. */
export const TASK_EXPLORER_URL = `${DEEP_DIVE_URL}#explorer`;
/** The deep dive's result explorer, which exists for the latest release only. */
export const RESULT_EXPLORER_URL = `${DEEP_DIVE_URL}#result-explorer`;
/**
 * The validation leaderboard of the latest release on the main page, whose results the result
 * explorer shows task by task. The link names the release, which selects its validation set.
 */
export const VALIDATION_LEADERBOARD_URL = `${HOME_URL}?release=${LATEST_RELEASE}#leaderboard`;
/** The deep dive's section on how the two releases of the benchmark differ. */
export const RELEASES_URL = `${DEEP_DIVE_URL}#releases`;
/**
 * Sections that live on the deep-dive page. A link to one of them on the main page is forwarded there;
 * so is a link that opens a task (#task=...), which belongs to the task explorer.
 */
export const DEEP_DIVE_SECTIONS = ['explorer', 'result-explorer', 'principles', 'comparison', 'dataset', 'tools', 'releases'] as const;
/** Sections that live on the main page. A link to one of them on the deep dive is forwarded there. */
export const MAIN_PAGE_SECTIONS = ['checklist'] as const;

export interface NavItem {
  href: string;
  label: string;
  /** `out`: the link opens another page of the site. `back`: it returns to the main page. */
  kind?: 'out' | 'back';
}

/**
 * The MultiVerse lockup. `onDark`: always the light-on-dark version (the
 * footer). Otherwise both versions are in the page and the theme shows the one
 * that suits its surface (brand.css), so the right one is there before any
 * script runs.
 */
export function Brand({ onDark = false, href = '#' }: { onDark?: boolean; href?: string }) {
  return <a className="brand" href={href} aria-label="MultiVerse home">
    {!onDark && <img className="brand-lockup brand-lockup--on-light" src={brandLockup} alt="" aria-hidden="true" draggable={false} />}
    <img className={onDark ? 'brand-lockup' : 'brand-lockup brand-lockup--on-dark'} src={brandLockupInverse} alt="" aria-hidden="true" draggable={false} />
  </a>;
}

/** The switch between the light and the dark theme, at the right end of the header. */
function ThemeSwitch() {
  const theme = useColorTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className="theme-switch" data-theme-switch onClick={() => setColorTheme(next)} aria-label={`Switch to the ${next} theme`} title={`Switch to the ${next} theme`}>
    {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
  </button>;
}

export function SiteHeader({ navigation, brandHref = '#', releaseSwitch = true }: {
  navigation: readonly NavItem[];
  brandHref?: string;
  /** The floating switch between the releases of the benchmark; a page that shows neither release leaves it out. */
  releaseSwitch?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <><header className="site-header">
    <div className="nav-wrap">
      <Brand href={brandHref} />
      <nav aria-label="Main navigation" className={menuOpen ? 'nav-links open' : 'nav-links'}>
        {navigation.map(item => <a key={item.href} href={item.href} className={item.kind ? `nav-link--${item.kind}` : undefined} onClick={() => setMenuOpen(false)}>
          {item.kind === 'back' && <ArrowLeft size={13} aria-hidden="true" />}
          {item.label}
          {item.kind === 'out' && <ArrowUpRight size={13} aria-hidden="true" />}
        </a>)}
      </nav>
      <div className="nav-tools">
        <ThemeSwitch />
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
    </div>
  </header>{releaseSwitch && <ReleaseSwitch />}</>;
}

export function SiteFooter({ brandHref = '#' }: { brandHref?: string }) {
  const { taskCount: DATASET_TASK_COUNT, release } = useDataset();
  return <footer className="site-footer">
    <div className="page-width footer-main">
      <Brand onDark href={brandHref} />
      <p>A trustworthy tool-use benchmark for real-world<br />task delegation under harnesses.</p>
    </div>
    <div className="page-width footer-bottom">
      <span>MultiVerse</span>
      <span>{release}: {DATASET_TASK_COUNT} validation tasks · ST / IF / MT / MTIF</span>
      <a href="#">Back to top ↑</a>
    </div>
  </footer>;
}

/** How long a link's target is kept in place while the sections above it finish loading. */
const HASH_SETTLE_MS = 4000;

/**
 * Section links such as #leaderboard: the sections render after the browser's
 * own fragment scroll, so repeat it. Sections above the target load their data
 * after that and grow, so the target is brought back into place whenever the
 * page's height changes, for a few seconds or until the visitor scrolls.
 * `forward` maps section ids that live on another page to that page; a link to
 * one of them goes there instead, also when the address changes while the
 * page is open.
 */
export function useHashScroll(forward?: { ids: readonly string[]; url: string }) {
  useEffect(() => {
    /** The section the address refers to, or '' when it names none. */
    const targetOf = (): string => {
      let id = '';
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return ''; }
      // "#task=..." opens a task in the task explorer, "#tool=..." and "#source=..." open a tool or
      // a source file in the tool explorer: the section to bring into view is the explorer's.
      return !id.includes('=') ? id
        : id.startsWith('task=') ? 'explorer'
        : /^(tool|source)=/.test(id) ? 'tools'
        : '';
    };
    /** Goes to the page that holds the section, if that is another page. */
    const leave = (target: string): boolean => {
      if (!target || !forward?.ids.includes(target)) return false;
      // The query goes along: a link can name the release it refers to (?release=v1.0.0).
      window.location.replace(`${forward.url}${window.location.search}${window.location.hash}`);
      return true;
    };
    const onHash = () => { leave(targetOf()); };
    window.addEventListener('hashchange', onHash);
    const stopForwarding = () => window.removeEventListener('hashchange', onHash);

    const target = targetOf();
    if (!target || leave(target)) return stopForwarding;

    let settled = false;
    const place = () => { if (!settled) document.getElementById(target)?.scrollIntoView({ behavior: 'instant', block: 'start' }); };
    const settle = () => { settled = true; };
    const frame = requestAnimationFrame(place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(document.body);
    const timer = window.setTimeout(settle, HASH_SETTLE_MS);
    // The visitor takes over as soon as they scroll themselves.
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    inputs.forEach(name => window.addEventListener(name, settle, { passive: true, once: true }));
    return () => {
      stopForwarding();
      settle();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.clearTimeout(timer);
      inputs.forEach(name => window.removeEventListener(name, settle));
    };
  }, [forward]);
}
