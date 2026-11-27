import type { ReactNode } from 'react';
import { ArrowDown, Bot, Boxes, Check, Cpu, FileText, ListChecks, ShieldCheck, UserRound } from 'lucide-react';
import { OVERVIEW_FIGURE } from '../../content/overview';
import { ENVIRONMENT, OVERVIEW, TASK_SETTINGS } from '../../content/paper';
import { useDataset } from '../../lib/dataset';
import { useServices } from '../../lib/services';
import { LIGHT_TILE_BACKGROUNDS } from '../ToolsEnvironment';
import '../paper/paper.css';
import './overview.css';

/*
 * The overview figure under the title block: the benchmark in one schematic,
 * in place of the abstract. It is the paper's Figure 1 without the worked
 * example: a task and a user simulator on the left, the agent under
 * evaluation (a model inside a harness), the simulated services in their
 * sandbox, and the verifiers, joined by the figure's arrows.
 *
 * Each part ends with a link to the section of the page that describes it,
 * so the figure is also a map of the page. The numbers (tasks, tasks per
 * setting, services, tools) are those of the release that is shown.
 *
 * Text: src/content/overview.ts and OVERVIEW in src/content/paper.ts.
 */

export interface SectionLink { href: string; label: string }

/** Where each part of the figure leads: the page supplies its own sections. */
export interface OverviewLinks {
  task: SectionLink;
  agent: SectionLink;
  services: SectionLink;
  verifiers: SectionLink;
  /** The worked example, linked from the caption. */
  walkthrough: SectionLink;
}

type Role = 'task' | 'user' | 'agent' | 'service' | 'verify';

/** One component of the figure: an icon and a title, its content, and the link to its section. */
function Node({ role, icon, title, note, link, children }: {
  role: Role;
  icon: ReactNode;
  title: string;
  note?: string;
  link?: SectionLink;
  children?: ReactNode;
}) {
  return <div className="ov-node" data-role={role}>
    <div className="ov-node-head">
      <span className="ov-node-icon" aria-hidden="true">{icon}</span>
      <h3 className="ov-node-title">{title}</h3>
    </div>
    {note && <p className="ov-node-note">{note}</p>}
    {children}
    {link && <a className="mv-link ov-node-link" href={link.href} data-ov-link={role}>{link.label}<ArrowDown size={12} aria-hidden="true" /></a>}
  </div>;
}

/** An arrow of the figure with its label. `both`: the exchange goes both ways. */
function Flow({ area, label, context, both = false }: { area: string; label: string; context: string; both?: boolean }) {
  return <div className="ov-flowlink" data-area={area} data-both={both}>
    <span className="ov-flowlink-label"><span className="mv-visually-hidden">{context}: </span>{label}</span>
    <span className="ov-arrow" aria-hidden="true"><i /><i /><i /></span>
  </div>;
}

export function OverviewFigure({ links }: { links: OverviewLinks }) {
  const { taskCount, settingCounts } = useDataset();
  const { services, toolCount } = useServices();
  const shown = services.slice(0, OVERVIEW_FIGURE.servicesShown);
  const context = OVERVIEW_FIGURE.flowContext;

  return <section id="overview" className="ov-section page-width" aria-labelledby="overview-title">
    <h2 id="overview-title" className="mv-visually-hidden">{OVERVIEW_FIGURE.title}</h2>
    <figure className="ov" data-overview>
      <div className="ov-flow">
        <Node role="task" icon={<FileText size={16} />} title={OVERVIEW.task.title} link={links.task}>
          <ul className="ov-parts">
            <li>{OVERVIEW.task.queryLabel}</li>
            <li data-optional="true">{OVERVIEW.task.instructionsLabel}<span>{OVERVIEW.task.instructionsNote}</span></li>
          </ul>
          <p className="ov-stat" data-ov-tasks><strong>{taskCount}</strong>{OVERVIEW_FIGURE.tasksUnit}</p>
          <ul className="ov-settings" aria-label="Tasks per task setting">
            {TASK_SETTINGS.map(setting => <li key={setting.id} title={setting.name}><b>{setting.id}</b><span>{settingCounts[setting.id]}</span></li>)}
          </ul>
        </Node>
        <Flow area="f1" label={OVERVIEW.flows.taskToAgent} context={context.taskToAgent} />

        <Node role="user" icon={<UserRound size={16} />} title={OVERVIEW.userSimulator.title} note={OVERVIEW.userSimulator.note} />
        <Flow area="f2" label={OVERVIEW.flows.userToAgent} context={context.userToAgent} both />

        <Node role="agent" icon={<Bot size={16} />} title={OVERVIEW.agent.title} note={OVERVIEW_FIGURE.agentNote} link={links.agent}>
          {/* The model sits inside the harness: the pair is what a result on the benchmark belongs to. */}
          <div className="ov-frame" data-frame="harness">
            <span className="ov-frame-label">{OVERVIEW_FIGURE.harness}</span>
            <span className="ov-model"><Cpu size={14} aria-hidden="true" />{OVERVIEW_FIGURE.model}</span>
          </div>
          <ul className="ov-chips" aria-label="Harnesses">
            {OVERVIEW_FIGURE.harnesses.map(harness => <li key={harness.name} data-kind={harness.kind}>{harness.name}</li>)}
          </ul>
          <p className="ov-node-note ov-node-note--small">{OVERVIEW_FIGURE.harnessesNote}</p>
        </Node>
        <Flow area="f3" label={OVERVIEW.flows.agentToServices} context={context.agentToServices} both />

        <Node role="service" icon={<Boxes size={16} />} title={OVERVIEW.services.title} link={links.services}>
          <div className="ov-frame" data-frame="sandbox">
            <span className="ov-frame-label"><ShieldCheck size={11} strokeWidth={2.2} aria-hidden="true" />{ENVIRONMENT.sandboxLabel}</span>
            <ul className="ov-tiles" aria-hidden="true">
              {shown.map(service => <li key={service.id} className="ov-tile" style={{ background: LIGHT_TILE_BACKGROUNDS[service.id] ?? service.tile }} title={service.name}>
                <img src={`${import.meta.env.BASE_URL}gui/icons/${service.icon}`} alt="" loading="lazy" decoding="async" />
              </li>)}
            </ul>
          </div>
          <p className="ov-stat" data-ov-services><strong>{services.length}</strong>services<span className="ov-stat-dot" aria-hidden="true">·</span><strong>{toolCount}</strong>tools</p>
          <p className="ov-node-note ov-node-note--small">{ENVIRONMENT.sandboxNote}</p>
        </Node>
        <Flow area="f4" label={OVERVIEW_FIGURE.toVerifiers} context={context.toVerifiers} />

        <Node role="verify" icon={<ListChecks size={16} />} title={OVERVIEW.verifiers.title} link={links.verifiers}>
          {OVERVIEW_FIGURE.verifierKinds.map(group => <div key={group.kind} className="ov-verifier-group">
            <p className="ov-kind">{group.label}</p>
            <ul className="ov-verifiers">
              {OVERVIEW.verifiers.items.filter(verifier => verifier.kind === group.kind).map(verifier => <li key={verifier.id}>
                <span className="ov-check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                {verifier.name}
              </li>)}
            </ul>
          </div>)}
          <p className="ov-node-note ov-node-note--small">{OVERVIEW.verifiers.rule}</p>
        </Node>
      </div>
      <figcaption className="ov-caption">
        {OVERVIEW_FIGURE.caption}{' '}
        <a className="mv-link ov-caption-link" href={links.walkthrough.href} data-ov-link="walkthrough">{OVERVIEW_FIGURE.walkthrough}<ArrowDown size={13} aria-hidden="true" /></a>
      </figcaption>
    </figure>
  </section>;
}
