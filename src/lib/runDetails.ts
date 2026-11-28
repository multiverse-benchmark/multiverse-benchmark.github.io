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

/** How the page names the route of a model's requests. Another provider is shown as recorded. */
const PROVIDER: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  vllm: 'a self-hosted vLLM server',
};
const NOT_RECORDED = 'not recorded';

const tokens = (count: number): string => `${count.toLocaleString('en-US')} tokens`;
const tasksText = (count: number): string => `${count} ${count === 1 ? 'task' : 'tasks'}`;

function modelText(settings: ModelSettings): string {
  const route = settings.provider ? PROVIDER[settings.provider] ?? settings.provider : '';
  const servedBy = settings.openrouter_provider_pin?.length ? `, served by ${settings.openrouter_provider_pin.join(', ')}` : '';
  const precision = settings.openrouter_quantization_pin?.length ? `, precision ${settings.openrouter_quantization_pin.join(', ')}` : '';
  return `${settings.name ?? NOT_RECORDED}${route ? ` through ${route}` : ''}${servedBy}${precision}`;
}

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

export function runDetailLines(details: RunDetails): RunDetailLine[] {
  const lines: RunDetailLine[] = [
    { key: 'model', label: 'Model', values: spread(details, modelText) },
    { key: 'context', label: 'Context window', values: spread(details, windowText) },
    { key: 'output', label: 'Output limit', values: spread(details, outputText) },
    { key: 'temperature', label: 'Temperature', values: spread(details, temperatureText) },
    { key: 'reasoning', label: 'Reasoning', values: spread(details, reasoningText) },
  ];
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
