/**
 * The run details of a leaderboard entry as the lines the page shows on
 * request: the settings a run was made under that can affect its result.
 *
 * The cases of an entry need not share the settings of the action model: some
 * can have been run again under other settings, for example with a larger
 * context window. A line then gives each value with its number of tasks.
 */
import type { ModelSettings, RunDetails } from '../types/platform';

export interface RunDetailLine { key: string; label: string; values: string[] }

/** How the page names the provider the requests of a run went to. Another provider is shown as recorded. */
const PROVIDER: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
};
const NOT_RECORDED = 'not recorded';

const tokens = (count: number): string => `${count.toLocaleString('en-US')} tokens`;
const tasksText = (count: number): string => `${count} ${count === 1 ? 'task' : 'tasks'}`;

/** The name the requests were sent under. */
const modelText = (settings: ModelSettings): string => settings.name ?? NOT_RECORDED;

/**
 * Who answered the requests: the API of a provider, the provider that
 * OpenRouter was pinned to, or the submitter's own vLLM server with its
 * version. A client library between the run and the provider is named too.
 */
function providerText(settings: ModelSettings): string {
  if (!settings.provider) return NOT_RECORDED;
  const parts = [
    settings.provider === 'vllm'
      ? `self-hosted with vLLM${settings.vllm_version ? ` ${settings.vllm_version}` : ''}`
      : PROVIDER[settings.provider] ?? settings.provider,
    settings.openrouter_provider_pin?.length ? `served by ${settings.openrouter_provider_pin.join(', ')}` : '',
    settings.transport === 'litellm' ? 'requests sent with LiteLLM' : '',
  ];
  return parts.filter(Boolean).join(', ');
}

/** The precision the model ran at: what a self-hosted server was started with, or the precisions an OpenRouter route was pinned to. */
function quantizationText(settings: ModelSettings): string {
  const parts = [settings.quantization, settings.openrouter_quantization_pin?.join(', '), settings.dtype ? `dtype ${settings.dtype}` : ''];
  return parts.filter(Boolean).join(', ') || NOT_RECORDED;
}

const filesText = (settings: ModelSettings): string =>
  (settings.repository ? `${settings.repository}${settings.revision ? ` at ${settings.revision.slice(0, 12)}` : ''}` : NOT_RECORDED);
const recorded = (value: string | undefined): string => value ?? NOT_RECORDED;
/** Whether any case of the run recorded the setting: a line for a setting no case recorded is left out. */
const anyRecorded = (details: RunDetails, has: (settings: ModelSettings) => unknown): boolean =>
  details.modelSettings.some(group => Boolean(has(group.settings)));

function windowText(settings: ModelSettings): string {
  if (settings.context_window == null) return NOT_RECORDED;
  return tokens(settings.context_window) + (settings.max_input_tokens != null ? ` (input limit ${tokens(settings.max_input_tokens)})` : '');
}

const outputText = (settings: ModelSettings): string =>
  (settings.max_tokens == null ? NOT_RECORDED : `${tokens(settings.max_tokens)} per model call`);

/** A model that takes no sampling parameters runs at its provider's default. */
function temperatureText(settings: ModelSettings): string {
  if (settings.supports_sampling === false) return 'provider default (no sampling parameters are sent)';
  const value = settings.default_temperature;
  if (value == null) return NOT_RECORDED;
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function reasoningText(settings: ModelSettings): string {
  if (settings.supports_thinking === false) return 'off';
  const parts = [
    settings.thinking_level ? `${settings.thinking_level.toLowerCase()} effort` : '',
    settings.thinking_budget_tokens != null ? `budget of ${tokens(settings.thinking_budget_tokens)}` : '',
    settings.thinking_contract === 'adaptive' ? 'adaptive' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : settings.supports_thinking ? 'on' : NOT_RECORDED;
}

/** One value where every case ran under the same setting; otherwise each value with its number of tasks. */
function spread(details: RunDetails, read: (settings: ModelSettings) => string): string[] {
  const texts = details.modelSettings.map(group => read(group.settings));
  if (new Set(texts).size <= 1) return texts.slice(0, 1);
  const tasks = new Map<string, number>();
  details.modelSettings.forEach((group, at) => tasks.set(texts[at], (tasks.get(texts[at]) ?? 0) + group.tasks));
  return [...tasks].map(([text, count]) => `${text} (${tasksText(count)})`);
}

/** The defaults of the leaderboard's baselines for the settings a run can change. */
export const DEFAULT_REQUEST_LIMIT_SECONDS = 240;
export const DEFAULT_INSTRUCTION_PLACEMENT = 'system';

/**
 * What a reader should know before comparing the entry with the others: tasks
 * that were run again after they had a scored result, and run settings that
 * are not the leaderboard's defaults. Empty for a run under the defaults.
 */
export function runWarnings(details: RunDetails): string[] {
  const warnings: string[] = [];
  const rerun = details.rerunTasks ?? 0;
  if (rerun > 0) warnings.push(`${tasksText(rerun)} ${rerun === 1 ? 'was' : 'were'} run again after a scored result; the newest result counts.`);
  if (details.instructionPlacement && details.instructionPlacement !== DEFAULT_INSTRUCTION_PLACEMENT) {
    warnings.push(`The developer instructions were placed in the ${details.instructionPlacement} message; the default is the ${DEFAULT_INSTRUCTION_PLACEMENT} message.`);
  }
  const limits = details.requestLimitsSeconds ?? [];
  if (limits.some(seconds => seconds !== DEFAULT_REQUEST_LIMIT_SECONDS)) {
    warnings.push(`The limit on one model request was ${limits.map(seconds => `${seconds} s`).join(' and ')}; the default is ${DEFAULT_REQUEST_LIMIT_SECONDS} s.`);
  }
  if (details.modelSettings.length > 1) warnings.push('The tasks did not all run under the same settings of the model.');
  return warnings;
}

export function runDetailLines(details: RunDetails): RunDetailLine[] {
  const lines: RunDetailLine[] = [
    { key: 'model', label: 'Model', values: spread(details, modelText) },
    { key: 'provider', label: 'Provider', values: spread(details, providerText) },
    { key: 'context', label: 'Context window', values: spread(details, windowText) },
    { key: 'output', label: 'Output limit', values: spread(details, outputText) },
    { key: 'temperature', label: 'Temperature', values: spread(details, temperatureText) },
    { key: 'reasoning', label: 'Reasoning', values: spread(details, reasoningText) },
  ];
  // Shown where a run recorded them: the precision of the model, and for a self-hosted model its files and parsers.
  if (anyRecorded(details, settings => settings.quantization || settings.dtype || settings.openrouter_quantization_pin?.length)) {
    lines.push({ key: 'quantization', label: 'Quantization', values: spread(details, quantizationText) });
  }
  if (anyRecorded(details, settings => settings.tool_call_parser)) {
    lines.push({ key: 'tool-parser', label: 'Tool-call parser', values: spread(details, settings => recorded(settings.tool_call_parser)) });
  }
  if (anyRecorded(details, settings => settings.reasoning_parser)) {
    lines.push({ key: 'reasoning-parser', label: 'Reasoning parser', values: spread(details, settings => recorded(settings.reasoning_parser)) });
  }
  if (anyRecorded(details, settings => settings.repository)) {
    lines.push({ key: 'files', label: 'Model files', values: spread(details, filesText) });
  }
  if (details.modelCallLimit != null) lines.push({ key: 'calls', label: 'Model calls', values: [`at most ${details.modelCallLimit} per task`] });
  if (details.requestLimitsSeconds?.length) {
    lines.push({ key: 'request', label: 'Limit on one model request', values: details.requestLimitsSeconds.map(seconds => `${seconds} s`) });
  }
  if (details.instructionPlacement) {
    lines.push({ key: 'instructions', label: 'Developer instructions', values: [`in the ${details.instructionPlacement} message`] });
  }
  if (details.rerunTasks != null && details.retriedTasks != null) {
    lines.push({
      key: 'attempts',
      label: 'Tasks run again',
      values: [`${details.rerunTasks} after a scored result`, `${details.retriedTasks} after an infrastructure failure`],
    });
  }
  if (details.completedOn) lines.push({ key: 'evaluated', label: 'Evaluated', values: [details.completedOn] });
  return lines;
}
