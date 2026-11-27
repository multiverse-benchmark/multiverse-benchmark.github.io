import type { ReactNode } from 'react';

/**
 * The heading of a page section: a plain numbered title, as in a paper, with
 * the lead as an ordinary paragraph under it.
 */
export function SectionHeading({ title, number, lead }: {
  title: string;
  /** Section number; a section without one is unnumbered. */
  number?: string;
  lead?: ReactNode;
}) {
  return <div className="section-heading">
    <h2 className="section-title">
      {number && <span className="section-title-number">{number}</span>}
      {title}
    </h2>
    {lead && <p>{lead}</p>}
  </div>;
}
