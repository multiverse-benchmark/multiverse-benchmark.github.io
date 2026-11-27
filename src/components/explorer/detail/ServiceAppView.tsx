import { useMemo, useState } from "react";
import { CalendarDays, ContactRound, FileText, Mail, MessageSquare, Search } from "lucide-react";
import type { ReferenceDiffEntry } from "@/types";
import { getServiceView, recordChange } from "./serviceStateModel";

interface Props {
  service: string;
  data: unknown;
  changes: ReferenceDiffEntry[];
  phase: "initial" | "final";
  selectedRecord: string | null;
  onSelectRecord: (id: string | null) => void;
  onInspectPath: (path: string[]) => void;
}

const icons = { calendar: CalendarDays, mail: Mail, messages: MessageSquare, contacts: ContactRound, files: FileText };
const badges = {
  added: "border-emerald-200 bg-emerald-50 text-emerald-800",
  removed: "border-rose-200 bg-rose-50 text-rose-800",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
};

export function ServiceAppView({ service, data, changes, phase, selectedRecord, onSelectRecord, onInspectPath }: Props) {
  const view = useMemo(() => getServiceView(service, data), [service, data]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const records = useMemo(() => view?.records.filter((item) =>
    [item.title, item.subtitle, item.body, ...item.fields.map((field) => field.value)].join("\n").toLowerCase().includes(query.trim().toLowerCase())) || [], [view, query]);
  if (!view) return <p className="p-5 text-sm text-slate-500">This service's data format does not have an app view. Use Table, Tree, or JSON to inspect every field.</p>;
  const Icon = icons[view.kind];
  const selected = view.records.find((item) => item.id === selectedRecord);
  const visibleSelection = selected && records.some((item) => item.id === selected.id) ? selected : null;
  const change = visibleSelection ? recordChange(service, visibleSelection.path, changes, phase) : null;

  return <section aria-label={`${view.label} state viewer`} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="grid min-w-0 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
        <div className="relative m-3"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label={`Search ${view.label.toLowerCase()} records`} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50); }} placeholder="Search records…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /></div>
        <p className="px-4 pb-2 text-[11px] text-slate-500">{records.length} of {view.records.length} records</p>
        <div className="max-h-72 overflow-auto xl:max-h-[500px]" aria-label={`${view.label} records`}>
          {records.slice(0, limit).map((item) => {
            const status = recordChange(service, item.path, changes, phase);
            return <button key={item.id} type="button" aria-pressed={visibleSelection?.id === item.id} onClick={() => onSelectRecord(item.id)} className={`block w-full border-t border-slate-100 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${visibleSelection?.id === item.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
              <span className="flex items-start justify-between gap-2"><span className="line-clamp-2 break-words text-xs font-medium leading-5 text-slate-800 [overflow-wrap:anywhere]">{item.title}</span>{status && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] capitalize ${badges[status]}`}>{status}</span>}</span>
              {item.subtitle && <span className="mt-1 block line-clamp-2 break-words text-[11px] leading-5 text-slate-500 [overflow-wrap:anywhere]">{item.subtitle}</span>}
              {view.kind === "mail" && item.body && <span className="mt-1 block truncate text-[11px] text-slate-400">{item.body}</span>}
            </button>;
          })}
          {!records.length && <p className="px-4 py-8 text-center text-xs text-slate-500">{query ? "No records match your search." : "No supported records to display. Use Table or JSON to inspect the stored data."}</p>}
          {records.length > limit && <button type="button" onClick={() => setLimit((current) => current + 50)} className="w-full border-t border-slate-200 bg-slate-50 p-3 text-xs font-medium text-emerald-600">Show 50 more ({records.length - limit} remaining)</button>}
        </div>
      </div>
      <div className="min-w-0 p-5">
        {visibleSelection ? <article className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{visibleSelection.title}</h4>{change && <span className={`rounded border px-2 py-1 text-[11px] capitalize ${badges[change]}`}>{change}</span>}</div>
          {visibleSelection.fields.length > 0 && <dl className="grid min-w-0 gap-y-2 text-xs sm:grid-cols-[90px_minmax(0,1fr)] sm:gap-x-3">{visibleSelection.fields.map((field) => <div key={field.label} className="contents"><dt className="font-medium text-slate-500">{field.label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{field.value}</dd></div>)}</dl>}
          {visibleSelection.body ? <div className={`max-h-[420px] overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 pt-4 text-sm leading-7 text-slate-700 [overflow-wrap:anywhere] ${view.kind === "messages" ? "rounded-lg bg-emerald-50/50 p-4" : ""}`}>{visibleSelection.body}</div> : <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">No plain-text content is available in this record.</p>}
          <button type="button" onClick={() => onInspectPath(visibleSelection.path)} className="text-xs font-medium text-emerald-600 underline decoration-emerald-200 underline-offset-4">Inspect record data</button>
        </article> : <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-slate-400"><Icon className="h-8 w-8" /><p className="max-w-xs text-xs leading-6">{selectedRecord && !selected ? "This record is not present in the selected state. Choose another record or switch back to compare." : "Select a record."}</p></div>}
      </div>
    </div>
    {view.kind === "calendar" && <p className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-[11px] leading-5 text-slate-500">UTC database times are converted using their stored local offsets; recurring occurrences are not expanded.</p>}
  </section>;
}
