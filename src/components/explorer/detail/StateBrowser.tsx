import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Database, FolderOpen, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MultiverseTask, ReferenceDiffEntry, TaskStateSnapshot } from "@/types";
import { CodePanel, EmptyDetail } from "./DetailPrimitives";
import { ReferenceState } from "./ReferenceState";
import { ServiceAppView } from "./ServiceAppView";
import { getServiceView } from "./serviceStateModel";
import { formatValue } from "./utils";

import { dataRoot, useRelease } from "@/lib/release";
import { fetchStaticJson } from "@/lib/staticData";
type Phase = "initial" | "final";
type DisplayMode = "app" | "table" | "tree" | "json";

function children(value: unknown): [string, unknown][] {
  return value !== null && typeof value === "object" ? Object.entries(value) : [];
}

function isContainer(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function valueSummary(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} items`;
  if (isContainer(value)) return `${Object.keys(value as object).length} fields`;
  return formatValue(value);
}

function TreeNode({ name, value, initialOpen = false }: { name: string; value: unknown; initialOpen?: boolean }) {
  const [expanded, setExpanded] = useState(initialOpen);
  const [limit, setLimit] = useState(60);
  const entries = expanded ? children(value) : [];
  if (!isContainer(value)) return <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 px-2 py-1 font-mono text-xs leading-6"><span className="break-all text-emerald-700">{name}:</span><span className="min-w-0 whitespace-pre-wrap break-words text-slate-600 [overflow-wrap:anywhere]">{formatValue(value)}</span></div>;
  return <div className="min-w-0">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex w-full items-start gap-1 rounded px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
      {expanded ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
      <span className="break-all font-mono text-xs text-slate-700">{name}</span><span className="shrink-0 text-[10px] text-slate-400">{valueSummary(value)}</span>
    </button>
    {expanded && <div className="ml-3 border-l border-slate-100 pl-2">
      {entries.length ? entries.slice(0, limit).map(([key, item]) => <TreeNode key={key} name={key} value={item} />) : <p className="p-2 text-xs italic text-slate-400">{Array.isArray(value) ? "Empty array" : "Empty object"}</p>}
      {entries.length > limit && <button type="button" onClick={() => setLimit((value) => value + 60)} className="p-2 text-xs font-medium text-emerald-600">Show more ({entries.length - limit} remaining)</button>}
    </div>}
  </div>;
}

function StateTable({ entries, onOpen }: { entries: [string, unknown][]; onOpen: (keys: string[]) => void }) {
  const [limit, setLimit] = useState(50);
  const isRecordCollection = entries.length > 0 && entries.every(([, value]) => value !== null && typeof value === "object" && !Array.isArray(value));
  const columns = isRecordCollection ? [...new Set(entries.flatMap(([, value]) => Object.keys(value as object)))] : [];
  return <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
    <div className="max-h-[480px] overflow-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-500"><tr><th className="border-b border-slate-200 px-3 py-2 font-medium">Key / index</th>{isRecordCollection ? columns.map((column) => <th key={column} className="min-w-36 border-b border-slate-200 px-3 py-2 font-medium">{column}</th>) : <th className="border-b border-slate-200 px-3 py-2 font-medium">Value</th>}</tr></thead>
        <tbody className="bg-white">{entries.slice(0, limit).map(([key, value]) => <tr key={key} className="align-top hover:bg-slate-50/70">
          <th className="border-b border-slate-100 px-3 py-2 text-left font-mono font-normal text-slate-600">{isContainer(value) ? <button type="button" onClick={() => onOpen([key])} className="flex items-center gap-1.5 text-emerald-600 underline decoration-emerald-200 underline-offset-4"><FolderOpen className="h-3 w-3 shrink-0" /><span className="break-all">{key}</span></button> : key}</th>
          {isRecordCollection ? columns.map((column) => {
            const record = value as Record<string, unknown>;
            const item = record[column];
            return <td key={column} className="border-b border-slate-100 px-3 py-2 text-slate-700">
              {!Object.hasOwn(record, column) ? <span className="text-slate-400">Not present</span> : isContainer(item) ? <button type="button" onClick={() => onOpen([key, column])} className="whitespace-nowrap text-emerald-600 underline decoration-emerald-200 underline-offset-4">Open · {valueSummary(item)}</button> : <div className="max-h-40 min-w-24 max-w-80 overflow-auto whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">{formatValue(item)}</div>}
            </td>;
          }) : <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{isContainer(value) ? <button type="button" onClick={() => onOpen([key])} className="text-emerald-600 underline decoration-emerald-200 underline-offset-4">Open · {valueSummary(value)}</button> : <div className="max-h-40 overflow-auto whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">{formatValue(value)}</div>}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    {entries.length > limit && <button type="button" onClick={() => setLimit((value) => value + 50)} className="w-full border-t border-slate-200 bg-slate-50 p-3 text-xs font-medium text-emerald-600">Show more rows ({entries.length - limit} remaining)</button>}
  </div>;
}

function StateContents({ snapshot, phase, selectedService, onServiceChange, mode, onModeChange, changes, selectedRecord, onSelectRecord }: {
  snapshot: TaskStateSnapshot; phase: Phase; selectedService: string;
  onServiceChange: (service: string) => void; mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void; changes: ReferenceDiffEntry[];
  selectedRecord: string | null; onSelectRecord: (record: string | null) => void;
}) {
  const availableServices = Object.keys(snapshot.data);
  const unavailableServices = snapshot.unavailableServices ?? {};
  // Keep a removed/added service selected when comparing the two states.
  const services = [...new Set([...availableServices, ...Object.keys(unavailableServices), ...(selectedService ? [selectedService] : [])])].sort();
  const service = selectedService || services[0] || "";
  const unavailableReason = unavailableServices[service];
  const [path, setPath] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [treeLimit, setTreeLimit] = useState(60);
  const serviceView = getServiceView(service, snapshot.data[service]);
  const activeMode = mode === "app" && !serviceView ? "table" : mode;
  const value = path.reduce<unknown>((current, key) => current !== null && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, snapshot.data[service]);
  const entries = useMemo(() => {
    if (activeMode === "app" || activeMode === "json") return [];
    const all = children(value);
    const search = query.trim().toLowerCase();
    return search ? all.filter(([key, item]) => `${key}\n${formatValue(item)}`.toLowerCase().includes(search)) : all;
  }, [value, query, activeMode]);
  function navigate(next: string[]) { setPath(next); setQuery(""); setTreeLimit(60); }

  if (!services.length) return <EmptyDetail>This snapshot contains no service data.</EmptyDetail>;
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="State services" className="flex max-h-44 flex-wrap gap-1 overflow-auto border-b border-slate-200 bg-slate-50 p-2 lg:max-h-[700px] lg:flex-col lg:flex-nowrap lg:border-b-0 lg:border-r">
        <p className="w-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Services · {availableServices.length} available</p>
        {services.map((name) => {
          const count = changes.filter((entry) => entry.path[0] === name).length;
          return <button type="button" key={name} aria-label={`Inspect ${name} state`} aria-pressed={service === name} onClick={() => { onServiceChange(name); navigate([]); }} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-left text-xs ${service === name ? "bg-emerald-100 font-semibold text-emerald-700" : "text-slate-600 hover:bg-slate-100"}`}><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block break-words capitalize">{name.replace(/_/g, " ")}</span>{Object.hasOwn(unavailableServices, name) ? <span className="block text-[10px] font-normal text-amber-700">Reconstruction unavailable</span> : !Object.hasOwn(snapshot.data, name) && <span className="block text-[10px] font-normal text-slate-500">Not present in this state</span>}{count > 0 && <span className="mt-1 block text-[10px] font-normal text-amber-700">{count} gold DB {count === 1 ? "change" : "changes"}</span>}</span></button>;
        })}
      </nav>
      <div className="min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="break-all text-sm font-semibold text-slate-800">{serviceView?.label || service.replace(/_/g, " ")}</h3>
          {!unavailableReason && <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5" aria-label="State display mode">{([...(serviceView ? ["app" as const] : []), "table", "tree", "json"] as const).map((name) => <button type="button" key={name} aria-pressed={activeMode === name} onClick={() => onModeChange(name)} className={`rounded-md px-3 py-1.5 text-xs ${activeMode === name ? "bg-emerald-50 font-medium text-emerald-700" : "text-slate-500 hover:bg-slate-50"}`}>{name === "app" ? "App view" : name === "json" ? "JSON" : name === "tree" ? "Tree" : "Table"}</button>)}</div>}
        </div>
        {unavailableReason ? <EmptyDetail><p className="font-medium">This service's gold final state is unavailable.</p><p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{unavailableReason}</p><p className="mt-2">Inspect its initial state or Gold DB diff, or choose another service.</p></EmptyDetail> : activeMode === "app" ? <ServiceAppView key={service} service={service} data={snapshot.data[service]} changes={changes} phase={phase} selectedRecord={selectedRecord} onSelectRecord={onSelectRecord} onInspectPath={(next) => { navigate(next); onModeChange("json"); }} /> : <>
        <nav aria-label="State path" className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-xs text-slate-600"><button type="button" onClick={() => navigate([])} className="break-all text-emerald-600">{service}</button>{path.map((key, index) => <span key={index} className="flex min-w-0 items-center gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 text-slate-400" /><button type="button" onClick={() => navigate(path.slice(0, index + 1))} className="break-all text-emerald-600">{key}</button></span>)}</nav>
        {activeMode !== "json" && isContainer(value) && <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search state keys and values" value={query} onChange={(event) => { setQuery(event.target.value); setTreeLimit(60); }} placeholder="Search keys and values at this level…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /></div>}
        {value === undefined ? <EmptyDetail>{!Object.hasOwn(snapshot.data, service) ? "This service is not present in the selected state. Switch back to compare or choose another service." : "This path is not present in this state. Use the path above to return to its parent."}</EmptyDetail>
          : activeMode === "json" || !isContainer(value) ? <CodePanel value={value} label={`State source · ${[service, ...path].join(" / ")}`} />
          : !entries.length ? <EmptyDetail>{query ? "No state entries match this search." : "This container is empty."}</EmptyDetail>
            : activeMode === "table" ? <StateTable key={`${service}/${JSON.stringify(path)}/${query}`} entries={entries} onOpen={(keys) => navigate([...path, ...keys])} />
              : <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-200 p-2">{entries.slice(0, treeLimit).map(([key, item]) => <TreeNode key={`${service}/${JSON.stringify(path)}/${key}`} name={key} value={item} />)}{entries.length > treeLimit && <button type="button" onClick={() => setTreeLimit((limit) => limit + 60)} className="p-2 text-xs text-emerald-600">Show more branches ({entries.length - treeLimit} remaining)</button>}</div>}
        {activeMode !== "json" && isContainer(value) && <p className="text-[11px] text-slate-400">{entries.length} of {children(value).length} entries</p>}
        </>}
      </div>
    </div>
  </div>;
}

export function TaskStates({ task }: { task: MultiverseTask }) {
  // The dialog is remounted when the release changes, so the release is fixed while these states are open.
  const release = useRelease();
  const [phase, setPhase] = useState<Phase | "changes">("initial");
  const [selectedService, setSelectedService] = useState(task.referenceDiff?.entries[0]?.path[0] ?? task.stateSnapshots?.initial.services[0] ?? "");
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>("app");
  const [snapshots, setSnapshots] = useState<Partial<Record<Phase, TaskStateSnapshot>>>({});
  const [errors, setErrors] = useState<Partial<Record<Phase, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const snapshot = phase === "changes" ? undefined : snapshots[phase];
  const summary = phase === "changes" ? undefined : snapshot ?? task.stateSnapshots?.[phase];
  const error = phase === "changes" ? undefined : errors[phase];
  function changePhase(next: Phase | "changes") {
    // Array indexes can refer to different records after insertion/reordering.
    // Keep dictionary selections, but require a fresh selection for arrays.
    if (next !== phase && snapshot && selectedRecord) {
      const data = snapshot.data[selectedService];
      const selected = getServiceView(selectedService, data)?.records.find((item) => item.id === selectedRecord);
      let node: unknown = data;
      for (const key of selected?.path ?? []) {
        if (Array.isArray(node)) { setSelectedRecord(null); break; }
        node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
      }
    }
    setPhase(next);
  }
  useEffect(() => {
    if (phase === "changes" || !summary?.available || snapshot) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchStaticJson<TaskStateSnapshot>(`${dataRoot(release)}states/${encodeURIComponent(task.id)}/${phase}.json.gz`, controller.signal);
        if (!controller.signal.aborted) setSnapshots((current) => ({ ...current, [phase]: data }));
      } catch (cause) {
        if (!controller.signal.aborted) setErrors((current) => ({ ...current, [phase]: cause instanceof Error ? cause.message : "The state request failed." }));
      }
    }
    void load();
    return () => controller.abort();
  }, [task.id, phase, attempt, summary?.available, snapshot]);
  return <div className="space-y-5">
    <div><h3 className="text-sm font-semibold text-slate-900">Service state explorer</h3></div>
    <div className="flex flex-wrap gap-2" aria-label="State views">{([
      ["initial", "Initial state"], ["final", "Gold final state"], ["changes", "Gold DB diff"],
    ] as const).map(([name, label]) => <button type="button" key={name} aria-pressed={phase === name} onClick={() => changePhase(name)} className={`rounded-lg border px-4 py-2 text-xs font-medium ${phase === name ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>
    {phase === "changes" ? <ReferenceState task={task} /> : <>
      {!summary?.available ? <EmptyDetail>{phase === "final" ? "No gold final-state data is available for this task. The recorded changes are still available in Gold DB diff." : "No initial-state view is available. Inspect the initialization code in Source & setup."}{summary?.reason && <p className="mt-2">{summary.reason}</p>}</EmptyDetail>
        : error && !snapshot ? <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="flex items-center gap-2 text-sm font-medium text-amber-900"><AlertCircle className="h-4 w-4" />Could not load state data</p><p className="text-xs text-amber-800">{error}</p><Button variant="outline" size="sm" onClick={() => { setErrors((current) => ({ ...current, [phase]: undefined })); setAttempt((value) => value + 1); }}>Retry loading state</Button></div>
          : !snapshot ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading state data…</div>
            : <StateContents snapshot={snapshot} phase={phase} selectedService={selectedService} onServiceChange={(service) => { setSelectedService(service); setSelectedRecord(null); }} mode={mode} onModeChange={setMode} changes={task.referenceDiff?.entries ?? []} selectedRecord={selectedRecord} onSelectRecord={setSelectedRecord} />}
    </>}
  </div>;
}
