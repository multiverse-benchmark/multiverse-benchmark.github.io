import { useId } from 'react';
import { RELEASES_SECTION, type ReleaseFacts } from '../../content/releases';
import { DATASETS } from '../../lib/dataset';
import { LATEST_RELEASE, PAPER_RELEASE, RELEASES, type Release } from '../../lib/release';
import { SERVICE_SETS } from '../../lib/services';
import { HOME_URL } from '../site/SiteChrome';
import '../paper/paper.css';
import './releases.css';

/*
 * The deep dive's section on the two releases of the benchmark: what changed
 * from the release the paper describes to the one that followed it, and the
 * two side by side. The main page links here from the line under its title
 * block and from the note above the paper's results.
 *
 * The text is in src/content/releases.ts. The numbers come from the data of
 * each release, the same data the rest of the site shows for it.
 */

/** Keep the comparison columns in the same order as the page's release switch. */
const COLUMNS = RELEASES;

const factsOf = (release: Release): ReleaseFacts => ({
  taskCount: DATASETS[release].taskCount,
  settingCounts: DATASETS[release].settingCounts,
  tools: SERVICE_SETS[release].toolCount,
  services: SERVICE_SETS[release].services.length,
});

const FACTS = { [PAPER_RELEASE]: factsOf(PAPER_RELEASE), [LATEST_RELEASE]: factsOf(LATEST_RELEASE) } as Record<Release, ReleaseFacts>;
const CHANGES = RELEASES_SECTION.changes(FACTS[PAPER_RELEASE], FACTS[LATEST_RELEASE]);
const ROWS = RELEASES_SECTION.rows(FACTS);

export function ReleasesSection() {
  const changesTitleId = useId();
  const tableTitleId = useId();
  return <div className="rel" data-releases>
    <section aria-labelledby={changesTitleId}>
      <h3 className="rel-subtitle" id={changesTitleId}>{RELEASES_SECTION.changesTitle}</h3>
      <ol className="rel-changes">
        {CHANGES.map((change, index) => <li key={change.key} className="rel-change" data-release-change={change.key}>
          <span className="rel-change-number" aria-hidden="true">{index + 1}</span>
          <h4>{change.title}</h4>
          <p>{change.text}</p>
        </li>)}
      </ol>
    </section>

    <section aria-labelledby={tableTitleId}>
      <h3 className="rel-subtitle" id={tableTitleId}>{RELEASES_SECTION.tableTitle}</h3>
      <table className="rel-table" aria-labelledby={tableTitleId} data-release-table>
        <thead>
          <tr>
            <td className="rel-corner" />
            {COLUMNS.map(release => <th key={release} scope="col" data-release={release}>
              <span className="rel-release">{release}</span>
              <span className="rel-release-note">{RELEASES_SECTION.columns[release]}</span>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => <tr key={row.key} data-release-row={row.key}>
            <th scope="row">{row.label}</th>
            {COLUMNS.map(release => <td key={release} data-release={release}>
              {row.value(release)}
              {row.key === 'results' && <a className="rel-results-link"
                href={`${HOME_URL}?release=${release}#${RELEASES_SECTION.resultsLinks[release].anchor}`}>
                {RELEASES_SECTION.resultsLinks[release].label}
              </a>}
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
