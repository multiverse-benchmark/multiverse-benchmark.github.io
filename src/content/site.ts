import { LATEST_RELEASE, PAPER_RELEASE, type Release } from '../lib/release';

/**
 * How the site is divided. The main page introduces the benchmark and its
 * results; the deep dive holds the material for readers who want to look
 * closely at the benchmark itself. Each part below is one section of the deep
 * dive, in the order of the page, named and described the same way wherever it
 * is linked from. A part with `release` exists for that release only.
 */
/** The task explorer: every validation task of the release that is shown. */
export const TASK_EXPLORER = { id: 'explorer', title: 'Task explorer' } as const;
/** The result explorer: the result of each model on the leaderboard on each validation task of the latest release. */
export const RESULT_EXPLORER = { id: 'result-explorer', title: 'Result explorer' } as const;

export const DEEP_DIVE = {
  name: 'Deep dive',
  parts: [
    {
      ...TASK_EXPLORER,
      text: 'Every validation task: its query and instructions, the gold trajectory, the evaluation criteria, and the states of the services.',
    },
    {
      ...RESULT_EXPLORER,
      text: 'The result of each model on the leaderboard on each validation task, with the verifier results and the trajectory of every run.',
      release: LATEST_RELEASE,
    },
    {
      id: 'principles',
      title: 'Design dimensions and comparison',
      text: 'Eleven design dimensions for realistic delegation and trustworthy evaluation, how MultiVerse meets each one, and how other benchmarks compare.',
    },
    {
      id: 'dataset',
      title: 'Dataset statistics',
      text: 'Statistics of the validation tasks: the tools and services each task exposes, the length of its gold solution, and the instruction rubrics it is scored on.',
    },
    {
      id: 'tools',
      title: 'Tool explorer',
      text: 'The code behind the tools: request validation, state transitions, error handling, and the tests that check them.',
    },
    {
      id: 'releases',
      title: 'Releases',
      text: `How ${LATEST_RELEASE} differs from ${PAPER_RELEASE}, the version the paper describes: fixes to the APIs, tasks updated for them, and tasks added to two settings.`,
    },
  ],
} as const;

export type DeepDivePart = typeof DEEP_DIVE.parts[number];
export type DeepDivePartId = DeepDivePart['id'];

/** The parts of the deep dive that exist for a release, in the order of the page. */
export const deepDiveParts = (release: Release): DeepDivePart[] =>
  DEEP_DIVE.parts.filter(part => !('release' in part) || part.release === release);
