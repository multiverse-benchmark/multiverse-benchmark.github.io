/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Info } from "lucide-react";
import { Segmented, type SegmentedOption } from "@/components/paper/shared";
import { AVERAGE_HARNESS, BEST_HARNESS, type ColumnAxis } from "@/lib/leaderboardFilters";
import type { HarnessOption, TaskSettingFilter, TaskSettingOption } from "@/types/platform";

/** Something a reader can do from the note about the harnesses without results. */
export interface HarnessNoteAction {
  key: string;
  label: string;
  onSelect: () => void;
}

/**
 * What a board says about its harnesses without results, where it knows why
 * they have none and where results under them are. Without it, the board says
 * only that there are no results yet.
 */
export interface UnavailableHarnessCopy {
  /** The tooltip of one such harness. */
  title: (harness: string) => string;
  /** Its accessible name. */
  ariaLabel: (harness: string) => string;
  /** The note under the controls opens with this; `harnesses` is the list in words. */
  lead: (harnesses: string) => string;
  /** The rest of the note. */
  more?: string;
  actions?: HarnessNoteAction[];
}

interface LeaderboardControlsProps {
  setting: TaskSettingFilter;
  onSettingChange: (setting: TaskSettingFilter) => void;
  /** Task settings with results, in the paper's order. */
  settings: TaskSettingOption[];
  harness: string;
  onHarnessChange: (harness: string) => void;
  /**
   * Every harness the board is set up for. A harness without results yet is
   * shown and cannot be selected, so the board says which evaluations it is
   * prepared for before their scores are there.
   */
  harnesses: HarnessOption[];
  /** Whether the result set has each model's rate averaged over the harnesses; it is then offered before "Best harness". */
  hasAverage?: boolean;
  unavailable?: UnavailableHarnessCopy;
  axis: ColumnAxis;
  onAxisChange: (axis: ColumnAxis) => void;
}

const AXIS_OPTIONS: SegmentedOption<ColumnAxis>[] = [
  { value: "settings", label: "Task settings", title: "One column per task setting, for the selected harness" },
  { value: "harnesses", label: "Harnesses", title: "One column per harness, for the selected task setting" },
];

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * What the chart and the table below show. The controls come first because
 * they drive both: the task setting and the harness pick one number per model,
 * which ranks the models, and "Columns" picks the axis that the table and the
 * chart spread out.
 */
export function LeaderboardControls({
  setting,
  onSettingChange,
  settings,
  harness,
  onHarnessChange,
  harnesses,
  hasAverage = false,
  unavailable,
  axis,
  onAxisChange,
}: LeaderboardControlsProps) {
  const withResults = harnesses.filter((option) => option.models > 0);
  const withoutResults = harnesses.filter((option) => option.models === 0);
  // Comparing harnesses needs results under two of them.
  const comparable = withResults.length > 1;
  const missing = LIST.format(withoutResults.map((option) => option.label));

  const settingOptions: SegmentedOption<TaskSettingFilter>[] = [
    { value: "all", label: "Average", title: "The average over the task settings, each setting weighted equally" },
    ...settings.map((option) => ({
      value: option.id as TaskSettingFilter,
      label: option.code,
      ariaLabel: `${option.code}, ${option.label}`,
      title: `${option.label}: ${option.description}`,
    })),
  ];
  const harnessOptions: SegmentedOption<string>[] = [
    ...harnesses.map((option) =>
      option.models > 0
        ? { value: option.id, label: option.label }
        : {
            value: option.id,
            label: option.label,
            ariaLabel: unavailable?.ariaLabel(option.label) ?? `${option.label}, no results yet`,
            title: unavailable?.title(option.label) ?? `${option.label}: no results yet`,
            disabled: true,
          },
    ),
    ...(comparable && hasAverage
      ? [
          {
            value: AVERAGE_HARNESS,
            label: "Average",
            ariaLabel: "Average over the harnesses",
            title: "Each model’s success rate averaged over the harnesses",
          },
        ]
      : []),
    ...(comparable
      ? [
          {
            value: BEST_HARNESS,
            label: "Best harness",
            title: "For each number, the harness under which the model has its highest success rate",
          },
        ]
      : []),
  ];

  return (
    <div className="lbc" data-leaderboard-controls>
      <Segmented label="Task setting" options={settingOptions} value={setting} onChange={onSettingChange} />
      {harnesses.length > 1 && (
        <Segmented label="Harness" options={harnessOptions} value={harness} onChange={onHarnessChange} />
      )}
      {comparable && (
        <Segmented className="lbc-axis" label="Columns" options={AXIS_OPTIONS} value={axis} onChange={onAxisChange} />
      )}
      {harnesses.length > 1 && withoutResults.length > 0 && !unavailable && (
        <p className="lbc-note" data-leaderboard-harness-note>
          No results yet under {missing}.
        </p>
      )}
      {harnesses.length > 1 && withoutResults.length > 0 && unavailable && (
        // The dashed outline is that of the harnesses the note is about.
        <div className="lbc-note lbc-note-full" role="note" aria-label="Harnesses without results" data-leaderboard-harness-note>
          <Info className="lbc-note-icon" size={16} strokeWidth={1.9} aria-hidden />
          <div className="lbc-note-body">
            <p className="lbc-note-text">
              <span className="lbc-note-lead">{unavailable.lead(missing)}</span>
              {unavailable.more ? ` ${unavailable.more}` : null}
            </p>
            {unavailable.actions && unavailable.actions.length > 0 && (
              <p className="lbc-note-actions">
                {unavailable.actions.map((action) => (
                  <button key={action.key} type="button" className="lbc-note-action" data-leaderboard-harness-action={action.key} onClick={action.onSelect}>
                    {action.label}
                  </button>
                ))}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
