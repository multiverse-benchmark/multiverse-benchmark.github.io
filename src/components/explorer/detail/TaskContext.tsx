import { Target, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MultiverseTask } from "@/types";
import { DetailSection, EmptyDetail, TextPanel } from "./DetailPrimitives";
import { asRecord, formatValue, hasValue } from "./utils";

function Narrative({ title, value, description }: { title: string; value: unknown; description?: string }) {
  if (!hasValue(value)) return null;
  return <DetailSection title={title} description={description}><TextPanel>{formatValue(value)}</TextPanel></DetailSection>;
}

export function TaskContext({ task }: { task: MultiverseTask }) {
  const properties = task.taskProperties ?? {};
  const simulation = task.userSimulation ?? {};
  const capabilities = Array.isArray(properties.target_capabilities) ? properties.target_capabilities : [];
  const hasContext = ["task_motivation", "user_narrative", "backstory", "scenario_type", "scenario_name"].some((key) => hasValue(properties[key]));
  const hasGlobalContext = hasValue(simulation.global_context_variables);

  return <div className={`grid gap-7 ${hasGlobalContext ? "xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]" : ""}`}>
    <div className="min-w-0 space-y-7">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><UserRound className="h-4 w-4 text-emerald-600" />Task context</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">Background and design notes supplied by the task author. This is not necessarily information shown to the agent.</p>
      </div>
      {!hasContext && <EmptyDetail>No narrative or scenario description is included in this task.</EmptyDetail>}
      {(hasValue(properties.scenario_type) || hasValue(properties.scenario_name)) && <DetailSection title="Scenario">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {hasValue(properties.scenario_type) && <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-xs font-normal">{formatValue(properties.scenario_type)}</Badge>}
          {hasValue(properties.scenario_name) && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{formatValue(properties.scenario_name)}</p>}
        </div>
      </DetailSection>}
      <Narrative title="Why this task is challenging" value={properties.task_motivation} />
      <Narrative title="User narrative" description="Authoring context used to construct the initial environment; not an agent message." value={properties.user_narrative} />
      <Narrative title="Backstory" value={properties.backstory} />
      {capabilities.length > 0 && <DetailSection title="Target capabilities" description="Capabilities recorded by the author.">
        <div className="space-y-3">{capabilities.map((value, index) => {
          const capability = asRecord(value);
          return <article key={index} className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="flex items-start gap-2 text-sm font-medium text-slate-800"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{formatValue(capability.name ?? capability.id ?? value)}</h4>
            {[capability.l1_category, capability.l2_category].some(hasValue) && <p className="mt-2 text-xs leading-relaxed text-slate-500">{[capability.l1_category, capability.l2_category].filter(hasValue).map(formatValue).join(" / ")}</p>}
            {hasValue(capability.description) && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{formatValue(capability.description)}</p>}
          </article>;
        })}</div>
      </DetailSection>}
      <Narrative title="Why these capabilities are needed" value={properties.target_capabilities_explanation} />
    </div>
    {hasGlobalContext && <div className="min-w-0 space-y-7">
      <Narrative title="Global context" value={simulation.global_context_variables} />
    </div>}
  </div>;
}
