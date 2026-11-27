/**
 * Copy of the overview figure under the title block: the benchmark in one
 * schematic, as a visual summary.
 *
 * The figure is the paper's Figure 1 without its worked example. Its
 * components, their labels, the arrows between them, and the verifiers are
 * the figure's own (OVERVIEW in ./paper.ts); the worked example is the "How it
 * works" section. Every number is read from the data of the release that is
 * shown. Nothing here states a model result, and nothing fixes the number of
 * models.
 *
 * What is written here, and where it comes from:
 *
 * - `caption`: the abstract's two sentences on what MultiVerse is, without
 *   the service and tool counts, which the figure shows.
 * - `harnessesNote` and the harness names: the abstract ("one bare harness (a
 *   simple loop) and four end-user harnesses") and the experimental setup.
 * - `agentNote`: the figure's note on the agent, without the harness of its
 *   example.
 */
import { OVERVIEW } from './paper';

export const OVERVIEW_FIGURE = {
  /** The section's name, for assistive technology; the figure has no visible heading. */
  title: 'Overview',
  caption: 'MultiVerse is a benchmark for cross-service delegation. Its tasks include behavioral instructions and multi-turn settings that test whether agents seek missing information from a reticent user simulator.',
  /** The link at the end of the caption, to the worked example. */
  walkthrough: 'Follow one task step by step',

  /** After the number of tasks of the release that is shown. */
  tasksUnit: 'validation tasks',

  agentNote: 'model × harness',
  model: 'model',
  harness: 'harness',
  /** The bare harness first, then the four end-user harnesses in the paper's order. */
  harnesses: [
    { name: 'Bare', kind: 'bare' },
    { name: 'Hermes', kind: 'end-user' },
    { name: 'OpenCode', kind: 'end-user' },
    { name: 'OpenHands', kind: 'end-user' },
    { name: 'OpenClaw', kind: 'end-user' },
  ],
  harnessesNote: 'one bare harness (a simple loop) and four end-user harnesses',

  /** How many of the services the figure draws, in two rows of five: the ones with the most tools. */
  servicesShown: 10,

  /** The verifiers by kind (`kind` of OVERVIEW.verifiers.items): deterministic code, or an LLM judge. */
  verifierKinds: [
    { kind: 'deterministic', label: 'Deterministic' },
    { kind: 'LLM', label: 'LLM judges' },
  ],

  /** The arrow into the verifiers: what the figure sends them from the agent and from the services. */
  toVerifiers: `${OVERVIEW.flows.agentToVerifiers}, ${OVERVIEW.flows.servicesToVerifiers}`,

  /** What each arrow connects, for readers who do not see the arrows. */
  flowContext: {
    taskToAgent: 'From the task to the agent',
    userToAgent: 'Between the user simulator and the agent',
    agentToServices: 'Between the agent and the simulated services',
    toVerifiers: 'From the agent and the simulated services to the verifiers',
  },
} as const;
