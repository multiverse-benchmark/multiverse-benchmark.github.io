import { useEffect, useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { harnessName, useRun, type Run, type RunModel } from "@/lib/runs";
import { DetailSection, TextPanel } from "@/components/explorer/detail/DetailPrimitives";
import { TrajectorySteps } from "@/components/explorer/detail/ReferenceTrajectory";
import { TERMINATION_COPY } from "./copy";
import { OutcomePill, RunVerifiers } from "./RunVerifiers";
import { HarnessBadge } from "./HarnessBadge";

/*
 * One model's run of one task, in two panes that scroll on their own: the
 * outcome with what each verifier decided, and the trajectory with the final
 * response. The verifier results stay in place while the trajectory is read.
 * The panes stand side by side where the window is wide, and one above the
 * other elsewhere.
 *
 * The run takes the height of the area it is shown in (the scrolling area of
 * the task's tab), so that the panes, not that area, scroll once the run is in
 * view. The trajectory is drawn by the same component as the gold trajectory
 * of the task.
 */

const plural = (count: number, noun: string) => `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;

function RunFacts({ run }: { run: Run }) {
  const facts = [
    plural(run.toolCalls, "tool call"),
    run.modelCalls !== null ? plural(run.modelCalls, "model call") : null,
    run.turns !== null ? plural(run.turns, "turn") : null,
  ].filter(Boolean);
  return <p className="text-xs text-slate-500">{facts.join(" · ")}</p>;
}

function LoadedRun({ run, model }: { run: Run; model: RunModel }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    const area = element?.closest<HTMLElement>(".overflow-y-auto");
    if (!element || !area) return;
    const measure = () => element.style.setProperty("--run-area", `${area.clientHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const termination = run.termination === "completed" ? null : TERMINATION_COPY[run.termination] ?? { label: run.termination, text: "The run ended early." };
  return <div ref={frame} data-run={`${model.id}/${run.taskId}`} data-run-passed={run.passed} className="flex h-[calc(var(--run-area,80dvh)-2rem)] min-h-[440px] min-w-0 flex-col gap-4 xl:flex-row xl:gap-5">
    <aside data-run-pane="verifiers" aria-label={`Outcome and verifier results of ${model.name} under ${harnessName(model.harness)}`} tabIndex={0} className="max-h-[45%] min-w-0 shrink-0 space-y-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 xl:max-h-none xl:w-[420px] 2xl:w-[480px]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-sm font-semibold text-slate-900">{model.name}</h3>
          <HarnessBadge harness={run.harness} />
          <OutcomePill passed={run.passed} />
          {termination && <span className="rounded-md bg-[var(--mv-partial-tint)] px-2 py-1 text-xs font-medium text-[var(--mv-partial)]" data-run-termination={run.termination}>{termination.label}</span>}
        </div>
        <RunFacts run={run} />
        {termination && <p className="text-xs leading-relaxed text-slate-500">{termination.text} The verifiers scored it as it ended.</p>}
      </div>
      <RunVerifiers run={run} />
    </aside>
    <div data-run-pane="trajectory" role="group" aria-label={`Trajectory of ${model.name} under ${harnessName(model.harness)}`} tabIndex={0} className="min-h-0 min-w-0 flex-1 space-y-7 overflow-y-auto rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">
      <DetailSection title={`Trajectory of ${model.name}`} description="The run as recorded: the system prompt, the messages of the user and the agent, the agent’s recorded thoughts, and every tool call with its output.">
        <TrajectorySteps key={`${model.id}/${run.taskId}`} steps={run.steps} isReference={false} />
      </DetailSection>
      {run.finalResponse && <DetailSection title="Final response" description="The agent’s last message to the user.">
        <TextPanel>{run.finalResponse}</TextPanel>
      </DetailSection>}
    </div>
  </div>;
}

export function RunView({ taskId, model, onReady }: { taskId: string; model: RunModel; /** Called when the run is on the page. */ onReady?: () => void }) {
  const run = useRun(taskId, model);
  const ready = run.status === "loaded";
  // The caller's function changes with every render; only the arrival of the run matters here.
  useEffect(() => { if (ready) onReady?.(); }, [ready]);
  if (run.status === "loading") return <div role="status" className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white">
    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    <p className="text-sm font-medium text-slate-600">Loading the run of {model.name}…</p>
  </div>;
  if (run.status === "error") return <div role="alert" className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-center">
    <AlertCircle className="h-7 w-7 text-amber-500" />
    <p className="text-sm font-semibold text-slate-800">Could not load this run</p>
    <p className="max-w-md text-sm text-slate-500">{run.message}</p>
  </div>;
  return <LoadedRun run={run.value} model={model} />;
}
