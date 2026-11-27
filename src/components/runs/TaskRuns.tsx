import { useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { VERIFIER_IDS, harnessName, runHash, useRunIndex, type RunIndex } from "@/lib/runs";
import { RUNS_COPY, TERMINATION_COPY, VERIFIER_COPY } from "./copy";
import { RunView } from "./RunView";
import { OutcomePill, VerdictMark } from "./RunVerifiers";
import { HarnessBadge } from "./HarnessBadge";

/*
 * The "Trajectories" tab of a task in the task explorer: how each model of
 * the validation leaderboard did on the task, and one of those runs in full.
 *
 * The table lists the models in the order of the leaderboard, each with the
 * outcome of its run and the verdict of every verifier. Selecting a model,
 * anywhere on its row, shows its run under the table and brings it into view:
 * the verifier results and the trajectory. The selected model is part of the
 * address (#task=…&section=trajectories&model=…), so a run can be linked to.
 */

const modelFromHash = () => new URLSearchParams(window.location.hash.slice(1)).get("model");

function Runs({ taskId, index }: { taskId: string; index: RunIndex }) {
  const models = index.models.filter(model => index.cell(taskId, model.id));
  const isKnown = (id: string | null): id is string => id !== null && models.some(model => model.id === id);
  const [selected, setSelected] = useState(() => { const named = modelFromHash(); return isKnown(named) ? named : models[0].id; });
  const run = useRef<HTMLDivElement>(null);
  /** A model was asked for and its run is not yet on screen. */
  const awaited = useRef(isKnown(modelFromHash()));

  /*
   * The run sits under the table, so a selection has to bring it into view to
   * be seen: at once, where the run is still loading, and again when it has
   * loaded, because only then is the page long enough to put the run and the
   * start of its trajectory at the top.
   */
  function showRun() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => run.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
  }
  function ask() { awaited.current = true; showRun(); }
  function onRunReady() { if (awaited.current) { awaited.current = false; showRun(); } }

  useEffect(() => {
    // An address that names a model leads to that model's run.
    const update = () => { const named = modelFromHash(); if (isKnown(named)) { setSelected(named); ask(); } };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
    // The models of the index do not change during a visit, so the listener is set once.
  }, []);

  function select(modelId: string) {
    setSelected(modelId);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${runHash(taskId, modelId)}`);
    ask();
  }

  const model = models.find(candidate => candidate.id === selected)!;
  return <div className="min-w-0 space-y-7" data-task-runs={taskId}>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[600px] border-collapse text-left text-xs">
        <caption className="sr-only">Outcome of each model and harness on this task, with the verdict of each verifier. Select a row to show its trajectory.</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Model / harness</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Run</th>
            {VERIFIER_IDS.map(id => <th key={id} scope="col" className="px-3 py-2.5 text-center font-medium" title={VERIFIER_COPY[id].name}>{VERIFIER_COPY[id].short}</th>)}
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Trajectory</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {models.map(candidate => {
            const cell = index.cell(taskId, candidate.id);
            if (!cell) return null;
            const isSelected = candidate.id === selected;
            const termination = cell.termination === "completed" ? null : TERMINATION_COPY[cell.termination]?.label ?? cell.termination;
            // The whole row selects the model; the button in it is the same action for the keyboard and for assistive technology.
            return <tr key={candidate.id} data-run-row={candidate.id} data-selected={isSelected} onClick={() => select(candidate.id)} className={`cursor-pointer ${isSelected ? "bg-emerald-50/70" : "hover:bg-slate-50"}`}>
              <th scope="row" className="px-4 py-2 font-medium">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-medium text-slate-800">{candidate.name}</span><HarnessBadge harness={candidate.harness} /></span>
                {termination && <span className="ml-2 text-[11px] font-normal text-[var(--mv-partial)]">{termination}</span>}
              </th>
              <td className="px-3 py-2"><OutcomePill passed={cell.passed} /></td>
              {VERIFIER_IDS.map(id => <td key={id} className="px-3 py-2 text-center">
                <VerdictMark verdict={cell.verdicts[id]} label={`${VERIFIER_COPY[id].name}: ${cell.verdicts[id] === "na" ? RUNS_COPY.notApplicable.toLowerCase() : cell.verdicts[id] === "pass" ? "passed" : "failed"}`} />
              </td>)}
              <td className="px-3 py-2 text-right">
                <button type="button" aria-pressed={isSelected} aria-label={`Show the trajectory of ${candidate.name} under ${harnessName(candidate.harness)}`} onClick={event => { event.stopPropagation(); select(candidate.id); }} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-emerald-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                  {isSelected ? "Shown below" : "Show"}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <div ref={run} className="scroll-mt-4">
      <RunView key={`${selected}/${taskId}`} taskId={taskId} model={model} onReady={onRunReady} />
    </div>
  </div>;
}

export function TaskRuns({ taskId }: { taskId: string }) {
  const index = useRunIndex();
  if (index.status === "loading") return <div role="status" className="flex min-h-[240px] flex-col items-center justify-center gap-3">
    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    <p className="text-sm font-medium text-slate-600">Loading the models’ trajectories…</p>
  </div>;
  if (index.status === "error") return <div role="alert" className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
    <AlertCircle className="h-7 w-7 text-amber-500" />
    <p className="text-sm font-semibold text-slate-800">Could not load the models’ trajectories</p>
    <p className="max-w-md text-sm text-slate-500">{index.message}</p>
  </div>;
  if (!index.value.scoredCount(taskId)) return <p className="text-sm text-slate-500">No model trajectories are available for this task.</p>;
  return <Runs key={taskId} taskId={taskId} index={index.value} />;
}
