import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, Bot, Code2, Lightbulb, MessageSquare, Search, User, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GoldTrajectory, MultiverseTask, ReferenceTrajectoryStep } from "@/types";
import { CodePanel, DetailSection, EmptyDetail, RawDisclosure, TextPanel } from "./DetailPrimitives";
import { formatValue } from "./utils";
import { presentGoldTrajectory, type HintSource, type PresentedTrajectoryStep } from "./trajectoryPresentation";

function stepAppearance(step: ReferenceTrajectoryStep, isHint = false) {
  if (isHint) return { icon: Lightbulb, name: "Hint", color: "text-amber-700 bg-amber-50" };
  if (step.action === "code") return { icon: Code2, name: "Code", color: "text-emerald-600 bg-emerald-50" };
  if (step.action === "thought") return { icon: Lightbulb, name: "Thought", color: "text-amber-600 bg-amber-50" };
  if (step.action === "tool_use") return { icon: Wrench, name: "Tool call", color: "text-emerald-600 bg-emerald-50" };
  if (step.action === "tool_result" || step.role === "FUNCTION") return { icon: Wrench, name: "Tool result", color: "text-emerald-600 bg-emerald-50" };
  if (step.role === "USER") return { icon: User, name: "User", color: "text-emerald-700 bg-emerald-50" };
  if (step.role === "MODEL") return { icon: Bot, name: "Agent", color: "text-emerald-600 bg-emerald-50" };
  if (step.role === "SYSTEM") return { icon: MessageSquare, name: "System", color: "text-slate-600 bg-slate-100" };
  return { icon: MessageSquare, name: "Unknown", color: "text-slate-600 bg-slate-100" };
}

/* Why a step is shown as a hint although the gold trajectory stores it as a user message. */
const HINT_NOTE: Record<HintSource, string> = {
  marker: "Marked as a hint in the gold trajectory, where it is stored as a user message.",
  position: "A hint given while the gold trajectory was recorded. The gold trajectory stores it as a user message.",
};

function StepContent({ step, isReference, hintSource }: { step: ReferenceTrajectoryStep; isReference: boolean; hintSource?: HintSource }) {
  const isHint = hintSource !== undefined;
  const appearance = stepAppearance(step, isHint);
  const Icon = appearance.icon;
  const hasOutput = step.output !== undefined && (step.output !== null || step.action === "tool_result" || step.role === "FUNCTION");
  const hasContent = [step.content, step.reasoning, step.code, step.codeOutput, step.input, step.output]
    .some((value) => value !== undefined && value !== null && value !== "") || hasOutput;
  return <div className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${appearance.color}`}><Icon className="h-3.5 w-3.5" />{appearance.name}</span>
      <span className="text-xs text-slate-400">Step {step.step}</span>
      {step.tool && <span className="break-all font-mono text-xs text-slate-600">{step.tool}</span>}
    </div>
    {step.reasoning && <DetailSection title={isReference ? "Gold trajectory thought" : "Recorded thought"}><TextPanel>{step.reasoning}</TextPanel></DetailSection>}
    {hintSource && <p className="text-xs leading-relaxed text-slate-500">{HINT_NOTE[hintSource]}</p>}
    {step.content && step.content !== step.reasoning && <DetailSection title={isHint ? "Hint" : step.role === "USER" ? "User message" : step.role === "SYSTEM" ? "System message" : "Message"}><TextPanel>{step.content}</TextPanel></DetailSection>}
    {step.input !== undefined && step.input !== null && <CodePanel value={step.input} label="Tool input" />}
    {hasOutput && <CodePanel value={step.output} label="Recorded tool output" />}
    {step.code !== undefined && step.code !== null && <CodePanel value={step.code} label={isReference ? "Gold solution code · read only" : "Recorded code · read only"} />}
    {step.codeOutput !== undefined && step.codeOutput !== null && step.codeOutput !== "" && <CodePanel value={step.codeOutput} label="Recorded code output" />}
    {!hasContent && <EmptyDetail>No readable content is available for this step.</EmptyDetail>}
  </div>;
}

/* The hints of a gold trajectory, listed before its steps. Selecting one leads to its step. */
function HintList({ hints, onSelect }: { hints: PresentedTrajectoryStep[]; onSelect: (index: number) => void }) {
  return <nav aria-label="Hints in this gold trajectory" data-trajectory-hints className="border-b border-slate-200 bg-amber-50/50 px-4 py-3">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
      <Lightbulb className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
      {hints.length} {hints.length === 1 ? "hint" : "hints"} given in this gold trajectory
    </p>
    <ol className="mt-2 space-y-1">
      {hints.map(({ step, index }) => <li key={index}>
        <button type="button" data-hint-step={step.step} onClick={() => onSelect(index)} title={`Go to step ${step.step}`} className="group flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-amber-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500">
          <span className="shrink-0 font-medium tabular-nums text-slate-500">Step {step.step}</span>
          <span className="min-w-0 flex-1 truncate">{(step.content ?? "").trim()}</span>
          <ArrowDown className="h-3 w-3 shrink-0 self-center text-slate-400 group-hover:text-slate-700" aria-hidden="true" />
        </button>
      </li>)}
    </ol>
  </nav>;
}

export function TrajectorySteps({ steps, isReference = true, singleTurn = false }: {
  steps: ReferenceTrajectoryStep[];
  isReference?: boolean;
  /** The task has one user turn, so every later user message of its gold trajectory is a hint. */
  singleTurn?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  /** The step that the list of hints led to last; it is marked until another one is chosen. */
  const [target, setTarget] = useState<{ index: number; request: number } | null>(null);
  const stepId = useId();
  const label = isReference ? "gold trajectory" : "run";
  const presentation = useMemo((): { visible: PresentedTrajectoryStep[]; duplicates: PresentedTrajectoryStep[] } => isReference ? presentGoldTrajectory(steps, { singleTurn }) : {
    visible: steps.map((step, index) => ({ step, index, kind: step.action, isHint: false })),
    duplicates: [],
  }, [steps, isReference, singleTurn]);
  const hints = useMemo(() => presentation.visible.filter((entry) => entry.isHint), [presentation]);

  /* A hint is reached with the filters cleared, so that its step is among those shown. */
  function goToStep(index: number) {
    setQuery("");
    setKind("all");
    setTarget((previous) => ({ index, request: (previous?.request ?? 0) + 1 }));
  }
  useEffect(() => {
    if (!target) return;
    const element = document.getElementById(`${stepId}-${target.index}`);
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    element.focus({ preventScroll: true });
  }, [target, stepId]);

  const kinds = [...new Set(presentation.visible.map((entry) => entry.kind))];
  const filtered = useMemo(() => presentation.visible
    .filter(({ step, kind: stepKind }) => (kind === "all" || stepKind === kind)
      && formatValue(step).toLowerCase().includes(query.trim().toLowerCase())), [presentation, query, kind]);

  if (!steps.length) return <EmptyDetail>No structured or parseable steps are available. Any complete source trace is displayed below.</EmptyDetail>;

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    {hints.length > 0 && <HintList hints={hints} onSelect={goToStep} />}
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 p-3">
      <div className="relative min-w-[160px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input aria-label={`Search ${label} steps`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search steps, tools, inputs, outputs…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
      </div>
      <select aria-label={`Filter ${label} step type`} value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 focus:border-emerald-400">
        <option value="all">All step types</option>
        {kinds.map((action) => <option key={action} value={action}>{action.replace(/_/g, " ")}</option>)}
      </select>
      <span aria-live="polite" className="text-xs tabular-nums text-slate-500">{filtered.length} / {presentation.visible.length} displayed steps</span>
    </div>
    {presentation.duplicates.length > 0 && <details className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium">{presentation.duplicates.length} duplicate system {presentation.duplicates.length === 1 ? "entry" : "entries"} collapsed (source {presentation.duplicates.length === 1 ? "step" : "steps"} {presentation.duplicates.map(({ step }) => step.step).join(", ")})</summary>
      <div className="mt-3 space-y-3">
        <p className="leading-relaxed">These leading User entries repeat the first system prompt, apart from an optional [SYSTEM] marker and surrounding whitespace. The source is unchanged, and step numbers retain their original values.</p>
        {presentation.duplicates.map(({ step, index }) => <RawDisclosure key={index} value={step.rawStep ?? step} label={`Original duplicate · source step ${step.step}`} />)}
      </div>
    </details>}
    {filtered.length ? <ol aria-label={isReference ? "Gold trajectory steps" : "Run trajectory steps"} className="divide-y divide-slate-200">
      {filtered.map(({ step, index, hintSource }) => <li key={index} id={`${stepId}-${index}`} tabIndex={-1} data-step={step.step} data-step-hint={hintSource} data-step-target={target?.index === index || undefined} className={`min-w-0 scroll-mt-3 outline-none ${target?.index === index ? "bg-amber-50/60 shadow-[inset_3px_0_0_0_var(--mv-user)]" : ""}`}>
        <StepContent step={step} isReference={isReference} hintSource={hintSource} />
      </li>)}
    </ol> : <div className="p-5"><EmptyDetail>No {label} steps match these filters.</EmptyDetail></div>}
  </div>;
}

export function ReferenceTrajectory({ task }: { task: MultiverseTask }) {
  const [variant, setVariant] = useState(0);
  const trajectories: GoldTrajectory[] = task.goldTrajectories ?? (task.trajectory?.length ? [{
    index: 0, stepCount: task.trajectory.length, toolCallCount: task.trajectory.filter((step) => step.action === "tool_use").length,
    userTurnCount: task.trajectory.filter((step) => step.role === "USER").length,
    source: "structured", recordedToolCallCount: "", finalResponse: "", steps: task.trajectory,
  }] : []);
  const trajectory = trajectories[variant];
  if (!trajectory) return <EmptyDetail>No gold trajectory is included in this task.</EmptyDetail>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Gold trajectories</h3>
      </div>
      {trajectories.length > 1 && <label className="flex shrink-0 items-center gap-2 text-xs text-slate-500">Variant
        <select aria-label="Gold trajectory variant" value={variant} onChange={(event) => setVariant(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
          {trajectories.map((item, index) => <option value={index} key={item.index}>Gold trajectory {index + 1} of {trajectories.length}</option>)}
        </select>
      </label>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="bg-emerald-50 font-normal text-emerald-700">{trajectory.steps.length} source steps</Badge>
      {trajectory.stepCount !== trajectory.steps.length && <span className="text-xs text-slate-500">Authored step count: {trajectory.stepCount}</span>}
    </div>
    <TrajectorySteps key={variant} steps={trajectory.steps} singleTurn={task.taskType === "ST" || task.taskType === "IF"} />
    {trajectory.finalResponse && <DetailSection title="Gold final response"><TextPanel>{trajectory.finalResponse}</TextPanel></DetailSection>}
  </div>;
}
