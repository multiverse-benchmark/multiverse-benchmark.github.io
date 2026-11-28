/**
 * The data of the leaderboard, in the shape its components draw
 * (src/components/leaderboard). The data comes from the result files that
 * ship with the site (src/lib/resultsBoard.ts). A run has optional fields
 * that those files leave empty (parameters, context length, steps).
 */

export type ParameterRange = "any" | "small" | "medium" | "large" | "xlarge";
export type ContextLengthRange = "any" | "4k" | "8k" | "32k" | "128k+";

/** How a benchmark task is posed. Mutually exclusive. */
export type TaskSettingId =
  | "single-turn"
  | "multi-turn"
  | "instruction-following"
  | "multi-turn-instruction-following";
export type TaskSettingFilter = "all" | TaskSettingId;

export interface TaskSettingStats {
  samples: number; // scored samples
  passed: number;
  failed: number;
  skipped: number; // infrastructure skips, excluded from the success rate
  unscored: number;
  successRate: number; // 0-1
  avgSteps: number;
  /** The rate as its source prints it (one decimal), where the source prints one. */
  rateText?: string;
  /** Standard deviation across runs as its source prints it, for a mean of several runs. */
  sdText?: string | null;
  /** Absolute 95% task-bootstrap confidence limits, in percent (0-100). */
  ci95?: [number, number];
}

export interface TaskSettingOption {
  id: TaskSettingId;
  code: string; // ST, MT, IF or MTIF
  label: string;
  description: string;
  models: number; // ranked models with scored samples; 0 = no results yet
  samples: number;
}

export interface HarnessOption {
  id: string; // "none" (the bare harness) or a harness type
  label: string;
  models: number; // ranked models using it; 0 = no results yet
}

/** One run: a model under one harness on one result set. */
/** The settings of an action model, under the names the result files use (action_model_behavior). */
export interface ModelSettings {
  name?: string;
  provider?: string;
  transport?: string;
  context_window?: number;
  max_input_tokens?: number;
  max_tokens?: number;
  supports_sampling?: boolean;
  default_temperature?: number;
  supports_thinking?: boolean;
  thinking_level?: string;
  thinking_contract?: string;
  thinking_budget_tokens?: number;
  whole_toolset_discovery?: boolean;
  openrouter_provider_pin?: string[];
  openrouter_quantization_pin?: string[];
  vllm_profile?: string;
  /** How a self-hosted model was served, where the invocation recorded it. */
  repository?: string;
  revision?: string;
  quantization?: string;
  dtype?: string;
  tool_call_parser?: string;
  reasoning_parser?: string;
  vllm_version?: string;
}

/** The settings an entry was run under that can affect its result (scripts/build_board.py). */
export interface RunDetails {
  tasks: number;
  /** Each settings record of the action model with its number of tasks, the most frequent first. */
  modelSettings: { tasks: number; settings: ModelSettings }[];
  /** The message that carried the developer instructions. */
  instructionPlacement?: "system" | "user";
  modelCallLimit?: number;
  /** The limits on one model request that the cases ran under, in seconds. */
  requestLimitsSeconds?: number[];
  /** A submitted entry: the day its last case was scored, and how many tasks were run again. */
  completedOn?: string;
  rerunTasks?: number;
  retriedTasks?: number;
}

export interface MultiverseModel {
  id?: number;
  rank: number;
  modelKey?: string; // shared by a model's runs on different harnesses
  name: string;
  provider: string;
  /** A page about the model, which its name links to. */
  modelUrl?: string;
  scaffold: string;
  harnessType?: string | null;
  isOpenWeights: boolean;
  /** The overall number, "Average": the equal-weight mean of the task settings. */
  successRate: number;
  /** The average as its source prints it (one decimal), where the source prints one. */
  rateText?: string;
  /** Standard deviation of the average across runs as its source prints it. */
  sdText?: string | null;
  /** Absolute 95% task-bootstrap confidence limits for the average, in percent (0-100). */
  ci95?: [number, number];
  avgSteps: number;
  submittedAt: string;
  parameters: number; // in billions; 0 = unknown
  activeParameters?: number; // for MoE models
  isMoE: boolean;
  contextLength: number; // in thousands (e.g., 128 = 128K); 0 = unknown
  samplesTotal?: number;
  samplesWithSteps?: number;
  samplesScored?: number;
  samplesSkipped?: number;
  samplesUnscored?: number;
  taskSettings?: Partial<Record<TaskSettingId, TaskSettingStats>>;
  /** Who ran the evaluation of the entry, where the result set names it. */
  submitter?: string;
  /** The settings the entry was run under, where the result set records them. */
  runDetails?: RunDetails;
  /** Present on a submitted entry: who submitted it, and where its trajectories are. */
  submission?: {
    id: string;
    submitter: string;
    submitterUrl?: string;
    submittedOn: string;
    trajectories: string;
    scoreFile: string;
    rerunTasks: number;
  };
}

export interface LeaderboardFilters {
  search: string;
  category: "general" | "strict-api" | "open-weights";
  parameters: ParameterRange;
  contextLength: ContextLengthRange;
  taskSetting: TaskSettingFilter;
  harness: string[]; // selected harness ids; empty = all
}
