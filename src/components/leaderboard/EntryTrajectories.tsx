import type { MouseEvent } from "react";
import { RESULT_EXPLORER_URL } from "@/components/site/SiteChrome";
import { useRunIndex } from "@/lib/runs";

/**
 * Where the trajectories of a submitted entry can be seen, for its run details.
 *
 * When the site is built, scripts/export_submission_runs.py adds the runs of
 * a submitted entry to the run viewer. The entry then has a column in the
 * result explorer like a baseline, and every cell of it opens that run in the
 * "Trajectories" tab of its task. An entry whose archive could not be fetched
 * at that time is not in the viewer: the link then leads to the archive its
 * submitter published.
 *
 * The run index is the one the explorers read, requested once per visit.
 */
export function EntryTrajectories({ entryId, archiveUrl }: { entryId: string; archiveUrl: string }) {
  const index = useRunIndex();
  const stay = (event: MouseEvent) => event.stopPropagation();
  // Nothing is shown while the index is on its way: either link would be a guess.
  if (index.status === "loading") return <span aria-busy="true" data-lb-trajectories="loading" />;
  const inViewer = index.status === "loaded" && index.value.models.some((model) => model.id === entryId);
  return inViewer ? (
    <a href={RESULT_EXPLORER_URL} data-lb-trajectories="explorer" onClick={stay}>
      Browse in the result explorer
    </a>
  ) : (
    <a href={archiveUrl} rel="noreferrer" data-lb-trajectories="archive" onClick={stay}>
      Download the archive
    </a>
  );
}
