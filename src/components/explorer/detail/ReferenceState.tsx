import { useMemo, useState } from "react";
import { Database, Search } from "lucide-react";
import type { MultiverseTask, ReferenceDiffEntry } from "@/types";
import { CodePanel, EmptyDetail } from "./DetailPrimitives";
import { formatValue } from "./utils";

const operationStyle = {
  added: "border-emerald-200 bg-emerald-50 text-emerald-700",
  removed: "border-rose-200 bg-rose-50 text-rose-700",
  changed: "border-amber-200 bg-amber-50 text-amber-700",
};

function ReferenceEntry({ entry, index }: { entry: ReferenceDiffEntry; index: number }) {
  const path = entry.path.length ? entry.path.join(" / ") : "Root";
  return <article aria-label={`Gold DB change ${index + 1}: ${path}`} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start gap-3">
      <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold capitalize ${operationStyle[entry.operation]}`}>{entry.operation}</span>
      <h4 className="min-w-0 flex-1 break-words pt-1 font-mono text-xs leading-5 text-slate-700 [overflow-wrap:anywhere]">{path}</h4>
      <span className="pt-1 text-[11px] text-slate-400">#{index + 1}</span>
    </div>
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <CodePanel value={entry.before} missing={entry.beforeMissing} label="Before · gold DB diff" />
      <CodePanel value={entry.after} missing={entry.afterMissing} label="After · gold DB diff" />
    </div>
  </article>;
}

export function ReferenceState({ task }: { task: MultiverseTask }) {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState("all");
  const diff = task.referenceDiff;
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (diff?.entries ?? []).map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (operation !== "all" && entry.operation !== operation) return false;
        const text = [entry.path.join(" / "), entry.operation,
          entry.beforeMissing ? "missing" : formatValue(entry.before),
          entry.afterMissing ? "missing" : formatValue(entry.after)].join("\n");
        return text.toLowerCase().includes(search);
      });
  }, [diff, query, operation]);

  return <div className="space-y-5">
    <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
      <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Gold DB diff</h3>
      </div>
    </div>

    {!diff || diff.parseStatus === "absent" ? <EmptyDetail>No gold DB diff is included in this task. Its evaluation criteria may describe the expected outcome.</EmptyDetail>
      : diff.parseStatus === "unparsed" ? <div className="space-y-3">
        <EmptyDetail>The gold DB diff could not be displayed as structured changes. Its complete text is available below.</EmptyDetail>
        <CodePanel value={diff.raw} label="Gold DB diff · original text" />
      </div>
        : <div className="space-y-4">
          {diff.entries.length ? <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input aria-label="Search gold DB diff paths and values" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paths and values…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </div>
              <select aria-label="Filter gold DB change type" value={operation} onChange={(event) => setOperation(event.target.value)} className="h-9 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 focus:border-emerald-400">
                <option value="all">All change types</option>
                <option value="added">Added</option>
                <option value="changed">Changed</option>
                <option value="removed">Removed</option>
              </select>
              <span aria-live="polite" className="text-xs tabular-nums text-slate-500">{filtered.length} / {diff.entries.length} changes</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">“Not present at this path” marks a missing value. A stored null is displayed as <code className="font-mono text-slate-700">null</code>.</p>
            {filtered.length ? <div className="space-y-4">{filtered.map(({ entry, index }) => <ReferenceEntry key={index} entry={entry} index={index} />)}</div>
              : <EmptyDetail>No gold DB changes match these filters.</EmptyDetail>}
          </> : <EmptyDetail>The gold DB diff contains zero entries.</EmptyDetail>}
        </div>}
  </div>;
}
