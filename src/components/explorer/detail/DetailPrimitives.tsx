import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, FileText } from "lucide-react";
import { asRecord, formatValue, humanize } from "./utils";

export function EmptyDetail({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-500">
    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
    <div>{children}</div>
  </div>;
}

export function DetailSection({ title, description, children, action }: {
  title: string; description?: string; children: ReactNode; action?: ReactNode;
}) {
  return <section className="min-w-0 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

export function TextPanel({ children }: { children: ReactNode }) {
  return <div className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{children}</div>;
}

export function CodePanel({ value, label = "Source", missing = false }: {
  value: unknown; label?: string; missing?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const text = missing ? "Not present at this path" : formatValue(value);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }
  // A code panel is dark in both themes, so it takes the code tokens and not the neutral scale.
  return <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--mv-code-border)] bg-[var(--mv-code-bg)]">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--mv-code-border)] bg-[var(--mv-code-panel)] px-4 py-2">
      <span className="text-[11px] font-medium tracking-wide text-[var(--mv-code-muted)]">{label}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-[var(--mv-code-muted)] hover:text-[var(--mv-code-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mv-code-ink)]">
        {copyStatus === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        <span aria-live="polite">{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Select text to copy" : "Copy"}</span>
      </button>
    </div>
    <pre tabIndex={0} aria-label={label} className={`max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mv-code-ink)] ${missing ? "italic text-[var(--mv-code-muted)]" : "text-[var(--mv-code-ink)]"}`}>{text}</pre>
  </div>;
}

export function RawDisclosure({ value, label = "View source fields", open = false }: {
  value: unknown; label?: string; open?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="group min-w-0 rounded-xl border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />{label}
    </summary>
    {expanded && <div className="px-3 pb-3"><CodePanel value={value} label={label} /></div>}
  </details>;
}

export function FieldList({ value, omit = [] }: { value: unknown; omit?: string[] }) {
  const fields = Object.entries(asRecord(value)).filter(([key]) => !omit.includes(key));
  if (!fields.length) return null;
  return <div className="space-y-3">{fields.map(([key, item]) => {
    const label = humanize(key);
    if (typeof item === "string") {
      return <div key={key} className="space-y-1.5">
        <h4 className="text-xs font-medium text-slate-500">{label}</h4>
        {/(?:^|_)code(?:$|_)/.test(key)
          ? <CodePanel value={item} label={label} />
          : <TextPanel>{item || <span className="italic text-slate-400">Empty string</span>}</TextPanel>}
      </div>;
    }
    if (item !== null && typeof item === "object") {
      return <RawDisclosure key={key} value={item} label={`${label}${Array.isArray(item) ? ` (${item.length})` : ""}`} />;
    }
    return <div key={key} className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span><span className="font-mono text-slate-700">{formatValue(item)}</span>
    </div>;
  })}</div>;
}
