import { useRef, useState } from 'react';
import { ArrowUpRight, ExternalLink, Monitor, RotateCw, TriangleAlert } from 'lucide-react';
import { CODE_URL } from '@/content/citation';
import type { MultiverseTask } from '@/types';
import { PAPER_RELEASE, useRelease } from '@/lib/release';

export function DesktopGUI({ task }: { task: MultiverseTask }) {
  const [phase, setPhase] = useState<'initial' | 'final'>('initial');
  const [reload, setReload] = useState(0);
  const [selectedApp, setSelectedApp] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  // The desktop reads the task's saved states of the release that is shown; it takes the paper's release when none is named.
  const release = useRelease();
  const url = `${import.meta.env.BASE_URL}gui/index.html?task=${encodeURIComponent(task.id)}&phase=${phase}${release === PAPER_RELEASE ? '' : `&release=${release}`}${selectedApp ? `&app=${encodeURIComponent(selectedApp)}` : ''}`;

  function currentFrameUrl() {
    try {
      const current = new URL(iframeRef.current?.contentWindow?.location.href || '', window.location.href);
      return current.origin === window.location.origin && current.searchParams.get('task') === task.id ? current : null;
    } catch { return null; }
  }

  function rememberApp() {
    const app = currentFrameUrl()?.searchParams.get('app');
    if (app) setSelectedApp(app);
  }

  function changePhase(next: 'initial' | 'final') {
    if (next === phase && currentFrameUrl()?.searchParams.get('phase') === next) return;
    rememberApp();
    setLoaded(false);
    setPhase(next);
  }

  function frameLoaded() {
    const current = currentFrameUrl();
    // Keep the outer controls in sync when the desktop's own phase switch is used.
    if (current) {
      const actualPhase = current.searchParams.get('phase') === 'final' ? 'final' : 'initial';
      if (actualPhase !== phase) {
        setSelectedApp(current.searchParams.get('app') || '');
        setPhase(actualPhase);
      }
    }
    setLoaded(true);
  }

  return <section className="mv-desktop-gui" aria-label="Interactive MultiVerse desktop">
    <div className="mv-desktop-toolbar">
      <div className="mv-desktop-title"><Monitor size={17} /><span>MultiVerse desktop</span></div>
      <div className="mv-desktop-controls">
        <div className="mv-desktop-phase" role="group" aria-label="Desktop environment state">
          <button type="button" aria-pressed={phase === 'initial'} onClick={() => changePhase('initial')}>Initial state</button>
          <button type="button" aria-pressed={phase === 'final'} onClick={() => changePhase('final')}>Gold final state</button>
        </div>
        <button className="mv-desktop-reload" type="button" aria-label="Reload desktop" title="Reload desktop" onClick={() => { rememberApp(); setLoaded(false); setReload(value => value + 1); }}><RotateCw size={15} /></button>
        <a className="mv-desktop-expand" href={url} onClick={event => { const current = currentFrameUrl(); if (current) event.currentTarget.href = current.href; }} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /><span>Open full screen</span></a>
      </div>
    </div>
    {/* Above the desktop, so it is read before the GUIs are used. */}
    <p className="mv-desktop-note" role="note" data-desktop-note>
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        <strong>The GUIs are supplementary and are not used in the evaluation.</strong>{' '}
        Agents use the simulated services only through tool calls, so a bug in a GUI does not affect benchmark results. Therefore, the GUIs have not undergone thorough quality control; expect bugs and room for improvement. Pull requests that fix or improve them are welcome in the{' '}
        <a className="mv-text-link" href={CODE_URL} target="_blank" rel="noreferrer">code repository<ArrowUpRight size={12} aria-hidden="true" /></a>.
      </span>
    </p>
    <div className="mv-desktop-frame-wrap">
      {!loaded && <div className="mv-desktop-loading" role="status">Opening the desktop…</div>}
      <iframe ref={iframeRef} key={`${phase}-${reload}`} src={url} title={`MultiVerse desktop: ${task.title} — ${phase === 'initial' ? 'initial state' : 'gold final state'}`} className="mv-desktop-frame" sandbox="allow-scripts allow-same-origin allow-downloads" loading="eager" onLoad={frameLoaded} />
    </div>
  </section>;
}
