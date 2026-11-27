import { useId, useState, type CSSProperties } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { ENVIRONMENT } from '../content/paper';
import { useRelease } from '../lib/release';
import { SERVICE_COUNT, useServices, type Service } from '../lib/services';
import serviceOrbitHero from '../assets/multiverse-service-orbit-hero.svg';
import './paper/paper.css';
import './tools-environment.css';

/*
 * The environment at a glance: every simulated service on two rings around the
 * MultiVerse mark, inside one frame that stands for the sandbox. Pointing at a
 * service shows what it is, how many tools it has, and a few of them. Clicking
 * it lists all of its tools, each a link to that tool's code in the tool
 * explorer.
 *
 * The panel under the frame therefore has two states. Until a service is
 * clicked it previews the service the pointer or the keyboard focus is on.
 * Once one is clicked the panel stays on it, so that the reader can move to
 * the list without the panel changing under the pointer; clicking another
 * service moves the list to that one.
 *
 * The rings are drawn for a stage of STAGE_W x STAGE_H; the stage keeps that
 * aspect ratio and positions are percentages, so it scales as a whole. Below
 * about 900px there is no room for rings, and the services become a grid
 * (tools-environment.css).
 */
const STAGE_W = 1160;
const STAGE_H = 540;
const CENTER = { x: STAGE_W / 2, y: 262 };
/** Outer ring first. The services with the most tools sit on the inner ring. */
const RINGS = [
  { count: 22, rx: 505, ry: 215, phase: 0 },
  // Half a step off the top, so that no label sits on the mark at the centre.
  { count: SERVICE_COUNT - 22, rx: 300, ry: 118, phase: 0.5 },
] as const;

/** `count` points spaced evenly along an ellipse's perimeter, clockwise from the top. */
function ringPoints(count: number, rx: number, ry: number, phase: number): { x: number; y: number }[] {
  const STEPS = 1440;
  const at = (step: number) => {
    const angle = (step / STEPS) * 2 * Math.PI - Math.PI / 2;
    return { x: CENTER.x + Math.cos(angle) * rx, y: CENTER.y + Math.sin(angle) * ry };
  };
  const lengths = [0];
  for (let step = 1; step <= STEPS; step += 1) {
    const [a, b] = [at(step - 1), at(step)];
    lengths.push(lengths[step - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[STEPS];
  return Array.from({ length: count }, (_, index) => {
    const target = ((index + phase) / count) * total;
    return at(lengths.findIndex(length => length >= target));
  });
}

interface Placed { service: Service; x: number; y: number; ring: number }

/**
 * The place of each service, by its position in the list. Inner ring: the
 * services with the most tools. Outer ring: the rest, in the same order. Both
 * releases list the services in the same order, so a service keeps its place
 * when the reader switches between them.
 */
const PLACES: { x: number; y: number; ring: number }[] = (() => {
  const [outer, inner] = RINGS;
  const innerPoints = ringPoints(inner.count, inner.rx, inner.ry, inner.phase);
  const outerPoints = ringPoints(outer.count, outer.rx, outer.ry, outer.phase);
  return Array.from({ length: SERVICE_COUNT }, (_, index) => index < inner.count
    ? { ...innerPoints[index], ring: 1 }
    : { ...outerPoints[index - inner.count], ring: 0 });
})();

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

/*
 * The sandbox's backdrop is a night sky. The stars come from a seeded
 * generator, so every visit shows the same sky; they do not move. Most are
 * faint points, a few are brighter and carry a soft halo.
 */
const SKY_W = 1160;
const SKY_H = 640;
const STARS = (() => {
  let seed = 809;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 210 }, () => {
    const [x, y, size, shade, tint] = [random() * SKY_W, random() * SKY_H, random(), random(), random()];
    const bright = size > 0.955;
    return {
      x: x.toFixed(1),
      y: y.toFixed(1),
      r: (bright ? 1.3 + (size - 0.955) * 10 : size > 0.72 ? 0.9 + (size - 0.72) * 1.5 : 0.55 + size * 0.45).toFixed(2),
      opacity: (bright ? 0.95 : 0.4 + shade * 0.5).toFixed(2),
      tone: tint > 0.9 ? 'warm' : tint > 0.72 ? 'cool' : 'white',
      bright,
    };
  });
})();

// Lighter backgrounds keep these dark service icons legible at the small tile size.
export const LIGHT_TILE_BACKGROUNDS: Record<string, string> = {
  cliptok: 'linear-gradient(135deg, #E8C04A 0%, #60A879 100%)',
  shopster: 'linear-gradient(135deg, #9788EB 0%, #EF9B74 100%)',
  strope: 'linear-gradient(135deg, #68C6D7 0%, #7B9BB7 100%)',
  zira: 'linear-gradient(135deg, #F3C75F 0%, #99A8BB 100%)',
};

function Tile({ service }: { service: Service }) {
  return <span className="tenv-tile" style={{ background: LIGHT_TILE_BACKGROUNDS[service.id] ?? service.tile }} aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}gui/icons/${service.icon}`} alt="" loading="lazy" decoding="async" />
  </span>;
}

export function ToolsEnvironment({ toolExplorerPage }: {
  /** The page that holds the tool explorer, where the code behind the tools can be read. */
  toolExplorerPage: string;
}) {
  const release = useRelease();
  const { services, toolCount: TOOL_COUNT } = useServices();
  const PLACED: Placed[] = services.map((service, index) => ({ service, ...PLACES[index] }));
  /** The service whose tools are listed: the one that was clicked. None until the first click. */
  const [listedId, setListedId] = useState<string | null>(null);
  /** The service under the pointer or the keyboard focus, previewed while no service is listed. */
  const [previewId, setPreviewId] = useState(services[0].id);
  const selected = PLACED.find(item => item.service.id === (listedId ?? previewId)) ?? PLACED[0];
  const listed = listedId !== null;
  const panelId = useId();
  /** "#tool=<id>" opens the tool explorer on that tool, with its list narrowed to the tool's service. */
  const toolHref = (name: string) => `${toolExplorerPage}?release=${release}#tool=${encodeURIComponent(`${selected.service.id}.${name}`)}`;

  return <div className="tenv" data-tenv data-tenv-selected={selected.service.id}>
    <div className="tenv-sandbox">
      <svg className="tenv-sky" viewBox={`0 0 ${SKY_W} ${SKY_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          {/* The glow round a bright star: strongest at the star, gone at the edge. */}
          <radialGradient id="tenv-star-glow">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {STARS.map((star, index) => <g key={index} className={`tenv-star tenv-star--${star.tone}`}>
          {star.bright && <circle className="tenv-star-halo" cx={star.x} cy={star.y} r={Number(star.r) * 4.5} />}
          <circle cx={star.x} cy={star.y} r={star.r} opacity={star.opacity} />
        </g>)}
      </svg>
      <p className="tenv-sandbox-label"><ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />{ENVIRONMENT.sandboxLabel}</p>
      <div className="tenv-stage" style={{ '--tenv-aspect': `${STAGE_W} / ${STAGE_H}` } as CSSProperties}>
        <svg className="tenv-rings" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none" aria-hidden="true">
          {RINGS.map(ring => <ellipse key={ring.rx} cx={CENTER.x} cy={CENTER.y} rx={ring.rx} ry={ring.ry} />)}
          <line className="tenv-link" x1={CENTER.x} y1={CENTER.y} x2={selected.x} y2={selected.y} />
        </svg>
        <div className="tenv-core" style={{ left: percent(CENTER.x, STAGE_W), top: percent(CENTER.y, STAGE_H) }} aria-hidden="true">
          <img src={serviceOrbitHero} alt="" draggable={false} />
        </div>
        <ul className="tenv-services" aria-label={`The ${SERVICE_COUNT} simulated services`}>
          {PLACED.map(({ service, x, y }) => <li key={service.id} className="tenv-service-slot" style={{ left: percent(x, STAGE_W), top: percent(y, STAGE_H) }}>
            <button
              type="button"
              className="tenv-service"
              data-tenv-service={service.id}
              data-current={service.id === selected.service.id}
              aria-pressed={service.id === listedId}
              aria-controls={panelId}
              aria-label={`${service.name}: ${service.tools} tools. List them.`}
              onClick={() => setListedId(service.id)}
              onMouseEnter={() => setPreviewId(service.id)}
              onFocus={() => setPreviewId(service.id)}
            >
              <Tile service={service} />
              <span className="tenv-service-label" aria-hidden="true">{service.label}</span>
            </button>
          </li>)}
        </ul>
      </div>
      <p className="tenv-sandbox-note">{ENVIRONMENT.sandboxNote}</p>
    </div>

    <div className="tenv-detail" id={panelId} data-tenv-detail data-tenv-listed={listed}>
      <Tile service={selected.service} />
      <p className="tenv-detail-name" aria-live="polite" aria-atomic="true">
        <strong>{selected.service.name}</strong>
        <span>{selected.service.tools} of the {TOOL_COUNT} tools</span>
      </p>
      {selected.service.description && <p className="tenv-detail-description" data-tenv-description>{selected.service.description}</p>}
      {listed
        ? <div className="tenv-detail-all">
          <ul className="tenv-tool-list" data-tenv-tools aria-label={`The ${selected.service.tools} tools of ${selected.service.name}`}>
            {selected.service.toolNames.map(name => <li key={name}><a href={toolHref(name)} data-tenv-tool={`${selected.service.id}.${name}`}>{name}</a></li>)}
          </ul>
        </div>
        : <>
          <p className="tenv-detail-tools">
            <span className="tenv-detail-eg">For example</span>
            {selected.service.examples.map(tool => <code key={tool}>{tool}</code>)}
          </p>
          {/* The same as clicking the service above: its tools are listed, each with a link to its code. */}
          <button type="button" className="mv-link tenv-detail-link" data-tenv-list-all onClick={() => setListedId(selected.service.id)}>
            List all {selected.service.tools} tools
            <ChevronDown size={13} aria-hidden="true" />
          </button>
        </>}
    </div>

    <ul className="tenv-notes">
      {ENVIRONMENT.notes.filter(note => !note.release || note.release === release).map(note => <li key={note.text} className="mv-note">{note.text}</li>)}
    </ul>
  </div>;
}
