/**
 * Text of the run views: the verifiers, how a run can end, and the labels
 * around them.
 *
 * The verifier names and their descriptions are the paper's (its Verifiers
 * subsection; the same sentences as TOUR_VERIFIERS in content/paper.ts,
 * without the worked example they refer to there).
 */
import type { VerifierId } from '@/lib/runs';

export interface VerifierCopy {
  name: string;
  /** Column heading where the full name does not fit. */
  short: string;
  kind: 'Deterministic code' | 'LLM judge';
  text: string;
}

export const VERIFIER_COPY: Record<VerifierId, VerifierCopy> = {
  assertion: {
    name: 'Assertion code',
    short: 'Assertion',
    kind: 'Deterministic code',
    text: 'Deterministic code checks required properties of the final service state.',
  },
  dbdiff: {
    name: 'DB-diff verifier',
    short: 'DB diff',
    kind: 'LLM judge',
    text: 'An LLM judge compares the agent’s database changes with those made by the gold solution, using applicable final-state rubrics and allowing valid alternatives.',
  },
  response: {
    name: 'Final-response verifier',
    short: 'Response',
    kind: 'LLM judge',
    text: 'An LLM judge compares the agent’s final message to the user with an annotator-written reference response, using applicable response rubrics.',
  },
  instruction: {
    name: 'Instruction verifier',
    short: 'Instruction',
    kind: 'LLM judge',
    text: 'An LLM judge checks compliance with the developer/user instructions against one or more rubrics per instruction, using the trajectory, database state, and/or response.',
  },
};

/** How a run ended when it did not complete. Such a run is still scored by the verifiers. */
export const TERMINATION_COPY: Record<string, { label: string; text: string }> = {
  context_window: { label: 'Context window exceeded', text: 'The run ended when the conversation exceeded the model’s context window.' },
  malformed: { label: 'Malformed model output', text: 'The run ended on a model output that could not be used.' },
  output_limit: { label: 'Output limit', text: 'The run ended when a response reached the provider’s output-length limit.' },
  policy_block: { label: 'Safety or policy refusal', text: 'The run ended on a safety or policy refusal.' },
};

export const RUNS_COPY = {
  /** The tab of the task explorer, next to the tab of the gold trajectory. */
  tab: 'Trajectories',
  rule: 'A run succeeds only if it passes every applicable verifier. The verdict of an LLM judge is the majority of its three votes.',
  notApplicable: 'Not applicable',
  /**
   * The result explorer of the deep dive: every validation task against every model on the leaderboard.
   * Its lead is one sentence around a link to the validation leaderboard on the main page.
   */
  grid: {
    lead: { before: 'Explore the results and trajectories of the models on the', link: 'validation set leaderboard', after: '.' },
  },
  /** Under the validation leaderboard on the main page: one sentence that ends in a link to the result explorer. */
  fromLeaderboard: { before: 'Explore the results and trajectories of these models on each validation task in the', after: '.' },
} as const;
