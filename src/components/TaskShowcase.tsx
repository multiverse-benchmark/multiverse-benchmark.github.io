import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, EyeOff, Monitor, RotateCcw, X } from 'lucide-react';
import { EXAMPLE, OVERVIEW, OVERVIEW_STAGES, TOUR_VERIFIERS, type AgentStep, type CaseId, type TourStepId, type VerdictMark } from '../content/paper';
import { fetchStaticJson } from '../lib/staticData';
import './paper/paper.css';
import './task-showcase.css';

export type ShowcasePhase = 'initial' | 'final';

/** A place in the embedded desktop: an app, optionally one of its records, in one of the two saved states. */
export interface ShowcaseTarget {
  /** "<evidence id>-<phase>" for an evidence record, "<app>-initial" for an app opened without a record. */
  id: string;
  app: string;
  record?: string | null;
  view?: string | null;
  phase: ShowcasePhase;
}

interface EvidenceState { app: string; record: string | null; view: string | null; summary: string; href: string }
interface EvidenceItem { id: string; title: string; summary: string; before: EvidenceState; after: EvidenceState }
interface TrajectoryStep {
  step: number; kind: 'message' | 'tool_call'; role?: string; text?: string; tool?: string; service?: string; arguments?: unknown;
  /** Where the output of a tool call is stored: a data file and a JSON pointer into it. */
  replayResult?: { asset: string; jsonPointer: string };
}

/** The value a JSON pointer (RFC 6901) names inside a document; undefined if there is none. */
function atPointer(document: unknown, pointer: string): unknown {
  return pointer.split('/').slice(1).reduce<unknown>((value, part) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }, document);
}

/** The tool outputs of the success case by step number, once loaded; 'failed' if they could not be loaded. */
type ToolOutputs = Map<number, unknown> | 'failed' | null;

/** The fields of public/data/dinner-showcase.json that the walkthrough reads. */
export interface ShowcaseData {
  task: { id: string; title: string; query: string; context: string; narrative: string; setting: string; services: string[]; userGoalSummary?: string; authoringPurpose?: string };
  goals: { id: string; text: string }[];
  developerInstructions: { id: string; title?: string; text: string }[];
  instructionNote: string;
  clarification: { referenceDialogue: { role: string; text: string; step: number }[]; note: string };
  expectedOutcome: { steps: string[]; highlights: string[]; note?: string };
  referenceEvidence: {
    items: EvidenceItem[];
    trajectorySteps: TrajectoryStep[];
    trajectorySummary: {
      toolCallCount: number; usedServiceCount: number; availableServiceCount: number;
      usedServices: string[]; unusedServices: string[]; stepCount: number;
      finalResponse: { text: string; step: number };
      actionOrder: { step: number; tool: string; label?: string }[];
    };
  };
}

/** Id of the disclosure that holds the complete trajectory of the success case; links to "#<id>" open it. */
export const TRAJECTORY_ID = 'dinner-authored-trajectory';

/** Released service names and dock tile colors, as the overview figure lists them. */
const APPS = new Map<string, { name: string; tile: string }>(
  OVERVIEW.services.connected.map(service => [service.app, { name: service.name, tile: service.tile }]),
);

/** Service name as shown in the desktop, for example "Notes & Lists". */
export function appName(app: string): string {
  return APPS.get(app)?.name ?? app.replace(/_/g, ' ');
}

/** The app's dock icon: a white glyph on the tile color the desktop uses. Decorative. */
export function AppTile({ app }: { app: string }) {
  const tile = APPS.get(app)?.tile;
  return <span className="showcase-app-tile" style={tile ? { background: tile } : undefined} aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}gui/icons/${app}.svg`} alt="" />
  </span>;
}

/** One of the example's evidence records (mail, contact, messages, reminder) before or after the agent acts. */
export function evidenceTarget(data: ShowcaseData, id: string, phase: ShowcasePhase): ShowcaseTarget | null {
  const item = data.referenceEvidence.items.find(value => value.id === id);
  if (!item) return null;
  const state = phase === 'initial' ? item.before : item.after;
  return { id: `${id}-${phase}`, app: state.app, record: state.record, view: state.view, phase };
}

/** An app in the initial state, with no record selected. */
export function appTarget(app: string): ShowcaseTarget {
  return { id: `${app}-initial`, app, phase: 'initial' };
}

/** The record each step is about. `ask` has none: the desktop stays as it is. */
const STEP_RECORDS: Record<TourStepId, { evidence: string; phase: ShowcasePhase } | null> = {
  task: { evidence: 'mail', phase: 'initial' },
  read: { evidence: 'mail', phase: 'initial' },
  ask: null,
  act: { evidence: 'mail', phase: 'final' },
  verify: { evidence: 'mail', phase: 'final' },
};

export function tourStepTarget(data: ShowcaseData, step: TourStepId): ShowcaseTarget | null {
  const record = STEP_RECORDS[step];
  return record ? evidenceTarget(data, record.evidence, record.phase) : null;
}

/**
 * Names what the desktop shows for an app, record, and state: the id of the
 * matching target (so that its button can be marked as active) and, for an
 * evidence record, the sentence that says what to look for.
 */
export function describeDesktop(data: ShowcaseData | null, app: string, record: string, phase: ShowcasePhase): { targetId: string; detail: string } {
  const items = data?.referenceEvidence.items ?? [];
  const state = (item: EvidenceItem) => (phase === 'initial' ? item.before : item.after);
  const match = items.find(item => state(item).app === app && (state(item).record ?? '') === record);
  if (match) return { targetId: `${match.id}-${phase}`, detail: state(match).summary };
  const bare = !record && phase === 'initial' ? `${app}-initial` : '';
  // An evidence id can equal an app id ("messages"); never report the bare app as that record.
  return { targetId: items.some(item => `${item.id}-initial` === bare) ? '' : bare, detail: '' };
}

interface SearchGroup { app: string; tools: string[]; calls: number; target: ShowcaseTarget; opensRecord: boolean }

/** The read-only tool calls made before the agent first speaks, grouped by service in call order. */
function searchGroups(data: ShowcaseData): SearchGroup[] {
  const firstTurn = Math.min(...data.clarification.referenceDialogue.map(turn => turn.step));
  const groups: SearchGroup[] = [];
  for (const step of data.referenceEvidence.trajectorySteps) {
    const tool = step.tool;
    if (step.kind !== 'tool_call' || !tool || step.step >= firstTurn) continue;
    const app = step.service ?? [...APPS.keys()].find(id => tool.startsWith(`${id}_`)) ?? tool;
    let group = groups.find(value => value.app === app);
    if (!group) {
      group = { app, tools: [], calls: 0, target: appTarget(app), opensRecord: false };
      groups.push(group);
    }
    group.calls += 1;
    if (!group.tools.includes(tool)) group.tools.push(tool);
    // A call that names one of the evidence records opens that record instead of the bare app.
    const values = step.arguments && typeof step.arguments === 'object' ? Object.values(step.arguments) : [];
    const item = data.referenceEvidence.items.find(value => value.before.app === app && value.before.record !== null && values.includes(value.before.record));
    const record = item ? evidenceTarget(data, item.id, 'initial') : null;
    if (record) {
      group.target = record;
      group.opensRecord = true;
    }
  }
  return groups;
}

const ROLE_NAMES: Record<string, string> = { system: 'System', user: 'User', assistant: 'Agent' };
const CASE_IDS: readonly CaseId[] = ['failure', 'success'];
type StepKind = AgentStep['kind'];

/** Pass or fail: an icon and a word, never colour alone. */
function Verdict({ verdict, children }: { verdict: VerdictMark; children: ReactNode }) {
  return <span className={`showcase-verdict showcase-verdict--${verdict}`}>
    {verdict === 'pass' ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : <X size={12} strokeWidth={3} aria-hidden="true" />}
    {children}
  </span>;
}

/** What the two agents of the figure do at one step: the failure case, then the success case. */
function CaseLines({ kinds }: { kinds: readonly StepKind[] }) {
  const { agent } = OVERVIEW;
  return <div className="showcase-cases" data-showcase-cases={kinds.join(' ')}>
    <p className="showcase-label">{agent.title}</p>
    <div className="showcase-cases-grid">
      {CASE_IDS.map(caseId => {
        const item = agent.cases[caseId];
        return <div key={caseId} className={`showcase-case showcase-case--${caseId}`} data-showcase-case={caseId}>
          <p className="showcase-case-title">
            {caseId === 'success' ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <X size={13} strokeWidth={3} aria-hidden="true" />}
            {item.title}
          </p>
          <ol className="showcase-case-steps" role="list">
            {item.steps.filter(step => kinds.includes(step.kind)).map((step, index) => <li key={index} className={`showcase-case-step showcase-case-step--${step.kind}`}>
              <span className="showcase-kind">{step.kind}</span>
              <span>{step.text}</span>
            </li>)}
          </ol>
        </div>;
      })}
    </div>
  </div>;
}

export interface TaskShowcaseProps {
  data: ShowcaseData;
  activeStep: TourStepId;
  /** The visitor picked a step. `focus` asks for keyboard focus to move to that step's header (Back, Next, Start again). */
  onSelectStep: (step: TourStepId, options: { focus: boolean }) => void;
  /** Open a record or an app in the desktop. */
  onNavigate: (target: ShowcaseTarget) => void;
  /** Id of the target the desktop currently shows, or '' when it shows something else. */
  activeTarget: string;
}

/**
 * The paper's Figure 1 as a five-step walkthrough: the task, the simulated
 * services, the user simulator, the two agents of the figure (a failure case
 * and a success case), and the verifiers. The complete trajectory of the
 * success case and the notes follow.
 */
export function TaskShowcase({ data, activeStep, onSelectStep, onNavigate, activeTarget }: TaskShowcaseProps) {
  const baseId = useId();
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const trajectory = useRef<HTMLDetailsElement>(null);
  const [trajectoryOpen, setTrajectoryOpen] = useState(false);
  const [trajectoryJump, setTrajectoryJump] = useState(0);

  const { task, userSimulator, agent, verifiers, services } = OVERVIEW;
  const trace = data.referenceEvidence.trajectorySummary;
  const activeIndex = Math.max(0, OVERVIEW_STAGES.findIndex(step => step.id === activeStep));

  // A link to the complete trajectory opens its disclosure: on load, on a hash change, and on a
  // click when the hash is already set (which fires no hash change).
  useEffect(() => {
    const hash = `#${TRAJECTORY_ID}`;
    const open = () => {
      setTrajectoryOpen(true);
      setTrajectoryJump(count => count + 1);
    };
    const onHashChange = () => { if (window.location.hash === hash) open(); };
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link instanceof HTMLAnchorElement && link.hash === hash && link.origin === window.location.origin && link.pathname === window.location.pathname) open();
    };
    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // The outputs of the tool calls are stored beside the example, in the record of executing the
  // calls in the simulator. They are loaded when the trajectory is first opened.
  const [toolOutputs, setToolOutputs] = useState<ToolOutputs>(null);
  useEffect(() => {
    if (!trajectoryOpen) return;
    const calls = data.referenceEvidence.trajectorySteps.flatMap(step => step.replayResult ? [{ step: step.step, ...step.replayResult }] : []);
    const controller = new AbortController();
    Promise.all([...new Set(calls.map(call => call.asset))].map(async asset => [asset, await fetchStaticJson<unknown>(asset, controller.signal)] as const))
      .then(loaded => {
        const documents = new Map(loaded);
        setToolOutputs(new Map(calls.map(call => [call.step, atPointer(documents.get(call.asset), call.jsonPointer)])));
      })
      .catch(() => { if (!controller.signal.aborted) setToolOutputs(current => current ?? 'failed'); });
    return () => controller.abort();
  }, [trajectoryOpen, data]);

  // Scroll once the disclosure is open; the browser's own jump only reaches the closed summary.
  useEffect(() => {
    if (!trajectoryJump) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trajectory.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [trajectoryJump]);

  function onStepKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OVERVIEW_STAGES.length - 1;
    const next = event.key === 'ArrowDown' ? Math.min(index + 1, last)
      : event.key === 'ArrowUp' ? Math.max(index - 1, 0)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : index;
    if (next === index) return;
    event.preventDefault();
    stepButtons.current[next]?.focus();
  }

  /** A button that opens a record or an app in the desktop. Pressed while the desktop shows it. */
  function open(target: ShowcaseTarget | null, label: string, ariaLabel?: string) {
    if (!target) return null;
    return <button type="button" className="showcase-open" data-showcase-target={target.id} aria-pressed={activeTarget === target.id} aria-label={ariaLabel} onClick={() => onNavigate(target)}>
      <Monitor size={13} aria-hidden="true" />
      {label}
    </button>;
  }

  const record = (id: string, phase: ShowcasePhase) => evidenceTarget(data, id, phase);
  const searched = searchGroups(data);
  const readCalls = searched.reduce((count, group) => count + group.calls, 0);

  const panels: Record<TourStepId, () => ReactNode> = {
    task: () => <>
      <figure className="showcase-request">
        <figcaption className="showcase-label">{task.queryLabel}</figcaption>
        <blockquote data-showcase-request>{data.task.query}</blockquote>
      </figure>
      <div className="showcase-actions">{open(record('mail', 'initial'), 'Open Julian’s email')}</div>
      <div className="showcase-block">
        <p className="showcase-label">{task.instructionsLabel} <span className="showcase-label-note">{task.instructionsNote}</span></p>
        <ol className="showcase-instructions" role="list">
          {task.instructions.map((instruction, index) => <li className="showcase-instruction" key={instruction.text}>
            <span className="showcase-instruction-number" aria-hidden="true">{index + 1}</span>
            <div className="showcase-instruction-body">
              <p data-showcase-instruction={index}>{instruction.text}</p>
              <p className="showcase-instruction-category">{instruction.category}</p>
            </div>
            <div className="showcase-actions">
              {index === 0 && <>{open(record('contact', 'initial'), 'Find Julian’s number')}{open(record('messages', 'final'), 'Inspect the text')}</>}
              {index === 1 && <>{open(record('reminder', 'initial'), 'Open reminder')}{open(record('reminder', 'final'), 'Completed reminder')}</>}
              {index === 2 && <>{open(record('mail', 'final'), 'Read the email')}{open(record('messages', 'final'), 'Read the text')}</>}
            </div>
          </li>)}
        </ol>
      </div>
      <p className="showcase-hint">{EXAMPLE.instructionScoring}</p>
    </>,

    read: () => <>
      <div className="showcase-block">
        <p className="showcase-label">{services.title}</p>
        <p className="showcase-services-note">{services.note}</p>
      </div>
      <div className="showcase-block">
        <p className="showcase-label">{services.connectedLabel}</p>
        <ul className="showcase-search-apps" role="list">
          {services.connected.map(service => {
            const group = searched.find(value => value.app === service.app);
            return <li className="showcase-search-app" key={service.app} data-showcase-service={service.app}>
              <AppTile app={service.app} />
              <p className="showcase-search-name">
                <strong>{service.name}</strong>
                {group && <>{' '}<span>{group.calls === 1 ? '1 call' : `${group.calls} calls`}</span></>}
              </p>
              {open(group?.target ?? appTarget(service.app), 'Open', group?.opensRecord ? `Open ${service.name} at the record the agent read` : `Open ${service.name} in the desktop`)}
              {group && <p className="showcase-tools">{group.tools.map(tool => <code key={tool}>{tool}</code>)}</p>}
            </li>;
          })}
        </ul>
        <p className="showcase-hint">Call counts: the {readCalls} read-only tool calls of the success case before its question to the user.</p>
      </div>
      <CaseLines kinds={['read']} />
    </>,

    ask: () => <>
      <div className="showcase-usersim" data-showcase-usersim>
        <p className="showcase-label">{userSimulator.title} <span className="showcase-label-note">{userSimulator.note}</span></p>
        <p className="showcase-usersim-goal">{userSimulator.goal}</p>
        <p className="showcase-hidden">
          <EyeOff size={15} strokeWidth={2} aria-hidden="true" />
          <span>{userSimulator.hidden}</span>
        </p>
        <p className="showcase-usersim-why">{userSimulator.why}</p>
      </div>
      <CaseLines kinds={['guess', 'ask', 'user']} />
    </>,

    act: () => <>
      <CaseLines kinds={['act']} />
      <p className="showcase-hint">The numbers in parentheses refer to the instructions of the task.</p>
      <div className="showcase-block">
        <p className="showcase-label">The success case in the desktop</p>
        <ul className="showcase-evidence-list" role="list">
          {data.referenceEvidence.items.map(evidence => <li className="showcase-evidence" key={evidence.id}>
            <AppTile app={evidence.before.app} />
            <p className="showcase-evidence-title">{evidence.title}</p>
            <div className="showcase-states">
              {(['initial', 'final'] as const).map(phase => {
                const id = `${evidence.id}-${phase}`;
                const target = record(evidence.id, phase);
                const label = phase === 'initial' ? 'Before' : 'After';
                return target && <button type="button" key={phase} className="showcase-state" data-showcase-target={id} data-showcase-evidence={id} aria-pressed={activeTarget === id} aria-label={`${label}: ${evidence.title}`} onClick={() => onNavigate(target)}>{label}</button>;
              })}
            </div>
          </li>)}
        </ul>
      </div>
    </>,

    verify: () => <>
      <ul className="showcase-verifiers" role="list">
        {verifiers.items.map(item => {
          const detail = TOUR_VERIFIERS.find(candidate => candidate.id === item.id)?.text;
          return <li className="showcase-verifier" key={item.id} data-showcase-verifier={item.id} data-verdict-failure={item.verdict.failure} data-verdict-success={item.verdict.success}>
            <p className="showcase-verifier-name">{item.name} <span className="showcase-verifier-kind">({item.kind})</span></p>
            <p className="showcase-verifier-input">input: {item.input}</p>
            <ul className="showcase-verdicts" role="list">
              {CASE_IDS.map(caseId => <li key={caseId}>
                <Verdict verdict={item.verdict[caseId]}>{agent.cases[caseId].title}: {item.verdict[caseId] === 'pass' ? 'passes' : 'fails'}</Verdict>
                {caseId === 'failure' && item.failureNote && <span className="showcase-verdict-note">{item.failureNote}</span>}
              </li>)}
            </ul>
            {detail && <p className="showcase-verifier-text">{detail}</p>}
          </li>;
        })}
      </ul>
      <div className="showcase-outcome" data-showcase-outcome>
        <p className="showcase-label">Outcome</p>
        <ul role="list">
          {CASE_IDS.map(caseId => <li key={caseId}>
            <Verdict verdict={caseId === 'success' ? 'pass' : 'fail'}>{agent.cases[caseId].title}: {agent.cases[caseId].outcome}</Verdict>
          </li>)}
        </ul>
      </div>
    </>,
  };

  return <div className="task-showcase" id="dinner-task-brief">
    <div className="showcase-tour">
      <div className="showcase-tour-head">
        <p className="mv-eyebrow">Figure 1, step by step</p>
        <div className="showcase-progress">
          <span className="showcase-progress-track" aria-hidden="true">
            {OVERVIEW_STAGES.map((step, index) => <span key={step.id} data-state={index === activeIndex ? 'active' : index < activeIndex ? 'done' : 'todo'} />)}
          </span>
          <p data-tour-progress>Step {activeIndex + 1} of {OVERVIEW_STAGES.length}</p>
        </div>
      </div>

      {/* The two agents the figure compares; every step below shows what each of them does. */}
      <div className="showcase-caseband" data-showcase-caseband>
        <p className="showcase-label">{agent.title} <span className="showcase-label-note">{agent.note}</span></p>
        <ul className="showcase-caseband-list" role="list">
          {CASE_IDS.map(caseId => {
            const item = agent.cases[caseId];
            return <li key={caseId} className={`showcase-casechip showcase-casechip--${caseId}`}>
              <span className="showcase-casechip-text"><strong>{item.title}</strong> {item.summary}</span>
              <Verdict verdict={caseId === 'success' ? 'pass' : 'fail'}>{item.outcome}</Verdict>
            </li>;
          })}
        </ul>
      </div>

      <ol className="showcase-steps" role="list">
        {OVERVIEW_STAGES.map((step, index) => {
          const isOpen = index === activeIndex;
          const buttonId = `${baseId}-step-${step.id}`;
          const panelId = `${baseId}-panel-${step.id}`;
          const previous = OVERVIEW_STAGES[index - 1];
          const next = OVERVIEW_STAGES[index + 1];
          return <li className="showcase-step" key={step.id} data-state={isOpen ? 'active' : index < activeIndex ? 'done' : 'todo'}>
            <h4 className="showcase-step-heading">
              <button
                type="button"
                id={buttonId}
                ref={element => { stepButtons.current[index] = element; }}
                className="showcase-step-button"
                data-tour-step={step.id}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                aria-current={isOpen ? 'step' : undefined}
                onClick={() => onSelectStep(step.id, { focus: false })}
                onKeyDown={event => onStepKeyDown(event, index)}
              >
                <span className="showcase-step-number">{index + 1}</span>
                <span className="showcase-step-text">
                  <span className="showcase-step-title">{step.label}</span>
                  <span className="showcase-step-flow">{step.flow}</span>
                </span>
                <ChevronDown className="showcase-step-chevron" size={16} aria-hidden="true" />
              </button>
            </h4>
            {isOpen && <div className="showcase-panel" id={panelId} role="region" aria-labelledby={buttonId} data-tour-panel={step.id}>
              <p className="showcase-lead">{step.lead}</p>
              {panels[step.id]()}
              <div className="showcase-nav">
                <button type="button" className="showcase-nav-back" data-tour-back disabled={!previous} onClick={() => previous && onSelectStep(previous.id, { focus: true })}>
                  <ArrowLeft size={14} aria-hidden="true" />
                  Back
                </button>
                {next
                  ? <button type="button" className="showcase-nav-next" data-tour-next onClick={() => onSelectStep(next.id, { focus: true })}>
                    <span>Next: {next.label}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                  : <button type="button" className="showcase-nav-restart" data-tour-restart onClick={() => onSelectStep(OVERVIEW_STAGES[0].id, { focus: true })}>
                    <RotateCcw size={14} aria-hidden="true" />
                    Start again
                  </button>}
              </div>
            </div>}
          </li>;
        })}
      </ol>
    </div>

    <details className="showcase-disclosure showcase-trajectory" id={TRAJECTORY_ID} ref={trajectory} open={trajectoryOpen} onToggle={event => setTrajectoryOpen(event.currentTarget.open)}>
      <summary>
        <span className="showcase-disclosure-title">All {trace.stepCount} steps of the success case</span>
        {' '}
        <span className="showcase-disclosure-meta">{trace.toolCallCount} tool calls</span>
        <ChevronDown className="showcase-disclosure-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="showcase-disclosure-body">
        <ol className="showcase-trajectory-list" tabIndex={0} aria-label="Scrollable trajectory of the success case">
          {data.referenceEvidence.trajectorySteps.map(step => <li key={step.step} data-showcase-step={step.step} data-showcase-trajectory-step={step.step} className={step.kind === 'tool_call' ? 'showcase-trajectory-tool' : 'showcase-trajectory-message'}>
            <span className="showcase-trajectory-number">{String(step.step).padStart(2, '0')}</span>
            <div className="showcase-trajectory-body">
              <span className="showcase-trajectory-kind">{step.kind === 'tool_call' ? 'Tool call' : ROLE_NAMES[step.role ?? ''] ?? step.role}</span>
              {step.kind === 'tool_call'
                ? <details>
                  <summary>{step.tool}</summary>
                  <span className="showcase-trajectory-part">Arguments</span>
                  <pre data-showcase-arguments>{JSON.stringify(step.arguments, null, 2)}</pre>
                  <span className="showcase-trajectory-part">Output</span>
                  {toolOutputs instanceof Map && toolOutputs.get(step.step) !== undefined
                    // A long output scrolls inside its own box, which is therefore reachable by keyboard.
                    ? <pre className="showcase-trajectory-output" data-showcase-output tabIndex={0} aria-label={`Output of ${step.tool}`}>{JSON.stringify(toolOutputs.get(step.step), null, 2)}</pre>
                    : <span className="showcase-trajectory-pending" data-showcase-output-pending>{toolOutputs === null ? 'Loading the output…' : 'The output could not be loaded.'}</span>}
                </details>
                : <p>{step.text}</p>}
            </div>
          </li>)}
        </ol>
      </div>
    </details>

  </div>;
}
