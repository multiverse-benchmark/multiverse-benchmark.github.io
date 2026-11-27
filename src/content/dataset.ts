/**
 * Copy for the dataset statistics section. The sentences are the MultiVerse
 * paper's: the Tasks and User simulator subsections, the "Task statistics
 * and diversity" appendix with the captions of its three figures, and the
 * "Instruction rubric categories" appendix.
 *
 * Every number is filled in from the statistics of the release that
 * is shown, so the same sentences describe either release. For v1.0.0, the
 * release the paper describes, the original statistics reproduce the paper,
 * and scripts/export_dataset_stats.py checks each of those numbers
 * against the per-task rows in src/data/paper/dataset.json. The paper
 * states these statistics for v1.0.0 only; for v1.1.0 the sentences carry the
 * numbers computed from that release's tasks. Gold user turns are an additional
 * statistic derived from the recorded conversations using the paper's unit:
 * the initial request plus nonempty conversational user replies.
 */
import { formatStat, type DatasetStats, type TaskMetricId } from '../lib/dataset';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A small whole number as a word, as the paper writes it; any other number as a figure. */
const word = (value: number) => (Number.isInteger(value) && value >= 0 && value <= 10 ? NUMBER_WORDS[value] : formatStat(value));

export function datasetCopy(dataset: DatasetStats) {
  const s = dataset.stated;
  const n = (key: string) => formatStat(s[key]);
  const count = dataset.settingCounts;
  const categories = word(dataset.rubricCategories.length);

  return {
    intro: `The validation set has ${formatStat(dataset.taskCount)} tasks in four settings: ${count.ST} single-turn (ST), ${count.IF} with behavioral instructions (IF), ${count.MT} multi-turn (MT), and ${count.MTIF} that combine both (MTIF). Each task specifies an initial service state, a natural-language query, and optional developer/user instructions, and includes one reference (gold) solution: a sequence of tool calls and agent responses that solves it.`,

    /** Headline numbers. `stat` is a key of the dataset's `stated`; show it with formatStat. */
    facts: [
      { stat: 'taskCount', label: 'validation tasks', detail: `${count.ST} ST, ${count.IF} IF, ${count.MT} MT, ${count.MTIF} MTIF` },
      { stat: 'tools', label: `tools across ${n('services')} services`, detail: `a median of ${n('toolsPerServiceMedian')} tools per service` },
      { stat: 'candidateToolsMedian', label: 'candidate tools per task (median)', detail: `maximum ${n('candidateToolsMax')}, across a median of ${word(s.connectedServicesMedian)} services` },
      { stat: 'goldCallsMedian', label: 'gold tool calls per task (median)', detail: `mean ${n('goldCallsMean')}, maximum ${n('goldCallsMax')}` },
      { stat: 'rubrics', label: 'instruction rubrics', detail: `from ${n('instructions')} instructions, in ${categories} categories` },
      { stat: 'hiddenItems', label: 'hidden information items', detail: `in the ${n('multiTurnTasks')} multi-turn tasks, a median of ${word(s.hiddenItemsMedian)} per task` },
    ],

    distribution: {
      title: 'What a task involves',
      /** Paper statistics plus the gold user-turn distribution. */
      notes: {
        candidateTools: `Agents have access to a median of ${n('candidateToolsMedian')} candidate tools (maximum ${n('candidateToolsMax')}) across a median of ${word(s.connectedServicesMedian)} services (maximum ${word(s.connectedServicesMax)}).`,
        connectedServices: `Annotators started from two to seven randomly sampled services for each task. Sampled services that the task cannot use stay connected as distractors, which is why tasks expose a median of ${word(s.connectedServicesMedian)} services while gold solutions use ${word(s.goldServicesMedian)}.`,
        goldCalls: `Gold solutions contain a median of ${n('goldCallsMedian')} tool calls, a mean of ${n('goldCallsMean')}, and a maximum of ${n('goldCallsMax')}.`,
        goldTools: `Gold solutions use a median of ${n('goldToolsMedian')} distinct tools, with a maximum of ${n('goldToolsMax')}, and every solution uses at least ${word(s.goldToolsMin)}.`,
        goldUserTurns: `Gold solutions contain a median of ${n('goldUserTurnsMedian')} user turns, with a maximum of ${n('goldUserTurnsMax')}. A turn is the initial request or a nonempty conversational user reply; authoring hints, system setup, and empty termination messages are excluded.`,
        goldServices: `Gold solutions use a median of ${n('goldServicesMedian')} services, with a maximum of ${n('goldServicesMax')}, and every solution uses at least ${word(s.goldServicesMin)}.`,
        queryWords: `Validation queries have a median of ${n('queryWordsMedian')} words (${n('queryWordsMedianST')} for ST and ${n('queryWordsMedianMT')} for MT).`,
        hiddenItems: `The ${n('multiTurnTasks')} multi-turn validation tasks contain ${n('hiddenItems')} hidden items, a median of ${word(s.hiddenItemsMedian)} per task.`,
        instructions: `The ${count.IF} IF and ${count.MTIF} MTIF tasks carry ${n('instructions')} instructions, a median of ${n('instructionsMedian')} per task (${n('instructionsMin')} to ${n('instructionsMax')}).`,
        checks: `The instruction verifier assesses ${n('rubrics')} rubrics from those instructions, a median of ${n('checksMedian')} per task.`,
      } as Record<TaskMetricId, string>,
    },

    services: {
      title: 'Services and tools',
      lead: `MultiVerse simulates ${n('services')} services that together expose ${n('tools')} tools.`,
      toolsCaption: `Tools per service across the ${n('services')} services (median ${n('toolsPerServiceMedian')}).`,
      usageCaption: `Number of validation tasks whose gold solution uses each service. The validation gold solutions cover all ${n('services')} services, although their frequencies vary.`,
      familyCaption: `Share of task-service pairs by service family. Each distinct service used in a task’s gold solution contributes one pair, regardless of repeated calls. Shares are computed over ${n('taskServicePairs')} pairs from ${formatStat(dataset.taskCount)} tasks; a task can contribute multiple pairs within or across families.`,
    },

    rubrics: {
      title: 'Instruction rubric categories',
      lead: `The IF and MTIF evaluation assesses ${n('rubrics')} rubrics from ${n('instructions')} instructions, grouped into ${categories} categories. A rubric is an observable requirement used by the instruction verifier; a compound instruction can contain rubrics from several categories.`,
      caption: `Number of instruction rubrics in each category, for the ${count.IF} IF and the ${count.MTIF} MTIF tasks. Categories refer to the behavior checked, not necessarily every requirement in the parent instruction.`,
      /** One note per label of the release that the nine categories do not have (none for v1.0.0). */
      mergedNotes: dataset.mergedRubricLabels.map(entry =>
        `In ${dataset.release}, ${formatStat(entry.rubrics)} of these rubrics carry the label “${entry.label}”. They are counted under “${entry.countedUnder}”, the category of the paper that contains them.`),
    },
  };
}
export type DatasetCopy = ReturnType<typeof datasetCopy>;
