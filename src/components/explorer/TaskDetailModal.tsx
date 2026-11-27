/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, BookOpen, Bot, Braces, FileCheck2, GitCompareArrows, ListTree, Loader2, LockKeyhole, Maximize2, MessagesSquare, Minimize2, Monitor, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MultiverseTask } from "@/types";
import { ReferenceTrajectory } from "./detail/ReferenceTrajectory";
import { TaskStates } from "./detail/StateBrowser";
import { TaskContext } from "./detail/TaskContext";
import { DesktopGUI } from "./detail/DesktopGUI";
import { TaskEvaluation, TaskInstructions, TaskOverview, TaskSource } from "./detail/TaskSections";

import { dataRoot, useRelease } from "@/lib/release";
import { RUNS_SECTION, hasRuns } from "@/lib/runs";
import { fetchStaticJson } from "@/lib/staticData";
import { RUNS_COPY } from "@/components/runs/copy";
import { TaskRuns } from "@/components/runs/TaskRuns";

interface TaskDetailModalProps {
  task: MultiverseTask | null;
  onClose: () => void;
  footerActions?: ReactNode;
}

const DETAIL_TABS = [
  { value: "overview", label: "Overview", icon: BookOpen },
  { value: "desktop", label: "Desktop GUI", icon: Monitor },
  { value: "context", label: "Context & dialogue", icon: MessagesSquare },
  { value: "instructions", label: "Instructions", icon: ScrollText },
  { value: "gold-trajectory", label: "Gold trajectory", icon: ListTree },
  // The models' runs of the task on the validation leaderboard; only the release that has them shows the tab (src/lib/runs.ts).
  { value: RUNS_SECTION, label: RUNS_COPY.tab, icon: Bot },
  { value: "evaluation", label: "Evaluation", icon: FileCheck2 },
  { value: "state", label: "Service states", icon: GitCompareArrows },
  { value: "source", label: "Source & setup", icon: Braces },
];

function LoadedTask({ task }: { task: MultiverseTask }) {
  const release = useRelease();
  const tabs = hasRuns(release) ? DETAIL_TABS : DETAIL_TABS.filter(tab => tab.value !== RUNS_SECTION);
  const sectionFromHash = () => {
    const section = new URLSearchParams(window.location.hash.slice(1)).get("section");
    return tabs.some(tab => tab.value === section) ? section! : "overview";
  };
  const [section, setSection] = useState(sectionFromHash);
  useEffect(() => {
    const update = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <Tabs value={section} onValueChange={value => {
    setSection(value);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#task=${encodeURIComponent(task.id)}&section=${value}`);
  }} className="min-h-0 flex-1 gap-0 overflow-hidden">
    <div className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6">
      <TabsList aria-label="Task detail sections" className="h-12 w-max justify-start gap-2 rounded-none bg-transparent p-0">
        {tabs.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="h-12 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent px-3 text-xs text-slate-500 shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none">
          <Icon className="h-3.5 w-3.5" />{label}
        </TabsTrigger>)}
      </TabsList>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 p-4 sm:p-6">
      <TabsContent value="overview" className="m-0"><TaskOverview task={task} /></TabsContent>
      <TabsContent value="desktop" className="m-0"><DesktopGUI task={task} /></TabsContent>
      <TabsContent value="context" className="m-0"><TaskContext task={task} /></TabsContent>
      <TabsContent value="instructions" className="m-0"><TaskInstructions task={task} /></TabsContent>
      <TabsContent value="gold-trajectory" className="m-0"><ReferenceTrajectory task={task} /></TabsContent>
      {hasRuns(release) && <TabsContent value={RUNS_SECTION} className="m-0"><TaskRuns taskId={task.id} /></TabsContent>}
      <TabsContent value="evaluation" className="m-0"><TaskEvaluation task={task} /></TabsContent>
      <TabsContent value="state" className="m-0"><TaskStates task={task} /></TabsContent>
      <TabsContent value="source" className="m-0"><TaskSource task={task} /></TabsContent>
    </div>
  </Tabs>;
}

function DetailRequest({ taskId, onRetry }: { taskId: string; onRetry: () => void }) {
  const [result, setResult] = useState<
    { status: "loading" } | { status: "loaded"; task: MultiverseTask } | { status: "error"; message: string }
  >({ status: "loading" });

  // The explorer remounts the dialog when the release changes, so the release is fixed for this request.
  const release = useRelease();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchStaticJson<MultiverseTask>(`${dataRoot(release)}tasks/${encodeURIComponent(taskId)}.json.gz`, controller.signal);
        if (data.id !== taskId) throw new Error("The file request returned a different task. Please retry.");
        if (!controller.signal.aborted) setResult({ status: "loaded", task: data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ status: "error", message: error instanceof Error ? error.message : "The task request failed." });
      }
    }
    void load();
    return () => controller.abort();
  }, [taskId, release]);

  if (result.status === "loading") return <div role="status" className="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 bg-slate-50">
    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
    <p className="text-sm font-medium text-slate-600">Loading task details…</p>
    <p className="text-xs text-slate-400">Fetching instructions, gold trajectories, and evaluation criteria</p>
  </div>;
  if (result.status === "error") return <div role="alert" className="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
    <AlertCircle className="h-7 w-7 text-amber-500" />
    <p className="text-sm font-semibold text-slate-800">Could not load task details</p>
    <p className="max-w-md text-sm text-slate-500">{result.message}</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Retry loading details</Button>
  </div>;
  return <LoadedTask task={result.task} />;
}

/*
 * The focused view: the task takes the whole window instead of standing as a
 * dialog over the page, which gives the trajectories, the service states and
 * the code their full width and height.
 *
 * The choice is part of the address (?view=focus), so a copied link opens the
 * task the same way, and it holds for the visit (session storage), so the next
 * task opens as the last one was left.
 */
const FOCUS_PARAM = "view";
const FOCUS_VALUE = "focus";
const FOCUS_KEY = "multiverse-task-view";

function focusedAtStart(): boolean {
  if (new URLSearchParams(window.location.search).get(FOCUS_PARAM) === FOCUS_VALUE) return true;
  try { return window.sessionStorage.getItem(FOCUS_KEY) === FOCUS_VALUE; } catch { return false; }
}

function rememberFocus(focused: boolean) {
  try {
    if (focused) window.sessionStorage.setItem(FOCUS_KEY, FOCUS_VALUE);
    else window.sessionStorage.removeItem(FOCUS_KEY);
  } catch { /* The view also works when browser storage is disabled. */ }
  const address = new URL(window.location.href);
  if ((address.searchParams.get(FOCUS_PARAM) === FOCUS_VALUE) === focused) return;
  if (focused) address.searchParams.set(FOCUS_PARAM, FOCUS_VALUE);
  else address.searchParams.delete(FOCUS_PARAM);
  window.history.replaceState(null, "", address);
}

const DIALOG_FRAME = "h-[92dvh] max-h-[960px] w-[calc(100%-1rem)] max-w-[1280px] rounded-2xl border-slate-200 sm:max-w-[1280px]";
const FOCUS_FRAME = "h-dvh max-h-none w-screen max-w-none rounded-none border-0 sm:max-w-none";

export function TaskDetailModal({ task, onClose, footerActions }: TaskDetailModalProps) {
  const [attempt, setAttempt] = useState(0);
  const [focused, setFocused] = useState(focusedAtStart);
  useEffect(() => { rememberFocus(focused); }, [focused]);
  if (!task) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent aria-describedby={undefined} data-task-view={focused ? "focus" : "dialog"} className={`mv-task-dialog flex ${focused ? FOCUS_FRAME : DIALOG_FRAME} flex-col gap-0 overflow-hidden p-0`}>
      <button type="button" data-task-focus aria-pressed={focused} onClick={() => setFocused(value => !value)}
        title={focused ? "Return the task to a dialog over the page" : "Let the task take the whole window"}
        className="absolute right-12 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
        {focused ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
        {focused ? "Exit focused view" : "Focused view"}
      </button>
      <DialogHeader className="shrink-0 gap-2 border-b border-slate-100 bg-white px-5 py-5 pr-12 pt-12 text-left sm:px-6 sm:pr-48 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-emerald-50 text-[10px] font-medium text-emerald-700">TASK EXPLORER</Badge>
          <Badge variant="outline" className="text-[10px] font-normal text-slate-500">{task.domain}</Badge>
          <span className="break-all font-mono text-[10px] text-slate-400">{task.sourceId || task.id}</span>
        </div>
        <DialogTitle className="break-words text-base leading-6 text-slate-900 sm:text-lg">{task.title}</DialogTitle>
      </DialogHeader>
      <DetailRequest key={`${task.id}-${attempt}`} taskId={task.id} onRetry={() => setAttempt((value) => value + 1)} />
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-[10px] text-slate-400 sm:px-6">
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" />Validation task · read-only exploration</span>
        <div className="flex items-center gap-4">{footerActions}<span className="hidden sm:inline">Esc to close</span></div>
      </div>
    </DialogContent>
  </Dialog>;
}
