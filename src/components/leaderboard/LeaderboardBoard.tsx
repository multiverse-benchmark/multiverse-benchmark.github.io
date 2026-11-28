import { lazy, Suspense, useState } from "react";
import { LeaderboardControls, type UnavailableHarnessCopy } from "./LeaderboardControls";
import { LeaderboardTable, type AccessFilter } from "./LeaderboardTable";
import "./leaderboard.css";
import {
  AVERAGE_HARNESS,
  BEST_HARNESS,
  DEFAULT_FILTERS,
  buildRows,
  harnessKey,
  orderSettings,
  rankRows,
  type BoardColumn,
  type ColumnAxis,
} from "@/lib/leaderboardFilters";
import type {
  HarnessOption,
  LeaderboardFilters,
  MultiverseModel,
  TaskSettingFilter,
  TaskSettingId,
  TaskSettingOption,
} from "@/types/platform";

// The chart library is large; load it only when there are results to chart.
const LeaderboardChart = lazy(() => import("./LeaderboardChart").then((m) => ({ default: m.LeaderboardChart })));

/*
 * How the text names a harness and a task setting. The bare harness is "none"
 * in the data: a run without a harness.
 */
const BARE_HARNESS = "none";
const underHarness = (harness: HarnessOption | undefined, choice?: string): string =>
  choice === AVERAGE_HARNESS
    ? "averaged over the harnesses"
    : !harness
      ? "under each model’s best harness"
      : harness.id === BARE_HARNESS
        ? "under the bare harness"
        : `under ${harness.label}`;
/** What a number is for the selected task setting; without one, it is the average over the task settings. */
const rateIn = (setting: TaskSettingOption | undefined, unit = ""): string =>
  setting ? `Success rate${unit} on the ${setting.code} tasks` : `Average success rate${unit} over the task settings`;

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

/** The columns of the table, and the series of the chart: the task settings for one harness, or the harnesses for one task setting. */
function boardColumns(
  axis: ColumnAxis,
  settings: TaskSettingOption[],
  harnesses: HarnessOption[],
  harness: string,
  setting: TaskSettingFilter,
  /** Number of tasks in a task setting; 0 when it is not known. */
  tasksIn: (settingId: string) => number,
  /** Whether the result set has each model's rate averaged over the harnesses. */
  hasAverage: boolean,
): BoardColumn[] {
  if (axis === "settings") {
    const counts = settings.map((option) => tasksIn(option.id));
    const total = counts.every((count) => count > 0) ? counts.reduce((sum, count) => sum + count, 0) : 0;
    return [
      {
        key: "all",
        label: "Average",
        name: "Average",
        title: `Equal-weight mean of the ${COUNT_WORDS[settings.length] ?? settings.length} task settings${total ? ` (${total} tasks)` : ""}`,
        harness,
        setting: "all",
        summary: true,
      },
      ...settings.map((option, index) => ({
        key: option.id,
        label: option.code,
        name: option.label,
        title: `${option.label}${counts[index] ? ` (${counts[index]} tasks)` : ""}`,
        harness,
        setting: option.id as TaskSettingFilter,
        summary: false,
      })),
    ];
  }
  return [
    ...harnesses.map((option) => ({
      key: option.id,
      label: option.label,
      name: option.label,
      title: option.id === BARE_HARNESS ? "The bare harness (a simple loop)" : `${option.label}, an end-user harness`,
      harness: option.id,
      setting,
      summary: false,
    })),
    ...(hasAverage
      ? [{
          key: AVERAGE_HARNESS,
          label: "Average",
          name: "Average",
          title: `Each model’s success rate averaged over the ${COUNT_WORDS[harnesses.length] ?? harnesses.length} harnesses`,
          harness: AVERAGE_HARNESS,
          setting,
          summary: true,
        }]
      : []),
    {
      key: BEST_HARNESS,
      label: "Best harness",
      name: "Best harness",
      title: "Each model’s highest success rate over the harnesses, with the harness that gives it",
      harness: BEST_HARNESS,
      setting,
      summary: true,
    },
  ];
}

/** The key entry for a board with submitted entries: what "Submitted by" under a model says about its numbers. */
const SUBMITTED_KEY = {
  label: "Submitted by",
  text: "Results reported by the named submitter with multiverse submit. The scores are checked against the verifier votes in the entry’s trajectories; the run is not repeated.",
};

/** The key under the table: what each column is. The end-user harnesses share one entry. */
function columnKey(axis: ColumnAxis, columns: BoardColumn[]): { label: string; text: string }[] {
  if (axis === "settings") return columns.map((column) => ({ label: column.label, text: column.title }));
  const bare = columns.filter((column) => column.key === BARE_HARNESS);
  const endUser = columns.filter((column) => !column.summary && column.key !== BARE_HARNESS);
  const summary = columns.filter((column) => column.summary);
  return [
    ...bare.map((column) => ({ label: column.label, text: column.title })),
    ...(endUser.length > 0
      ? [{ label: endUser.map((column) => column.label).join(", "), text: endUser.length > 1 ? "End-user harnesses" : "An end-user harness" }]
      : []),
    ...summary.map((column) => ({ label: column.label, text: column.title })),
  ];
}

interface LeaderboardBoardProps {
  /** One entry per model and harness. */
  models: MultiverseModel[];
  /** Recorded runs per task, for the uncertainty explanation. */
  runCount: number;
  availableTaskSettings: TaskSettingOption[];
  /** Every harness the board is set up for; one without results (`models` 0) is shown and cannot be selected. */
  availableHarnesses: HarnessOption[];
  /** What to say about the harnesses without results: why they have none, and where results under them are. */
  unavailableHarnesses?: UnavailableHarnessCopy;
  /** Names the result set on show: a change of set sends the table back to its first page. */
  boardKey: string;
  /** What every number is ("Success rate (%) on the 400 validation tasks ..."). The table's caption opens with it. */
  metric?: string;
  /** Opens a run's own results, where the board has them. */
  onSelectModel?: (run: MultiverseModel) => void;
}

/**
 * The leaderboard of one result set: its controls, its chart, and its ranked
 * table, in that order, because the controls drive both of the others.
 *
 * Every number is one model under one harness in one task setting. A task
 * setting and a harness pick the number that ranks the models; "Columns"
 * picks which of the two the table and the chart spread out. The board draws
 * the results it is given, which come from the result files that ship with
 * the site.
 */
export function LeaderboardBoard({
  models,
  runCount,
  availableTaskSettings,
  availableHarnesses,
  unavailableHarnesses,
  boardKey,
  metric,
  onSelectModel,
}: LeaderboardBoardProps) {
  const [filters, setFilters] = useState<LeaderboardFilters>(DEFAULT_FILTERS);
  const [harnessChoice, setHarnessChoice] = useState<string | null>(null);
  const [axisChoice, setAxisChoice] = useState<ColumnAxis>("settings");
  const [access, setAccess] = useState<AccessFilter>("all");

  const totalModels = new Set(models.map((m) => m.modelKey ?? m.name)).size;
  // The harness control lists every harness the board is set up for. Comparing harnesses (the
  // "Columns" switch, "Best harness") needs results under two of them.
  const harnessesWithResults = availableHarnesses.filter((h) => h.models > 0);
  const settingsWithResults = orderSettings(availableTaskSettings).filter((s) => s.models > 0);
  const severalHarnesses = harnessesWithResults.length > 1;
  // The average over the harnesses is offered where the result set has it.
  const hasAverage = severalHarnesses && models.some((model) => harnessKey(model) === AVERAGE_HARNESS);
  const axis: ColumnAxis = severalHarnesses ? axisChoice : "settings";
  // A harness chosen on one result set stays chosen on the next; a set without it shows its first.
  const harness =
    harnessChoice !== null &&
    (harnessesWithResults.some((h) => h.id === harnessChoice) ||
      (severalHarnesses && harnessChoice === BEST_HARNESS) ||
      (hasAverage && harnessChoice === AVERAGE_HARNESS))
      ? harnessChoice
      : harnessesWithResults[0]?.id ?? BARE_HARNESS;
  const setting: TaskSettingFilter = settingsWithResults.some((s) => s.id === filters.taskSetting) ? filters.taskSetting : "all";
  const harnessOption = harnessesWithResults.find((h) => h.id === harness);
  const settingOption = settingsWithResults.find((s) => s.id === setting);

  // One view drives the chart and the table. Rows are one per model, with every run of the
  // model; the search narrows the table only, so a model keeps its rank while it is searched for.
  const rows = buildRows(models, { ...filters, search: "", taskSetting: "all", harness: [], category: "general" }).filter(
    (row) => access === "all" || row.best.isOpenWeights === (access === "open"),
  );
  const ranked = rankRows(rows, harness, setting);
  // The tasks of a setting: the most that any run has of them, scored or not.
  const tasksIn = (settingId: string): number =>
    Math.max(
      0,
      ...models.map((model) => {
        const stats = model.taskSettings?.[settingId as TaskSettingId];
        return stats ? Math.round(stats.samples + stats.skipped + stats.unscored) : 0;
      }),
    );
  const columns = boardColumns(axis, settingsWithResults, harnessesWithResults, harness, setting, tasksIn, hasAverage);
  const selectedKey = axis === "settings" ? setting : harness;
  const selectColumn = (key: string) => {
    if (axis === "settings") setFilters({ ...filters, taskSetting: key as TaskSettingFilter });
    else setHarnessChoice(key);
  };

  // The caption says what a number is, then what the current view shows of it.
  const rankedBy = settingOption ? `the rate on the ${settingOption.code} tasks` : "the average";
  const view =
    axis === "settings"
      ? metric
        ? `Shown ${underHarness(harnessOption, harness)}, ranked by ${rankedBy}.`
        : `Success rate (%) ${underHarness(harnessOption, harness)}, in each task setting. Ranked by ${rankedBy}.`
      : metric
        ? `Shown ${settingOption ? `for the ${settingOption.code} tasks` : "as the average over the task settings"}, ranked by the rate ${underHarness(harnessOption, harness)}.`
        : `${rateIn(settingOption, " (%)")}, under each harness. Ranked by the rate ${underHarness(harnessOption, harness)}.`;
  const caption = metric ? `${metric} ${view}` : view;

  // The chart keeps one order of the models whatever is selected: by the average under the
  // board's first harness. A selection then changes which bars stand out, or which numbers the
  // bars show, and never which model stands where. (The table is a ranking, and re-sorts.)
  const orderHarness = harnessesWithResults[0];
  const chartOrder = rankRows(rows, orderHarness?.id ?? BARE_HARNESS, "all");
  const orderNote = `The models keep one order: by average success rate${severalHarnesses ? ` ${underHarness(orderHarness)}` : ""}.`;
  const averageNote = `Average weights the four task settings equally.${
    harness === BEST_HARNESS
      ? " It uses each model’s best overall harness; task-setting bars may use different harnesses."
      : harness === AVERAGE_HARNESS
        ? " Each bar is the mean of a model’s rates under the harnesses; no confidence interval is shown for it."
        : ""
  }`;
  const chartSubtitle =
    axis === "settings"
      ? `Task-setting and Average success rates ${underHarness(harnessOption, harness)}. ${averageNote} ${orderNote}`
      : `${rateIn(settingOption)} under each harness. ${orderNote}`;
  const search = filters.search.trim().toLowerCase();
  const charted = chartOrder
    .map(({ row }) => row)
    .filter((row) => !search || row.best.name.toLowerCase().includes(search) || row.best.provider.toLowerCase().includes(search));

  return (
    <div className="lbb" data-leaderboard-board data-axis={axis} data-harness={harness} data-setting={setting}>
      {/* The controls lead: they drive both the chart and the table under them. */}
      <LeaderboardControls
        setting={setting}
        onSettingChange={(taskSetting) => setFilters({ ...filters, taskSetting })}
        settings={settingsWithResults}
        harness={harness}
        onHarnessChange={setHarnessChoice}
        harnesses={availableHarnesses}
        hasAverage={hasAverage}
        unavailable={unavailableHarnesses}
        axis={axis}
        onAxisChange={setAxisChoice}
      />

      <Suspense fallback={<div className="lbch lbch-loading mv-card" aria-hidden />}>
        <LeaderboardChart
          rows={charted}
          runCount={runCount}
          columns={columns}
          selectedKey={selectedKey}
          axis={axis}
          subtitle={chartSubtitle}
          harnesses={harnessesWithResults}
        />
      </Suspense>

      <LeaderboardTable
        ranked={ranked}
        totalModels={totalModels}
        columns={columns}
        selectedKey={selectedKey}
        onSelectColumn={selectColumn}
        axis={axis}
        caption={caption}
        keyItems={[...columnKey(axis, columns), ...(models.some((model) => model.submission) ? [SUBMITTED_KEY] : [])]}
        harnesses={harnessesWithResults}
        filters={filters}
        onFiltersChange={setFilters}
        access={access}
        onAccessChange={setAccess}
        resetKey={`${boardKey}:${axis}:${harness}:${access}:${JSON.stringify(filters)}`}
        onSelectModel={onSelectModel}
      />
    </div>
  );
}
