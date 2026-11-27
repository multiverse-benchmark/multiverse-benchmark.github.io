import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { DEEP_DIVE_URL, HOME_URL, SiteFooter, SiteHeader, type NavItem } from './components/site/SiteChrome';
import { COMING_SOON, type ComingSoonItem } from './content/citation';
import { DEEP_DIVE } from './content/site';
import brandMark from './assets/multiverse-service-orbit-mark.svg';
import brandMarkInverse from './assets/multiverse-service-orbit-mark-inverse.svg';

/*
 * The placeholder for what is not public yet. The paper's button leads
 * here; "?item=codebase" or "?item=dataset" shows the text for the other
 * two, whose buttons lead to the repository and to the dataset.
 */

const navigation: NavItem[] = [
  { href: HOME_URL, label: 'Main page', kind: 'back' },
  { href: DEEP_DIVE_URL, label: DEEP_DIVE.name, kind: 'out' },
];

function requestedItem(): ComingSoonItem {
  const item = new URLSearchParams(window.location.search).get('item');
  return item === 'codebase' || item === 'dataset' ? item : 'paper';
}

export default function ComingSoon() {
  const item = COMING_SOON[requestedItem()];
  useEffect(() => { document.title = `MultiVerse ${item.name} · Coming soon`; }, [item]);
  return <>
    <SiteHeader brandHref={HOME_URL} navigation={navigation} releaseSwitch={false} />
    <main className="soon page-width">
      <div className="soon-inner">
        {/* Both versions of the mark; the theme shows the one for its surface (page.css). */}
        <img className="soon-mark soon-mark--on-light" src={brandMark} alt="" aria-hidden="true" draggable={false} />
        <img className="soon-mark soon-mark--on-dark" src={brandMarkInverse} alt="" aria-hidden="true" draggable={false} />
        <div className="eyebrow">THE MULTIVERSE {item.name.toUpperCase()}</div>
        <h1>Coming soon.</h1>
        <p className="soon-title">{item.title}</p>
        <p className="soon-text">{item.text}</p>
        <div className="soon-actions">
          <a className="primary-button" href={HOME_URL}><ArrowLeft size={16} aria-hidden="true" /> Back to the main page</a>
          <a className="text-button" href={`${HOME_URL}#paper`}>Paper details and BibTeX <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </main>
    <SiteFooter brandHref={HOME_URL} />
  </>;
}
