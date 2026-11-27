/**
 * Statistics of the validation set: headline numbers, the distribution of
 * each per-task quantity, the services in their families, and the instruction
 * rubric categories. All numbers come from src/lib/dataset.ts, all sentences
 * from src/content/dataset.ts; none is typed here.
 *
 * The section adapts to the width of its own container, not of the window.
 * The width is measured here and published as `data-dst-layout`
 * (wide, medium, narrow), which the stylesheet and the plots read.
 */
import { useMemo, type JSX } from 'react';
import '../paper/paper.css';
import './dataset-statistics.css';
import { datasetCopy } from '../../content/dataset';
import { formatStat, useDataset } from '../../lib/dataset';
import { useElementWidth } from './chart-parts';
import { DistributionCard } from './DistributionPlot';
import { RubricChart } from './RubricChart';
import { ServiceChart } from './ServiceChart';

/** Container widths, in CSS pixels, from which the medium and the wide layouts apply. */
const MEDIUM_FROM = 600;
const WIDE_FROM = 980;

export function DatasetStatistics(): JSX.Element {
  const [root, width] = useElementWidth<HTMLDivElement>();
  const layout = width >= WIDE_FROM ? 'wide' : width >= MEDIUM_FROM ? 'medium' : 'narrow';
  const dataset = useDataset();
  const DATASET = useMemo(() => datasetCopy(dataset), [dataset]);
  const STATED = dataset.stated;

  return <div ref={root} className="dst" data-dst="" data-dst-layout={layout} data-dst-release={dataset.release}>
    <p className="dst-intro">{DATASET.intro}</p>

    <ul className="dst-facts" aria-label="Headline numbers of the validation set">
      {DATASET.facts.map(fact => <li key={fact.stat} className="dst-fact" data-dst-fact={fact.stat}>
        <p className="dst-fact-value" data-dst-fact-value="">{formatStat(STATED[fact.stat])}</p>
        <p className="dst-fact-label">{fact.label}</p>
        <p className="dst-fact-detail">{fact.detail}</p>
      </li>)}
    </ul>

    <DistributionCard wide={layout === 'wide'} />
    <ServiceChart columns={layout === 'wide' ? 3 : layout === 'medium' ? 2 : 1} />
    <RubricChart />
  </div>;
}
