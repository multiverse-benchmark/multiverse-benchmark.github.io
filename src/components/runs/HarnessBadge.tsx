import { harnessName } from '@/lib/runs';
import './harness-badge.css';

export function HarnessBadge({ harness }: { harness: string }) {
  const name = harnessName(harness);
  return <span className="run-harness" data-run-harness={harness} title={`Harness: ${name}`} aria-label={`Harness: ${name}`}>{name}</span>;
}
