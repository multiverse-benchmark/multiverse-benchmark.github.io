import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Monitor, RotateCw } from 'lucide-react';
import { EXAMPLE, OVERVIEW, type TourStepId } from '../content/paper';
import { fetchStaticJson } from '../lib/staticData';
import { AppTile, TaskShowcase, TRAJECTORY_ID, appName, appTarget, describeDesktop, evidenceTarget, tourStepTarget, type ShowcaseData, type ShowcasePhase, type ShowcaseTarget } from './TaskShowcase';
import './paper/paper.css';
import './environment-demo.css';

const demoId = 'figure1-message-demo';
type Phase = ShowcasePhase;

/**
 * The desktop GUI is laid out for a canvas at least this wide (its mail app shows three panes).
 * A narrower frame is scaled down to fit, but never below MIN_SCALE; on phones the frame keeps
 * its natural size and scrolls sideways instead (see environment-demo.css).
 */
const CANVAS_WIDTH = 1024;
const MIN_SCALE = 0.66;

/** The final state is the success case's: the state after its tool calls ran in the simulator. */
const PHASE_NAMES: Record<Phase, string> = { initial: 'Initial state', final: 'Final state' };

export interface EnvironmentDemoHandle {
  /** Open a walkthrough step (and its desktop target) and scroll the walkthrough into view. */
  openStep(step: TourStepId): void;
  /** Open one of the example's apps in the desktop, in the initial state, and scroll the desktop into view. */
  openApp(app: string): void;
}

/** A request to bring a walkthrough step's header into view once the step has rendered. */
interface Reveal {
  step: TourStepId;
  /** Move keyboard focus to the step's header. */
  focus: boolean;
  /** `jump`: scroll the walkthrough into view. `keep`: scroll only if the step left the view. */
  scroll: 'jump' | 'keep';
  seq: number;
}

const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Height of the sticky site header as the page declares it (scroll-padding-top); 0 where there is none. */
const topInset = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

/** The paper's Figure 1 as a worked example: its five steps beside the actual MultiVerse desktop. */
export const EnvironmentDemo = forwardRef<EnvironmentDemoHandle>(function EnvironmentDemo(_props, ref) {
  const [phase, setPhase] = useState<Phase>('initial');
  const [selectedApp, setSelectedApp] = useState('gridwell_mail');
  const [selectedRecord, setSelectedRecord] = useState('thread-066');
  const [selectedView, setSelectedView] = useState('');
  const [activeStep, setActiveStep] = useState<TourStepId>('task');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseData | null>(null);
  const [showcaseError, setShowcaseError] = useState('');
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [sideways, setSideways] = useState(false);
  /** The app (and record) the visitor has since opened from the desktop's own dock, when it differs from the last target. */
  const [browsed, setBrowsed] = useState<{ app: string; record: string } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const walkthroughRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** A step chosen before the example data arrived; its desktop target is applied once the data is there. */
  const pendingStep = useRef<TourStepId | null>(null);
  const url = `${import.meta.env.BASE_URL}gui/index.html?demo=${demoId}&phase=${phase}&app=${encodeURIComponent(selectedApp)}${selectedRecord ? `&record=${encodeURIComponent(selectedRecord)}` : ''}${selectedView ? `&view=${encodeURIComponent(selectedView)}` : ''}`;
  /** What the desktop shows: the app, the matching walkthrough target, and what to look for in it. */
  const shownApp = browsed?.app ?? selectedApp;
  const shown = describeDesktop(showcase, shownApp, browsed ? browsed.record : selectedRecord, phase);

  useEffect(() => {
    const controller = new AbortController();
    fetchStaticJson<ShowcaseData>('data/dinner-showcase.json', controller.signal).then(setShowcase).catch(error => { if (error.name !== 'AbortError') setShowcaseError(error.message); });
    return () => controller.abort();
  }, []);

  // Fit the desktop canvas to the frame before the GUI lays out its windows.
  useLayoutEffect(() => {
    const wrap = frameWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const width = wrap.clientWidth;
      setScale(width > 0 ? Math.round(Math.min(1, Math.max(MIN_SCALE, width / CANVAS_WIDTH)) * 1000) / 1000 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // On phones the frame scrolls sideways (same breakpoint as the stylesheet), so it must be focusable.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setSideways(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // The desktop reports an app opened from its own dock only in its address. Follow it, so that
  // the strip above the frame and the pressed buttons keep naming what is actually open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = currentFrameUrl()?.searchParams;
      const app = current?.get('app');
      if (!current || !app) return;
      const record = current.get('record') || '';
      setBrowsed(previous => (app === selectedApp && record === selectedRecord ? null : previous?.app === app && previous.record === record ? previous : { app, record }));
    }, 500);
    return () => window.clearInterval(timer);
  }, [selectedApp, selectedRecord]);

  // A step chosen while the data was loading gets its desktop target now.
  useEffect(() => {
    if (!showcase || !pendingStep.current) return;
    const target = tourStepTarget(showcase, pendingStep.current);
    pendingStep.current = null;
    if (target) inspectTarget(target, { scroll: false, reuse: true });
  }, [showcase]);

  // Bring the chosen step's header into view after it has rendered.
  useEffect(() => {
    if (!reveal) return;
    const header = rootRef.current?.querySelector<HTMLElement>(`[data-tour-step="${reveal.step}"]`);
    if (!header) return;
    if (reveal.focus) header.focus({ preventScroll: true });
    const inset = topInset();
    const top = header.getBoundingClientRect().top;
    // Scroll to the highest of these that still leaves the step's header in the upper part of the
    // window: the whole example (when jumping here), else the walkthrough, which lines the desktop
    // up beside it, else the step itself.
    const anchors = reveal.scroll === 'jump' ? [rootRef.current, walkthroughRef.current, header] : [walkthroughRef.current, header];
    const anchor = anchors.find(element => element && inset + top - element.getBoundingClientRect().top <= window.innerHeight * 0.45) ?? header;
    // An accordion moves its headers when a panel above closes. Stay put while the header and
    // the anchor are both on screen; follow only when one of them has left the view.
    if (reveal.scroll === 'keep' && top >= inset && top <= window.innerHeight - 140 && anchor.getBoundingClientRect().top >= inset - 1) return;
    anchor.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, [reveal, showcase]);

  function currentFrameUrl() {
    try {
      const current = new URL(iframeRef.current?.contentWindow?.location.href || '', window.location.href);
      return current.origin === window.location.origin && current.searchParams.get('demo') === demoId ? current : null;
    } catch { return null; }
  }

  function rememberApp() {
    const current = currentFrameUrl();
    if (current?.searchParams.get('app')) {
      setSelectedApp(current.searchParams.get('app')!);
      setSelectedRecord(current.searchParams.get('record') || '');
      setSelectedView(current.searchParams.get('view') || '');
      setBrowsed(null);
    }
  }

  /** Whether enough of the desktop frame is on screen to see a record open in it. */
  function desktopInView() {
    const frame = frameWrapRef.current;
    if (!frame) return true;
    const rect = frame.getBoundingClientRect();
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, topInset());
    return visible >= Math.min(rect.height, window.innerHeight - topInset()) * 0.6;
  }

  /**
   * Point the desktop at a record or an app.
   * `scroll`: bring the desktop into view when it is not (the default); keyboard focus moves with it.
   * `reuse`: skip the reload when the desktop already shows exactly this target.
   */
  function inspectTarget(target: ShowcaseTarget, options: { scroll?: boolean; reuse?: boolean } = {}) {
    const current = options.reuse ? currentFrameUrl()?.searchParams : null;
    const alreadyShown = current != null && current.get('phase') === target.phase && current.get('app') === target.app
      && (current.get('record') || '') === (target.record || '') && (current.get('view') || '') === (target.view || '');
    setSelectedApp(target.app);
    setSelectedRecord(target.record || '');
    setSelectedView(target.view || '');
    setPhase(target.phase);
    setBrowsed(null);
    if (!alreadyShown) {
      setLoaded(false);
      // A repeated target should restore its selected native record as well.
      setReload(value => value + 1);
    }
    if (options.scroll === false) return;
    requestAnimationFrame(() => {
      const desktop = desktopRef.current;
      if (!desktop || desktopInView()) return;
      desktop.focus({ preventScroll: true });
      desktop.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
  }

  function changePhase(next: Phase) {
    if (next === phase && currentFrameUrl()?.searchParams.get('phase') === next) return;
    rememberApp();
    setLoaded(false);
    setPhase(next);
  }

  function frameLoaded() {
    const current = currentFrameUrl();
    if (current) {
      const actualPhase: Phase = current.searchParams.get('phase') === 'final' ? 'final' : 'initial';
      // The native desktop has its own state switch; keep these controls in sync.
      if (actualPhase !== phase) {
        setSelectedApp(current.searchParams.get('app') || 'gridwell_mail');
        setSelectedRecord(current.searchParams.get('record') || '');
        setSelectedView(current.searchParams.get('view') || '');
        setPhase(actualPhase);
        setBrowsed(null);
      }
    }
    setLoaded(true);
  }

  /** Open a walkthrough step and point the desktop at the record the step is about, without scrolling to the desktop. */
  function selectStep(step: TourStepId, options: { focus: boolean; scroll: Reveal['scroll'] }) {
    const target = showcase ? tourStepTarget(showcase, step) : null;
    if (!showcase) pendingStep.current = step;
    // Choosing the open step again restores its record; moving to a step whose record is already open reloads nothing.
    if (target) inspectTarget(target, { scroll: false, reuse: step !== activeStep });
    setActiveStep(step);
    setReveal(previous => ({ step, ...options, seq: (previous?.seq ?? 0) + 1 }));
  }

  useImperativeHandle(ref, () => ({
    openStep(step) {
      selectStep(step, { focus: true, scroll: 'jump' });
    },
    openApp(app) {
      // An app that holds one of the example's records opens at that record.
      const item = showcase?.referenceEvidence.items.find(value => value.before.app === app);
      inspectTarget((showcase && item && evidenceTarget(showcase, item.id, 'initial')) || appTarget(app));
    },
  }));

  return <section className="environment-demo" ref={rootRef} aria-label="The paper's Figure 1, step by step, in the MultiVerse desktop" data-tour-active={activeStep}>
    <header className="environment-example">
      <div className="environment-example-heading">
        <h3>{EXAMPLE.title}</h3>
        <ul className="environment-example-chips" role="list">
          <li className="mv-chip">Paper example: Figure 1</li>
          <li className="mv-chip">Multi-turn + instruction following</li>
        </ul>
        <a className="environment-example-link" href={`#${TRAJECTORY_ID}`}>
          All steps of the success case
          <ArrowDown size={14} aria-hidden="true" />
        </a>
      </div>
      <p className="environment-example-note" data-showcase-scope>{OVERVIEW.caption}</p>
    </header>

    <div className="environment-layout">
      <div className="environment-walkthrough" ref={walkthroughRef}>
        {showcase
          ? <TaskShowcase data={showcase} activeStep={activeStep} onSelectStep={(step, options) => selectStep(step, { ...options, scroll: 'keep' })} onNavigate={target => inspectTarget(target)} activeTarget={shown.targetId} />
          : showcaseError
            ? <p className="showcase-error" role="alert">The example could not be loaded. <a href={`${import.meta.env.BASE_URL}data/dinner-showcase.json`}>Open the example data.</a></p>
            : <p className="showcase-loading" role="status">Loading the example…</p>}
      </div>

      <div className="environment-desktop">
        <div className="environment-gui-highlight">
          <span className="environment-gui-highlight-icon" aria-hidden="true"><Monitor size={20} /></span>
          <div>
            <h3>Every service comes with a GUI you can use.</h3>
            <p>All 35 simulated services have a graphical app, not only an API. People can browse records and perform actions, such as sending a message or editing a calendar event, through the same simulated APIs that agents call.</p>
            <p><strong>Build on them.</strong> The interfaces could support annotation tools that record a person’s actions in the GUI as gold trajectories, or a computer-use version of MultiVerse in which agents operate the same services through the GUI.</p>
          </div>
        </div>
        <div className="environment-native" ref={desktopRef} role="group" aria-label="MultiVerse desktop" tabIndex={-1} data-desktop-app={shownApp} data-desktop-phase={phase}>
          <div className="environment-native-toolbar">
            <div className="environment-native-title">
              <Monitor size={18} aria-hidden="true" />
              <span>MultiVerse desktop<small>App interfaces with saved task states</small></span>
            </div>
            <div className="environment-native-controls">
              <div className="environment-native-phase" role="group" aria-label="Desktop state">
                <button type="button" aria-pressed={phase === 'initial'} onClick={() => changePhase('initial')}>{PHASE_NAMES.initial}</button>
                <button type="button" aria-pressed={phase === 'final'} onClick={() => changePhase('final')}>{PHASE_NAMES.final}</button>
              </div>
              <button className="environment-native-reload" type="button" aria-label="Reload desktop" onClick={() => { rememberApp(); setLoaded(false); setReload(value => value + 1); }}>
                <RotateCw size={15} aria-hidden="true" />
              </button>
              <a className="environment-native-expand" href={url} target="_blank" rel="noopener noreferrer" onClick={event => { const current = currentFrameUrl(); if (current) event.currentTarget.href = current.href; }}>
                <ExternalLink size={14} aria-hidden="true" />
                <span>Open full screen</span>
              </a>
            </div>
          </div>

          <div className="showcase-desktop-context">
            <div className="environment-context-now" role="status" data-desktop-target={shown.targetId}>
              <AppTile app={shownApp} />
              <p>
                <strong>{appName(shownApp)}</strong>
                {' '}
                <span className="environment-context-phase">{PHASE_NAMES[phase]}</span>
                {shown.detail && <> <span className="environment-context-detail">{shown.detail}</span></>}
              </p>
            </div>
            <button type="button" className="environment-context-back" onClick={() => setReveal(previous => ({ step: activeStep, focus: true, scroll: 'jump', seq: (previous?.seq ?? 0) + 1 }))}>
              <ArrowUp className="environment-context-back-up" size={13} aria-hidden="true" />
              <ArrowLeft className="environment-context-back-left" size={13} aria-hidden="true" />
              Back to the steps
            </button>
            <p className="environment-native-mobile-hint">Scroll sideways inside the desktop to reach every app.</p>
          </div>

          <div className="environment-native-frame-wrap" ref={frameWrapRef} role="region" aria-label={sideways ? 'Desktop canvas, scrolls sideways' : 'Desktop canvas'} tabIndex={sideways ? 0 : undefined} style={{ '--environment-scale': scale } as CSSProperties}>
            {!loaded && <div className="environment-native-loading" role="status">
              <Monitor size={24} aria-hidden="true" />
              <span>Opening the MultiVerse desktop…</span>
            </div>}
            <iframe ref={iframeRef} key={`${phase}-${reload}`} src={url} title={`MultiVerse GUI: ${EXAMPLE.title}, ${phase === 'initial' ? 'initial state' : 'final state'}`} className="environment-native-frame" sandbox="allow-scripts allow-same-origin allow-downloads" loading="lazy" onLoad={frameLoaded} />
          </div>
        </div>

      </div>
    </div>
  </section>;
});
