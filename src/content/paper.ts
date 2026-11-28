/**
 * Copy taken from the MultiVerse paper. Every sentence and number in this
 * file is traceable to the paper: the place it comes from is named in the
 * comment above each block. Keep the wording close to the paper, and change a
 * number here only when the paper changes.
 *
 * Service names are those of the released benchmark and the desktop GUI.
 */
import { LATEST_RELEASE, PAPER_RELEASE, type Release, type ResultSet } from '../lib/release';

// Title page.
export const PAPER = {
  title: 'MultiVerse: A Trustworthy Tool-Use Benchmark for Real-World Task Delegation under Harnesses',
  expansion: 'MULTI-serVice Evaluation of Real-world Steering and Elicitation',
  summary: 'MultiVerse is a benchmark for cross-service delegation. It simulates 35 real-world services with 809 tools in a self-contained sandbox, and its tasks include behavioral instructions and multi-turn settings that test whether agents seek missing information from a reticent user simulator. Nine proprietary and three open-weight models are compared on the same tasks under one bare harness and four end-user harnesses.',
} as const;

/** The address for questions about the benchmark and for leaderboard submissions: under the authors' notes in the title block and in the leaderboard's contact message. */
export const CONTACT_EMAIL = 'multiverse.benchmark@gmail.com';

// ---------------------------------------------------------------------------
// Tools and environment. Source: the Tools subsection, the introduction's
// sentence on the sandbox, the overview figure's note on the services, and the
// footnote on service names. scripts/export_services.py checks the services
// data shown with this text against the same two numbers (35 and 809).
// ---------------------------------------------------------------------------
export const ENVIRONMENT = {
  /** The paper's sentence, with the tool count of the release that is shown (809 in the paper, for v1.0.0). */
  lead: (tools: number) => `MultiVerse simulates 35 widely used real-world services that together expose ${tools} tools, the individual functions an agent calls. The services are implemented from API or implementation documentation. Each task runs in a self-contained sandbox with the same initial state across different runs.`,
  sandboxLabel: 'Self-contained sandbox',
  sandboxNote: 'Every call reads or mutates the task’s own database, initialized per task.',
  /** Release-specific evidence: the paper for v1.0.0, src/data/coverage.json for v1.1.0. */
  notes: [
    { text: 'The implementations are validated with about 33K unit tests, all passing, covering 88% of executable statements (79–98% per service).', release: PAPER_RELEASE },
    { text: 'The unit tests cover 89% of executable statements (81–98% per service).', release: LATEST_RELEASE },
  ] as { text: string; release?: Release }[],
} as const;

// ---------------------------------------------------------------------------
// The four task settings and the two respects in which they differ. Source:
// the Tasks subsection ("100 Single-Turn (ST) tasks that test single-turn
// search, synthesis, and correct action; 97 Instruction Following (IF) tasks
// with additional developer/user instructions that require departing from
// default behavior; 100 Multi-Turn (MT) tasks designed to test whether agents
// obtain missing information from a reticent user; and 99 MTIF tasks that
// combine both"). The task counts are read from the dataset, not typed here.
// ---------------------------------------------------------------------------
export const TASK_SETTING_FACTORS = [
  { id: 'instructions', label: 'Additional developer/user instructions' },
  { id: 'missingInformation', label: 'Missing information held by the user' },
] as const;

export const TASK_SETTINGS = [
  { id: 'ST', name: 'Single-turn', instructions: false, missingInformation: false, tests: 'Single-turn search, synthesis, and correct action.' },
  { id: 'IF', name: 'Instruction following', instructions: true, missingInformation: false, tests: 'Adherence to additional developer/user instructions that require departing from default behavior.' },
  { id: 'MT', name: 'Multi-turn', instructions: false, missingInformation: true, tests: 'Whether agents obtain missing information from a reticent user.' },
  { id: 'MTIF', name: 'Multi-turn + instruction following', instructions: true, missingInformation: true, tests: 'Both: obtaining missing information from a reticent user while following additional developer/user instructions.' },
] as const;

// ---------------------------------------------------------------------------
// Design dimensions. Titles and short texts: Figure 2. Definitions: the
// appendix "Full definitions of the design dimensions". `inMultiVerse`: the
// benchmark sections (tools, tasks, user simulator, verifiers, harnesses and
// evaluation protocol, reproducibility statement).
// ---------------------------------------------------------------------------
export type PrincipleGroupId = 'realism' | 'trustworthy';
export interface Principle {
  number: number;
  title: string;
  short: string;
  definition: string;
  inMultiVerse: string;
}
export interface PrincipleGroup {
  id: PrincipleGroupId;
  title: string;
  tagline: string;
  principles: Principle[];
}

export const PRINCIPLES_INTRO = 'A benchmark must pose the real problem and measure it correctly. The following eleven dimensions organize these needs around realism and trustworthy evaluation.';

export const PRINCIPLE_GROUPS: PrincipleGroup[] = [
  {
    id: 'realism',
    title: 'Realism',
    tagline: 'Pose the real problem',
    principles: [
      {
        number: 1,
        title: 'Real-world tools',
        short: 'Keep real-world service API operations, schemas, and behaviors; document any omissions.',
        definition: 'Tools should reproduce real-service interfaces from public API or implementation documentation, preserving their operations, argument schemas, and documented behaviors, with any omissions stated. Benchmark-defined backends with reduced interfaces understate the difficulty of real tool use, where arguments are nested and constraints are service-specific.',
        inMultiVerse: '35 simulated services expose 809 tools implemented from API or implementation documentation, validated with about 33K unit tests that cover 88% of executable statements.',
      },
      {
        number: 2,
        title: 'Broad, implicit service selection',
        short: 'Require inferring the right services among distractors.',
        definition: 'There should be enough services that selecting the right few among plausible distractors is itself part of the task, with the burden on the agent: a query that explicitly names all the services to be used, or a harness that implicitly supplies only the relevant tools for each task, solves the selection problem for the agent.',
        inMultiVerse: 'Agents have access to a median of 148.5 candidate tools across a median of six services per task, and queries often do not state which services to search.',
      },
      {
        number: 3,
        title: 'Interactive user simulation',
        short: 'Respond to clarification questions beyond a fixed interaction script.',
        definition: 'In real-world task delegation, users interact with the agent, so evaluation must include multi-turn tasks. A scripted user cannot adapt its replies to clarification questions outside the script.',
        inMultiVerse: 'A reticent LLM user simulator holds 268 hidden information items across the 199 multi-turn validation tasks and answers only what the agent asks.',
      },
      {
        number: 4,
        title: 'Steering default behavior',
        short: 'Score developer or user instruction following separately from task completion.',
        definition: 'A model can complete a task while violating instructions about how to act or respond. Evaluate adherence to developer or user instructions separately from task completion, using identifiable checks for at least two distinct behavioral categories and reporting quantitative adherence rates for each, with the evaluated population stated.',
        inMultiVerse: 'A dedicated instruction verifier assesses 1,046 rubrics from 731 instructions in nine behavioral categories, separately from task completion.',
      },
      {
        number: 5,
        title: 'Cross-harness evaluation',
        short: 'Compare all models on the same tasks and harnesses, bare and end-user.',
        definition: 'Real-world task delegation mostly happens through end-user harnesses, which change both the model’s behavior and the user’s experience. Attributing a score to the model or to the harness requires evaluating every model on the same tasks under the same bare and end-user harnesses, with model settings matched as closely as practical and any remaining differences documented.',
        inMultiVerse: 'Every model runs the same tasks under one bare harness and four end-user harnesses: Hermes, OpenCode, OpenHands, and OpenClaw.',
      },
    ],
  },
  {
    id: 'trustworthy',
    title: 'Trustworthy evaluation',
    tagline: 'Measure it correctly',
    principles: [
      {
        number: 6,
        title: 'Hidden test set',
        short: 'Keep test tasks hidden; evaluate via model submission to prevent contamination.',
        definition: 'Released tasks can enter training data, so a held-out set evaluated only through model submission limits contamination.',
        inMultiVerse: '400 test tasks remain hidden for leaderboard evaluation, alongside 396 validation tasks.',
      },
      {
        number: 7,
        title: 'Verification through service state',
        short: 'Accept alternative successful paths; detect unintended state changes.',
        definition: 'Judge correctness by the resulting service state rather than by matching a prescribed tool-call sequence. This credits alternative valid solutions and recovery from intermediate mistakes, while checking that the requested changes were achieved and unrelated state was preserved.',
        inMultiVerse: 'Deterministic assertion code and an LLM DB-diff verifier check the final service state, and an attempt succeeds only if it passes every applicable verifier.',
      },
      {
        number: 8,
        title: 'Self-contained environment',
        short: 'No live dependencies; every run starts from the same initial state.',
        definition: 'Task services and required task content should be fixed and resettable, so upstream changes cannot silently alter the task or its outcome. We assess task-time dependencies, not ordinary installation dependencies or hosted agent, simulator, and judge model calls; the latter still require separate control and error handling.',
        inMultiVerse: 'Each task runs in its own container from a fixed initial state, and no tool calls a live service.',
      },
      {
        number: 9,
        title: 'Infrastructure-error isolation',
        short: 'Rerun tasks with infrastructure errors; never score them as agent failures.',
        definition: 'Attempts affected by provider rate limits, initialization failures, or exhausted quotas must be classified separately from agent failures, excluded from reported denominators, and rerun; otherwise operational accidents are recorded as spurious agent failures.',
        inMultiVerse: 'Transient provider, container, and verifier failures are never scored and are marked for retry.',
      },
      {
        number: 10,
        title: 'Validated user simulator and verifiers',
        short: 'Check simulator and verifier accuracy against human judgment.',
        definition: 'The accuracy of every component that produces or influences a score must be measured against human judgment, deterministic checks included. Assertion code that is stricter than the task, or an exact match after normalization, rejects correct solutions just as an LLM judge can, and a user simulator that reveals or withholds the wrong information changes what the agent is scored on.',
        inMultiVerse: 'Human reviewers found no simulator guideline violations in 97 of 100 audited conversations, and the judges’ majority-vote decisions agreed with human review in 92–100% of audited cases.',
      },
      {
        number: 11,
        title: 'Right-sized task set',
        short: 'Enough tasks to distinguish models; few enough for careful review and repeated evaluation.',
        definition: 'A task set should be large enough to distinguish model performance reliably, but small enough that every task can be carefully reviewed and the evaluation can be run repeatedly.',
        inMultiVerse: '796 tasks (396 validation, 400 hidden test). A second, independent vendor reviews every delivered task, and reported success rates average three complete runs.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Benchmark comparison. Caption: Table 1. Column criteria: the notes of the
// full comparison table in the appendix, abridged. Closing sentences: Related
// work and Introduction.
// ---------------------------------------------------------------------------
export const COMPARISON = {
  caption: 'Benchmark comparison. D1 to D11 mark the design dimensions above.',
  legend: {
    yes: 'Satisfied',
    partial: 'Partially satisfied',
    no: 'Not satisfied',
    na: 'Not applicable, unreported, or retrieved at run time',
    low: 'Low',
    mid: 'Mid',
    high: 'High',
  },
  taskCountNote: 'Unlike in the other columns, a fuller # Tasks circle does not mean a better benchmark (D11).',
  takeaway: 'Among the 33 other benchmarks we reviewed, none combines real tools in a self-contained sandbox with responsive user simulation, steering evaluation by category of instruction, and full model-by-harness evaluation on the same tasks. MultiVerse is designed to cover all eleven design dimensions.',
  /** What each column records. Keys are the column ids of comparison.json. */
  columnHelp: {
    realWorldTools: 'Satisfied: tools are the live services, or simulations implemented against a real service’s documented interface that preserve its operations and argument schemas. Partial: a mixture, or simulations that follow a real service’s interface loosely. Not satisfied: benchmark-defined synthetic backends whose interfaces are reduced relative to the real service.',
    services: 'Number of services the benchmark provides.',
    tools: 'Number of tools the benchmark provides.',
    toolsPerTask: 'Number of tools the agent is exposed to within a single task.',
    servicesPerTask: 'Number of services the agent is exposed to within a single task.',
    userSimulator: 'A user simulator that responds to clarification questions beyond a fixed interaction script.',
    steering: 'Satisfied: at least two distinct behavioral categories, identifiable adherence checks for each, and quantitative adherence results with the evaluated population stated for each category. Partial: at least one instruction is evaluated, but these requirements are not all met. Not satisfied: no such instruction is evaluated.',
    crossHarness: 'Satisfied: every evaluated model is run under every evaluated harness. Partial: multiple harnesses are evaluated, but the full model-by-harness grid is not covered. Not satisfied: no harness variation.',
    hiddenTest: 'A held-out test set evaluated only through model submission.',
    stateVerification: 'Satisfied: at least some tasks check the resulting service or environment state at completion. Partial: checks intermediate state, or matches executed write actions to an oracle without establishing that the required state holds at completion. Not satisfied: neither.',
    selfContained: 'Satisfied: task services and required task content can be fixed and reset. Not satisfied: task-time dependencies on uncontrolled external services or content can change outcomes.',
    infraIsolation: 'Satisfied: the evaluation harness classifies infrastructure failures apart from agent errors, keeps them out of reported scores, and supports re-running errored tasks. Partial: some but not all of these provisions.',
    validatedSimulator: 'Satisfied: reports a numerical measure of simulator correctness or errors against human judgments. Partial: reports human assessment that does not measure correctness. Not satisfied: no human assessment is reported. Not applicable: no user simulator.',
    validatedEvaluation: 'Satisfied: reports a numerical measure of evaluator correctness against human judgments or independently established reference labels. Partial: reports checks of evaluator correctness but no numerical result. Not satisfied: reports neither.',
    tasks: 'A task set should be large enough to separate similarly performing models, yet small enough that every task can be reviewed by hand and the full benchmark rerun under every model-harness pair.',
  } as Record<string, string>,
} as const;

// ---------------------------------------------------------------------------
// Agentic Benchmark Checklist assessment. Source: the appendix subsection
// "Agentic Benchmark Checklist assessment" and the caption of its table.
// The marks, the totals, and the table's notes are generated
// (src/data/paper/abc.json); the prose here is the paper's. `takeaway`
// quotes totals and item ids: recheck it when the table changes.
// ---------------------------------------------------------------------------
export const ABC = {
  /** The checklist's own paper (bibliography entry zhu2025establishing). */
  source: {
    label: 'Zhu et al., 2025',
    title: 'Establishing Best Practices for Building Rigorous Agentic Benchmarks',
    url: 'https://arxiv.org/abs/2507.02825',
  },
  takeaway: 'MultiVerse has the highest score among the six benchmarks assessed: 28 of 33 applicable items satisfied, followed by GAIA2 at 26 of 33.',
  legend: {
    yes: 'Satisfied',
    no: 'Not satisfied',
    na: 'Not applicable',
  },
  /** Short names of the same three marks, for the chart's legend and the totals. */
  legendShort: {
    yes: 'Satisfied',
    no: 'Not satisfied',
    na: 'Not applicable',
  },
} as const;

// ---------------------------------------------------------------------------
// Overview figure: Figure 1 and its caption. The example is adapted from a
// validation task; trajectories and verifier outcomes are illustrative.
// ---------------------------------------------------------------------------
export type CaseId = 'failure' | 'success';
export type VerdictMark = 'pass' | 'fail';
export interface AgentStep {
  kind: 'read' | 'guess' | 'ask' | 'user' | 'act';
  text: string;
}
export interface Verifier {
  id: 'assertion' | 'dbdiff' | 'instruction' | 'response';
  name: string;
  /** Deterministic code or an LLM judge. */
  kind: string;
  input: string;
  verdict: Record<CaseId, VerdictMark>;
  /** Why the failure case fails or passes this verifier, where the figure says so. */
  failureNote?: string;
}

export const OVERVIEW = {
  caption: 'Overview of MultiVerse, adapted from a validation task; trajectories and verdicts for this task are illustrative.',
  task: {
    title: 'Task',
    queryLabel: 'User query',
    query: 'I made up my mind on the new time. Reply to Julian\'s email and ask him to re-schedule our family dinner at The Star with the new time for tonight, just for the 3 of us, still on the patio.',
    instructionsLabel: 'Instructions',
    instructionsNote: 'developer/user (IF, MTIF)',
    instructions: [
      { text: 'After replying to my husband’s emails, always send him a short text message asking him to check it.', category: 'Ordering and preconditions' },
      { text: 'After sending a text message, mark open reminders that mention the recipient as completed.', category: 'Argument and outcome constraints' },
      { text: 'Sign every email or text to my husband “Love, Clara”.', category: 'Argument and outcome constraints' },
    ],
  },
  userSimulator: {
    title: 'User simulator',
    note: 'MT, MTIF: a reticent LLM user holding private information',
    goal: 'User goal: Clara wishes the agent to reply to Julian’s email to reschedule the family dinner at The Star tonight.',
    hidden: 'Hidden from the agent, known only to the user: the new dinner time is 7:30 PM',
    why: 'The agent needs the user’s chosen time. No application stores it: Julian’s email holds the old 6:30 PM booking, and the shared calendar’s recurring dinner says “typically 6 PM”, a wrong answer for an agent that guesses.',
  },
  agent: {
    title: 'Agent under evaluation',
    note: 'model × harness, here OpenClaw',
    cases: {
      failure: {
        title: 'Failure case',
        outcome: 'failed',
        summary: 'never asks',
        steps: [
          { kind: 'read', text: 'Contacts identifies Julian as her husband. Searches connected services; no new dinner time.' },
          { kind: 'guess', text: 'Never asks. Uses the recurring 6 PM event.' },
          { kind: 'act', text: 'Emails 6:00 PM; texts Julian to check it (1); signs both “Love, Clara” (3); closes reminder (2). Final: “Email sent; Julian texted; reminder closed.”' },
        ] as AgentStep[],
      },
      success: {
        title: 'Success case',
        outcome: 'passed',
        summary: 'asks before acting',
        steps: [
          { kind: 'read', text: 'Same searches; identifies Julian, but no new time.' },
          { kind: 'ask', text: '“Could you please let me know what the new time is?”' },
          { kind: 'user', text: '“7:30 PM”' },
          { kind: 'act', text: 'Emails 7:30 PM; texts Julian to check it (1); signs both “Love, Clara” (3); closes reminder (2). Final: “Email sent; Julian texted; reminder closed.”' },
        ] as AgentStep[],
      },
    },
  },
  verifiers: {
    title: 'Verifiers',
    note: 'F = failure case; S = success case',
    rule: 'An attempt succeeds only if it passes every applicable verifier.',
    items: [
      { id: 'assertion', name: 'Assertion code', kind: 'deterministic', input: 'final DB state', verdict: { failure: 'fail', success: 'pass' }, failureNote: 'reply says 6:00 PM, not 7:30' },
      { id: 'dbdiff', name: 'DB-diff verifier', kind: 'LLM', input: 'DB diff vs. gold diff + final-state rubrics; no trajectory', verdict: { failure: 'fail', success: 'pass' }, failureNote: 'the email carries the wrong time' },
      { id: 'instruction', name: 'Instruction verifier', kind: 'LLM', input: 'whole trajectory + DB diff + instruction rubrics', verdict: { failure: 'pass', success: 'pass' } },
      { id: 'response', name: 'Final-response verifier', kind: 'LLM', input: 'final vs. reference response + response rubrics; no trajectory or DB state', verdict: { failure: 'pass', success: 'pass' }, failureNote: 'confirms actions, not email time' },
    ] as Verifier[],
  },
  services: {
    title: 'Simulated services',
    note: '35 services, 809 tools; every call reads or mutates the task’s own database, initialized per task.',
    connectedLabel: 'Services connected to this task',
    /**
     * App ids of the desktop GUI, in the order the figure lists the services.
     * The icons at gui/icons/<app>.svg are white glyphs; `tile` is the dock tile
     * background from each app's manifest in the GUI source, so a chip here
     * looks like the app's icon in the desktop dock.
     */
    connected: [
      { app: 'gridwell_mail', name: 'Mail', tile: 'linear-gradient(135deg, #E11D48 0%, #BE123C 100%)' },
      { app: 'gridwell_calendar', name: 'Calendar', tile: 'linear-gradient(135deg, #06B6D4 0%, #0D9488 100%)' },
      { app: 'notes_and_lists', name: 'Notes & Lists', tile: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)' },
      { app: 'generic_reminders', name: 'Reminders', tile: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      { app: 'contacts', name: 'Contacts', tile: 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)' },
      { app: 'messages', name: 'Messages', tile: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)' },
      { app: 'clock', name: 'Clock', tile: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' },
    ],
  },
  /** Labels on the arrows between the panels. */
  flows: {
    taskToAgent: 'query + instructions',
    userToAgent: 'clarifying questions / answers',
    agentToServices: 'tool calls / results',
    agentToVerifiers: 'trace, final response',
    servicesToVerifiers: 'final DB state',
  },
} as const;

/**
 * The five steps of the worked example, in the order the figure's process
 * runs. `flow` is the figure's label for what moves between its components at
 * that step. `lead` is quoted from the paper: the Tasks subsection (task, read),
 * the User simulator subsection (ask), the Tools subsection (act), and the
 * Verifiers subsection (verify).
 */
export const OVERVIEW_STAGES = [
  { id: 'task', label: 'Task', flow: 'query + instructions', lead: 'Each task specifies an initial service state, a natural-language query, and optional developer/user instructions.' },
  { id: 'read', label: 'Read', flow: 'tool calls / results', lead: 'Queries often do not explicitly state which services the agent needs to search through, leaving the identification of the services that contain the necessary information as a part of the task requirements.' },
  { id: 'ask', label: 'Consult the user', flow: 'clarifying questions / answers', lead: 'For MT and MTIF, annotators create requests with missing information that the agent is expected to obtain from the user, such as what time the new family dinner should be. The user simulator holds these details and answers questions about them. It is deliberately reticent: it answers direct questions using only its hidden information and declines questions outside that information.' },
  { id: 'act', label: 'Act', flow: 'tool calls / results', lead: 'Each service is backed by a structured database that tool calls deterministically read and mutate, and each task ships its own initial database state, so the same agent behavior always produces the same service outcome.' },
  { id: 'verify', label: 'Verify', flow: 'trace, final response, final DB state', lead: 'Four complementary verifiers assess service state, the agent’s report to the user, and instruction adherence, as applicable to each task. An attempt succeeds only if it passes every applicable verifier.' },
] as const;
export type OverviewStageId = typeof OVERVIEW_STAGES[number]['id'];

// ---------------------------------------------------------------------------
// The worked example in the desktop. Its steps are OVERVIEW_STAGES and its
// panels show the figure's content (OVERVIEW); the complete trajectory and the
// desktop records are read from public/data/dinner-showcase.json at run time.
// Verifier descriptions: the Verifiers subsection of the paper.
// ---------------------------------------------------------------------------
export type TourStepId = OverviewStageId;

export const TOUR_VERIFIERS = [
  { id: 'assertion', name: 'Assertion code', text: 'Deterministic code checks required properties of the final service state, such as whether one reply was sent in Julian’s email thread.' },
  { id: 'dbdiff', name: 'DB-diff verifier', text: 'An LLM judge compares the agent’s database changes with those made by the gold solution, using applicable final-state rubrics and allowing valid alternatives. It checks whether the email requests the intended reservation change and whether unrelated service state was changed inappropriately; the wording need not match the gold solution.' },
  { id: 'response', name: 'Final-response verifier', text: 'An LLM judge compares the agent’s final message to the user with an annotator-written reference response, using applicable response rubrics. Here, it evaluates the report to Clara, not the email sent to Julian. It also checks answers to information-seeking requests that require no database change.' },
  { id: 'instruction', name: 'Instruction verifier', text: 'An LLM judge checks compliance with the developer/user instructions against one or more rubrics per instruction, using the trajectory, database state, and/or response. Here, the agent must also send the additional text message, close the relevant reminders, and sign both messages “Love, Clara”.' },
] as const;

/** Text of the worked example that is not in the figure itself. */
export const EXAMPLE = {
  title: 'Dinner at The Star',
  /** The Tasks subsection, on behavioral instructions. */
  instructionScoring: 'We score instruction compliance separately from task completion, while requiring both for overall success.',
} as const;

// ---------------------------------------------------------------------------
// Results. Setup: the Setup subsection of Experimental results, the task
// construction appendix, and the limitations. Findings: abstract,
// introduction, and Experimental results, including the paragraph "The highest
// mean for an open-weight model is 52.4%". The two model groups are called
// proprietary and open-weight, as in the paper.
//
// The site shows three result sets (src/lib/release.ts), and each has its own
// text here:
//   paper-validation    the results of the paper's study, on v1.0.0. Called
//                       "Results", never a leaderboard: new evaluations belong
//                       to v1.1.0.
//   validation, test    the leaderboard of v1.1.0, one tab per split. Text
//                       from the paper's appendix on the later release
//                       ("revisions and baselines") and the caption of its
//                       figure.
// ---------------------------------------------------------------------------
export interface ResultsNote { key: string; label: string; text: string }
export interface ResultsCopy {
  /** What the section is called: its title and its tab in the navigation. */
  name: string;
  /** The id of the section, where its link in the navigation lands. */
  anchor: 'results' | 'leaderboard';
  /** The lead under the section title, given the number of tasks of the set. */
  lead: (tasks: number) => string;
  /** What every number is: the caption of the table. */
  metric: string;
  /** The tasks of the set, as the chart's subtitle names them. */
  taskNoun: string;
  /** How differences between two rates are computed. */
  differences: string;
  /** The notes under the results, in display order. */
  notes: ResultsNote[];
}

const PAPER_METRIC = 'Success rate (%) on the 396 validation tasks (100 ST, 97 IF, 100 MT, 99 MTIF): mean of three runs, with the standard deviation across runs.';
const PAPER_DIFFERENCES = 'Differences are computed from unrounded means.';
const VERIFIERS = 'Average weights the four task settings equally. An attempt succeeds only if it passes every applicable verifier.';

/** The leaderboard of the latest release for one split. The two splits differ in which tasks they name. */
function leaderboardCopy(split: 'validation' | 'test'): ResultsCopy {
  const tasks = split === 'validation' ? 'validation tasks' : 'hidden test tasks';
  const metric = `Success rate (%) on the 400 ${tasks} of ${LATEST_RELEASE} (100 per task setting), with one scored trajectory per model and task.`;
  const differences = 'Differences are computed from unrounded success rates.';
  return {
    name: 'Leaderboard',
    anchor: 'leaderboard',
    lead: count => `Success rates by model and task setting under the bare harness, with one scored trajectory per model and task. The validation set and the hidden test set of ${LATEST_RELEASE} each contain ${count} tasks, with ${count / 4} per setting.`,
    metric,
    taskNoun: split === 'validation' ? 'validation tasks' : 'test tasks',
    differences,
    notes: [
      { key: 'metric', label: 'Metric', text: `${metric} ${VERIFIERS} No across-run standard deviation is reported.` },
      { key: 'protocol', label: 'Baselines', text: `These baselines cover the bare harness (a simple loop); the main study, on ${PAPER_RELEASE}, provides the comparisons across harnesses and repeated runs. The baselines combine retained trajectories with additional executions and updated assertion outcomes where task checks changed. Existing LLM judgments are retained except where a task-specific reference required correction; the shared judge prompts are unchanged.` },
      { key: 'access', label: 'Model groups', text: 'Kimi K3, GLM 5.3, and DeepSeek V4.1 Flash are open-weight models. The other models are proprietary.' },
      ...(split === 'validation' ? [{ key: 'comparison', label: `Comparison with ${PAPER_RELEASE}`, text: `Five model versions occur in both evaluations: GPT 6 Astra, GPT 5.6 Sol, Gemini 3.8 Flash, Gemini 3.5 Flash, and Kimi K3. For each, the ${LATEST_RELEASE} validation success rate falls within the ${PAPER_RELEASE} 95% task-bootstrap confidence interval, both overall and in each of the four settings. These comparisons are descriptive and do not establish equivalence between releases.` }] : []),
      { key: 'differences', label: 'Rounding', text: differences },
    ],
  };
}

export const RESULTS_COPY: Record<ResultSet, ResultsCopy> = {
  'paper-validation': {
    name: 'Results',
    anchor: 'results',
    lead: count => `Success rates by model, harness, and task setting, measured on the ${count} validation tasks of ${PAPER_RELEASE} and averaged over three runs. Every model runs the same tasks under a bare harness and four end-user harnesses.`,
    metric: PAPER_METRIC,
    taskNoun: 'validation tasks',
    differences: PAPER_DIFFERENCES,
    notes: [
      { key: 'metric', label: 'Metric', text: `${PAPER_METRIC} ${VERIFIERS}` },
      { key: 'protocol', label: 'Protocol', text: 'Every model runs the same tasks under the bare harness (a simple loop) and four end-user harnesses, with the same task tools and a budget of 320 model calls per attempt. Models are configured for high reasoning effort where supported. Runs were collected between 25 August and 25 September 2026.' },
      { key: 'access', label: 'Model access', text: 'The open-weight models (Kimi K3, GLM 5.2, and DeepSeek V4 Flash) are accessed through OpenRouter. The proprietary models are accessed through their providers’ APIs.' },
      { key: 'differences', label: 'Rounding', text: PAPER_DIFFERENCES },
    ],
  },
  validation: leaderboardCopy('validation'),
  test: leaderboardCopy('test'),
};

/** The two tabs of the leaderboard of the latest release, in display order. */
export const LEADERBOARD_TABS: { set: Exclude<ResultSet, 'paper-validation'>; label: string; note: (tasks: number) => string }[] = [
  { set: 'validation', label: 'Validation set', note: tasks => `${tasks} tasks` },
  { set: 'test', label: 'Test set', note: tasks => `${tasks} hidden tasks` },
];

/**
 * Above the latest release's results: how to submit to the validation set
 * leaderboard, and the contact message for the test set. A submission is made
 * with the `multiverse submit` command of the code repository, which checks
 * the finished evaluations and opens a pull request on this site's repository
 * (submissions/README.md).
 */
export const LEADERBOARD_CONTACT = {
  email: CONTACT_EMAIL,
  validation: {
    lead: 'To add your model’s results to the validation set leaderboard, run',
    command: 'multiverse submit',
    details: 'on your finished evaluations. The command checks the results and opens a pull request that adds them to the leaderboard.',
    guide: 'Submission guide',
    guideUrl: 'https://github.com/google-deepmind/MultiVerse/blob/main/docs/leaderboard-submission.md',
    questions: 'For questions, contact',
  },
  test: {
    lead: 'A model-submission-based leaderboard for the hidden test set is coming soon in collaboration with MLCommons.',
    contact: 'Contact',
    details: 'to show your interest in the test set leaderboard.',
  },
} as const;

/**
 * At the harness control of the latest release's leaderboard: why the
 * end-user harnesses cannot be selected, where results under them are, and
 * that such results can be submitted. The names of the harnesses come from
 * the data.
 */
export const HARNESS_AVAILABILITY = {
  /** `harnesses` is the list in words: "Hermes, OpenCode, OpenHands, and OpenClaw". */
  lead: (harnesses: string) => `Results under ${harnesses} are not yet available for ${LATEST_RELEASE}.`,
  more: `The paper reports results under these harnesses for ${PAPER_RELEASE}. For ${LATEST_RELEASE}, they can be submitted to the leaderboard.`,
  showPaper: `Show the ${PAPER_RELEASE} results`,
  submit: 'How to submit',
  /** The tooltip of one such harness, and its accessible name. */
  title: (harness: string) => `${harness}: not yet available for ${LATEST_RELEASE}. The paper reports results under ${harness} for ${PAPER_RELEASE}.`,
  ariaLabel: (harness: string) => `${harness}, not yet available for ${LATEST_RELEASE}`,
} as const;

/** A small comparison drawn under a finding. Values are the numbers quoted in its text. */
export interface FindingChart {
  /** bars: values on a 0 to `max` scale. diverging: signed values around zero, on a scale of plus or minus `max`. */
  kind: 'bars' | 'diverging';
  max: number;
  /** What the values are, stated with their denominator. */
  caption: string;
  items: { label: string; value: number; display: string }[];
}
export interface Finding {
  id: string;
  /** The headline number. */
  stat: string;
  statLabel: string;
  title: string;
  body: string;
  chart?: FindingChart;
}

/**
 * The lead finding: proprietary vs open-weight models. Text from the abstract
 * and the results paragraph "The highest mean for an open-weight model is
 * 52.4%". The component draws the two bars and the headline difference from the
 * result table; the page test checks that they agree with the numbers quoted here.
 */
export const GAP_FINDING = {
  id: 'gap',
  unit: 'points',
  statLabel: 'between the strongest model-harness pair and the strongest pair that uses an open-weight model',
  title: 'Open-weight models trail proprietary models.',
  body: 'The strongest model-harness pair achieves a mean success rate of 70.0% (GPT 6 Astra with OpenHands), compared with 52.4% for the strongest pair that uses an open-weight model (Kimi K3 with OpenClaw). Under the bare harness, Kimi K3 reaches 50.1%, 19.9 percentage points below GPT 6 Astra. The three open-weight models, Kimi K3, GLM 5.2, and DeepSeek V4 Flash, rank seventh, eleventh, and twelfth of the twelve models in both the bare-harness average and the end-user harness average. Kimi K3 scores above three proprietary models: Claude Sonnet 5 and two of the three reference models used for task selection, Claude Opus 4.6 and Gemini 3.1 Pro.',
  caption: 'Highest mean success rate of a model-harness pair in each group',
} as const;

/** The other findings stated in the paper, in the order they are shown after the lead finding. */
export const FINDINGS: Finding[] = [
  {
    id: 'headroom',
    stat: '70.0%',
    statLabel: 'highest model-harness mean success rate',
    title: 'MultiVerse remains challenging.',
    body: 'GPT 6 Astra with OpenHands achieves the highest mean success rate, 70.0%. Averaged equally across models, harnesses, and task settings, the mean success rate is 49.2%, compared with 32.9% for success in all three runs.',
    chart: {
      kind: 'bars',
      max: 100,
      caption: 'Success rate on the validation tasks',
      items: [
        { label: 'Best model-harness pair', value: 70.0, display: '70.0%' },
        { label: 'Mean over all models, harnesses, and settings', value: 49.2, display: '49.2%' },
        { label: 'Success in all three runs', value: 32.9, display: '32.9%' },
      ],
    },
  },
  {
    id: 'steering',
    stat: '30.6%',
    statLabel: 'of failed IF and MTIF attempts only violate an instruction',
    title: 'Reaching the right outcome is not the same as following instructions.',
    body: 'In IF and MTIF, 30.6% of failed attempts pass every state and final-response check but violate a behavioral instruction. Under the bare harness, response requirements have the highest average violation rate (15.3%), followed by clarification and assumptions (14.5%), and the most compliant model differs by instruction category.',
  },
  {
    id: 'clarification',
    stat: '29.5%',
    statLabel: 'of MT attempts end without consulting the user',
    title: 'Agents often fail to obtain missing information from the user.',
    body: 'MT tasks require information that only the user holds. Still, 29.5% of MT attempts end after a single agent turn without a user reply. Only 4.7% of these attempts succeed, compared with 50.5% after a reply. Consultation in MT ranges from 47.7% of attempts (Gemini 3.5 Flash) to 96.2% (GPT 6 Astra).',
    chart: {
      kind: 'bars',
      max: 100,
      caption: 'Success rate of MT attempts',
      items: [
        { label: 'Without a user reply', value: 4.7, display: '4.7%' },
        { label: 'After a user reply', value: 50.5, display: '50.5%' },
      ],
    },
  },
  {
    id: 'harness',
    stat: '−0.05 pts',
    statLabel: 'end-user harnesses relative to the bare harness, on average',
    title: 'No harness is consistently best.',
    body: 'Averaged equally across models, settings, and end-user harnesses, end-user harnesses score 0.05 percentage points below the bare harness. For a particular model and setting the difference can be large in either direction: on MT, OpenHands scores 10.3 points above the bare harness for Claude Sonnet 5 but 10.7 points below it for Claude Opus 4.6, in all three runs.',
    chart: {
      kind: 'diverging',
      max: 15,
      caption: 'OpenHands minus the bare harness on MT, in percentage points',
      items: [
        { label: 'Claude Sonnet 5', value: 10.3, display: '+10.3' },
        { label: 'Claude Opus 4.6', value: -10.7, display: '−10.7' },
      ],
    },
  },
  {
    id: 'stability',
    stat: '251 / 264',
    statLabel: 'pairwise model orderings preserved across harnesses',
    title: 'Model rankings hold across harnesses, while single outcomes vary.',
    body: 'After averaging over the four settings, the bare-harness ordering of model pairs is preserved in 251 of 264 comparisons under the end-user harnesses, and no model moves more than two places. Single outcomes are less stable: for the same model, task, and run, bare and end-user harness attempts differ in 24.7% of comparisons, and reruns of the same model, harness, and task differ in 21.7%.',
    chart: {
      kind: 'bars',
      max: 100,
      caption: 'Share of paired attempts whose outcomes differ',
      items: [
        { label: 'Reruns of the same model, harness, and task', value: 21.7, display: '21.7%' },
        { label: 'Bare vs. end-user harness, same model, task, and run', value: 24.7, display: '24.7%' },
      ],
    },
  },
];
