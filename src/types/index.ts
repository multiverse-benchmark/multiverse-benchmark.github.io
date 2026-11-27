/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type ExplorerTaskType = "ST" | "IF" | "MT" | "MTIF";

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
  id: string; // "none" or a harness type
  label: string;
  models: number; // ranked models using it; 0 = no results yet
}

export interface MultiverseModel {
  id?: number;
  rank: number;
  modelKey?: string; // shared by a model's runs on different harnesses
  name: string;
  provider: string;
  scaffold: string;
  harnessType?: string | null;
  isOpenWeights: boolean;
  successRate: number;
  avgSteps: number;
  submittedAt: string;
  // Used for filtering
  parameters: number; // in billions
  activeParameters?: number; // for MoE models
  isMoE: boolean;
  contextLength: number; // in thousands (e.g., 128 = 128K)
  samplesTotal?: number;
  samplesWithSteps?: number;
  samplesScored?: number;
  samplesSkipped?: number;
  samplesUnscored?: number;
  // Results per task setting; settings with no samples are absent.
  taskSettings?: Partial<Record<TaskSettingId, TaskSettingStats>>;
}

export interface TrajectoryStep {
  step: number;
  role: string;
  action: string;
  tool?: string;
  input?: Record<string, unknown> | string;
  output?: string;
  content?: string;
  reasoning?: string;
}

// Authored reference steps are separate from model-run trajectory records.
export interface ReferenceTrajectoryStep {
  step: number;
  role: string;
  action: string;
  tool?: string | null;
  input?: Record<string, unknown> | string | null;
  output?: unknown;
  content?: string | null;
  reasoning?: string | null;
  code?: string | null;
  codeOutput?: string | null;
  sourceRole?: string | number | null;
  sourceIndex?: number | null;
  rawStep?: Record<string, unknown> | null;
}

export interface GoldTrajectory {
  index: number;
  stepCount: number;
  toolCallCount: number;
  userTurnCount: number;
  recordedToolCallCount: string;
  finalResponse: string;
  source: "structured" | "none";
  steps: ReferenceTrajectoryStep[];
}

export interface ReferenceDiffEntry {
  path: string[];
  operation: "added" | "removed" | "changed";
  before: unknown;
  after: unknown;
  beforeMissing: boolean;
  afterMissing: boolean;
  raw: Record<string, unknown>;
}

export interface ReferenceDiff {
  raw: unknown;
  entries: ReferenceDiffEntry[];
  parseStatus: "absent" | "parsed" | "unparsed";
  provenance: "authored_reference";
  isExecutionResult: false;
}

export interface TaskStateSummary {
  available: boolean;
  provenance: "stored_initial_db" | "initialization_literals" | "derived_reference" | "unavailable";
  reason: string;
  services: string[];
  reconstruction?: {
    appliedChanges: number;
    beforeValueMismatches: string[][];
    createdPaths: string[][];
    warnings: string[];
  };
  unavailableServices?: Record<string, string>;
}

export interface TaskStateSnapshot extends TaskStateSummary {
  data: Record<string, unknown>;
}

export interface TaskRunCheck {
  name: string;
  label: string;
  result: boolean | null;
  verdict?: string;
  assertionErrors?: string;
  explanation?: string;
}

export interface TaskRunSummary {
  id: string;
  index: number;
  model: string;
  createdAt: string | null;
  withThinking: boolean | null;
  hasTrace: boolean;
  checks: TaskRunCheck[];
  provenance: "stored_evaluation";
}

export interface MultiverseTask {
  id: string;
  taskType: ExplorerTaskType;
  domain: string;
  title: string;
  prompt: string;
  tools: string[];
  complexity: number;
  goldSteps: number;
  userGoals: string[];
  desiredState: string;
  category: string;
  capabilities: string;
  trajectory?: TrajectoryStep[];
  sourceId?: string | null;
  promptPreview?: string | null;
  goldTrajectoryCount?: number;
  toolCallCount?: number | null;
  userTurnCount?: number | null;
  userSimulation?: Record<string, unknown> | null;
  taskProperties?: Record<string, unknown> | null;
  toolDetails?: Record<string, unknown>[] | null;
  instructions?: {
    developer: Record<string, unknown>;
  } | null;
  environmentSetup?: {
    initialization: Record<string, unknown>;
    codebaseDownloads: Record<string, unknown>[];
  } | null;
  verification?: {
    final: Record<string, unknown>;
  } | null;
  referenceDiff?: ReferenceDiff | null;
  goldTrajectories?: GoldTrajectory[] | null;
  rawTask?: Record<string, unknown> | null;
  stateSnapshots?: { initial: TaskStateSummary; final: TaskStateSummary };
  runs?: TaskRunSummary[];
  runCount?: number;
}

export interface LeaderboardFilters {
  search: string;
  category: "general" | "strict-api" | "open-weights";
  parameters: ParameterRange;
  contextLength: ContextLengthRange;
  taskSetting: TaskSettingFilter;
  harness: string[]; // selected harness ids ("none" or from availableHarnesses); empty = all
}
