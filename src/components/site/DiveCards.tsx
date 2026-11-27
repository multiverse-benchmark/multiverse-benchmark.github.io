import { ChartColumn, Code2, Compass, GitCompareArrows, ListChecks, Scale, type LucideIcon } from 'lucide-react';
import { deepDiveParts, type DeepDivePartId } from '../../content/site';
import { useRelease } from '../../lib/release';
import '../paper/page.css';

const ICONS: Record<DeepDivePartId, LucideIcon> = {
  explorer: Compass,
  'result-explorer': ListChecks,
  principles: Scale,
  dataset: ChartColumn,
  tools: Code2,
  releases: GitCompareArrows,
};

/**
 * The parts of the deep dive as link cards, for the release that is shown
 * (the result explorer exists for the latest release only). On the main page
 * they open the deep-dive page at that part (`base` is its address); on the
 * deep-dive page itself they jump down to the part.
 */
export function DiveCards({ base = '' }: { base?: string }) {
  const parts = deepDiveParts(useRelease());
  return <ul className="dive-cards" role="list">
    {parts.map((part, index) => {
      const Icon = ICONS[part.id];
      return <li key={part.id}>
        <a className="dive-card" href={`${base}#${part.id}`} data-dive-card={part.id}>
          <span className="dive-card-top">
            <span className="dive-card-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.6} /></span>
            <span className="dive-card-number" aria-hidden="true">0{index + 1}</span>
          </span>
          <strong className="dive-card-title">{part.title}</strong>
          <span className="dive-card-text">{part.text}</span>
        </a>
      </li>;
    })}
  </ul>;
}
