import { Database, Target, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MultiverseTask } from "@/types";
import { CodePanel, DetailSection, EmptyDetail, TextPanel } from "./DetailPrimitives";
import { asRecord, formatValue, hasValue, humanize } from "./utils";

function HiddenInformation({ value }: { value: unknown }) {
  const entries = Object.entries(asRecord(value)).filter(([, item]) => hasValue(item));
  return <dl className="grid gap-3 sm:grid-cols-2">{entries.map(([key, item]) => <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-3">
    <dt className="mb-1 break-words text-xs text-slate-500">{humanize(key)}</dt>
    <dd className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{formatValue(item)}</dd>
  </div>)}</dl>;
}

export function TaskOverview({ task }: { task: MultiverseTask }) {
  const simulation = task.userSimulation ?? {};
  const goals = Array.isArray(simulation.user_goals) ? simulation.user_goals : task.userGoals.map((goal) => ({ goal }));
  const trajectoryCount = task.goldTrajectories?.length ?? task.goldTrajectoryCount ?? 0;
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
    <div className="min-w-0 space-y-7">
      <DetailSection title="User query">
        {task.prompt ? <TextPanel>{task.prompt}</TextPanel> : <EmptyDetail>No initial query is provided.</EmptyDetail>}
      </DetailSection>
      {goals.length > 0 && <DetailSection title="User goals" description="The intended outcome and information that may need to be elicited from the user.">
        <div className="space-y-3">{goals.map((value, index) => {
          const goal = asRecord(value);
          return <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-600">{index + 1}</span>
              <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{formatValue(goal.goal ?? value)}</p>
            </div>
            {hasValue(goal.hidden_information) && <div className="mt-4 border-t border-slate-100 pt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Target className="h-3 w-3" />Hidden information</p><HiddenInformation value={goal.hidden_information} /></div>}
          </div>;
        })}</div>
      </DetailSection>}
      {task.desiredState && <DetailSection title="Expected outcome"><TextPanel>{task.desiredState}</TextPanel></DetailSection>}
    </div>
    <aside className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-700"><Database className="h-3.5 w-3.5 text-slate-400" />Task at a glance</h3>
        <dl className="space-y-4 text-xs">
          <div><dt className="text-slate-400">Task ID</dt><dd className="mt-1 break-all font-mono text-slate-700">{task.sourceId || task.id}</dd></div>
          {task.taskType && <div className="flex justify-between"><dt className="text-slate-500">Task type</dt><dd className="font-semibold text-slate-700">{task.taskType}</dd></div>}
          {trajectoryCount > 1 && <div className="flex justify-between"><dt className="text-slate-500">Gold trajectories</dt><dd className="font-semibold text-slate-700">{trajectoryCount}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-500">Gold trajectory steps</dt><dd className="font-semibold text-slate-700">{task.goldSteps}</dd></div>
        </dl>
      </div>
      {task.tools.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold text-slate-700">Required services</h3>
        <div className="flex flex-wrap gap-1.5">{task.tools.map((tool, index) => <Badge key={`${tool}-${index}`} variant="outline" className="max-w-full break-all bg-slate-50 text-[11px] font-normal text-slate-600"><Wrench className="mr-1 h-3 w-3 shrink-0" />{tool}</Badge>)}</div>
      </div>}
    </aside>
  </div>;
}

function Rubrics({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return <ol className="space-y-3">{value.filter((item) => hasValue(asRecord(item).rubric ?? item)).map((item, index) => <li key={index} className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-2 flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-slate-400">Rubric {index + 1}</p>
      {asRecord(item).applicable === false && <Badge variant="outline" className="text-[10px] font-normal">Not applicable</Badge>}
      {asRecord(item).conditional === true && <Badge variant="outline" className="text-[10px] font-normal">Conditional</Badge>}
    </div>
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{formatValue(asRecord(item).rubric ?? item)}</p>
  </li>)}</ol>;
}

function InstructionItems({ value, showRubrics = false }: { value: unknown; showRubrics?: boolean }) {
  if (!Array.isArray(value)) return null;
  return <div className="space-y-3">{value.map((value, index) => {
    const item = asRecord(value);
    const instruction = item.instruction ?? item.instruction_text;
    if (!hasValue(instruction) && !(showRubrics && hasValue(item.rubrics))) return null;
    return <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-slate-500">Instruction {index + 1}</p>
        {item.applicable === false && <Badge variant="outline" className="text-[10px] font-normal">Not applicable</Badge>}
      </div>
      {hasValue(instruction) && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{formatValue(instruction)}</p>}
      {showRubrics && <Rubrics value={item.rubrics} />}
    </div>;
  })}</div>;
}

export function TaskInstructions({ task }: { task: MultiverseTask }) {
  const instructions = task.instructions;
  const developer = instructions?.developer ?? {};
  const chunks = Array.isArray(developer.developer_instruction_chunks) ? developer.developer_instruction_chunks : [];
  const hasInstructions = hasValue(developer.instruction_text) || chunks.length > 0;
  if (!hasInstructions) return <EmptyDetail>No developer/user instructions are included in this task.</EmptyDetail>;
  return <div className="space-y-7">
    <DetailSection title="Developer/user instructions">
      {hasValue(developer.instruction_text) && <TextPanel>{formatValue(developer.instruction_text)}</TextPanel>}
      <InstructionItems value={chunks} />
    </DetailSection>
  </div>;
}

function CompletionRubrics({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return null;
  // These are non-IF rubrics. Instruction rubrics live on each instruction below.
  const groups = [
    { verifier: "DB", title: "Final-state rubrics" },
    { verifier: "FINAL_RESPONSE", title: "Response rubrics" },
    { verifier: "TRACE", title: "Trajectory rubrics" },
    { verifier: "OTHER", title: "Task-completion rubrics" },
  ];
  return <>{groups.map(({ verifier, title }) => {
    const rubrics = value.filter((item) => {
      const kind = asRecord(item).rubric_verifier;
      return verifier === "OTHER" ? !["DB", "FINAL_RESPONSE", "TRACE"].includes(String(kind)) : kind === verifier;
    });
    return rubrics.length > 0 ? <DetailSection key={verifier} title={title}><Rubrics value={rubrics} /></DetailSection> : null;
  })}</>;
}

export function TaskEvaluation({ task }: { task: MultiverseTask }) {
  const value = task.verification?.final ?? {};
  // The instruction rubrics are stored with the instructions they check.
  const instructions = asRecord(task.instructions?.developer).developer_instruction_chunks;
  const answer = [value.reference_response_content, value.reference_response, value.reference_answer].find(hasValue);
  const hasEvaluation = [value.assertion_code, value.rubrics, instructions, answer, value.final_answer_rubrics_text, value.gold_db_diff].some(hasValue);
  if (!hasEvaluation) return <EmptyDetail>No evaluation specification is included in this task.</EmptyDetail>;
  return <div className="space-y-7">
    {hasValue(value.assertion_code) && <DetailSection title="Assertion code" description="Checks the final service database states."><CodePanel value={value.assertion_code} label="Assertion code · read only" /></DetailSection>}
    <CompletionRubrics value={value.rubrics} />
    {hasValue(instructions) && <DetailSection title="Instruction rubrics" description="Checks for compliance with developer/user instructions; these rubrics are visible only to the instruction verifier, not to the agent."><InstructionItems value={instructions} showRubrics /></DetailSection>}
    {hasValue(answer) && <DetailSection title="Gold final response" description="The answer used by the final-response verifier."><TextPanel>{formatValue(answer)}</TextPanel></DetailSection>}
    {hasValue(value.final_answer_rubrics_text) && <DetailSection title="Response rubrics"><TextPanel>{formatValue(value.final_answer_rubrics_text)}</TextPanel></DetailSection>}
  </div>;
}

export function TaskSource({ task }: { task: MultiverseTask }) {
  const initialization = asRecord(task.environmentSetup?.initialization);
  const setupCode = [
    ["setup_code", "Environment initialization"],
    ["install_dependencies_and_clone_repos_code", "Dependency setup"],
  ];
  // Services are listed in Overview; show only additional tool configuration here.
  const configuredTools = (task.toolDetails ?? []).filter((tool) => [tool.file_path, tool.function_name, tool.allowed_functions, tool.excluded_functions].some(hasValue));
  return <div className="space-y-7">
    {setupCode.filter(([key]) => hasValue(initialization[key])).map(([key, label]) => <DetailSection key={key} title={label}><CodePanel value={initialization[key]} label={`${label} · read only`} /></DetailSection>)}
    {!setupCode.some(([key]) => hasValue(initialization[key])) && <EmptyDetail>No initialization code is supplied.</EmptyDetail>}
    {hasValue(initialization.initial_time_utc) && <DetailSection title="Initial time"><TextPanel>{formatValue(initialization.initial_time_utc)}</TextPanel></DetailSection>}
    {configuredTools.length > 0 && <DetailSection title="Tool configuration"><div className="space-y-3">{configuredTools.map((tool, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      {hasValue(tool.connector) && <p className="text-sm font-medium text-slate-700">{formatValue(tool.connector).toLowerCase()}</p>}
      {[["file_path", "Tool file"], ["function_name", "Function"], ["allowed_functions", "Available functions"], ["excluded_functions", "Excluded functions"]].filter(([key]) => hasValue(tool[key])).map(([key, label]) => <div key={key}><p className="mb-1 text-xs text-slate-500">{label}</p><TextPanel>{formatValue(tool[key])}</TextPanel></div>)}
    </div>)}</div></DetailSection>}
  </div>;
}
