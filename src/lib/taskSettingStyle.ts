/*
 * Copyright (c) MLCommons and its affiliates.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import type { TaskSettingFilter } from "@/types/platform";

/**
 * One colour per task setting, shared by the filter tabs and the chart bars.
 * They are the project page's own role colours (src/components/paper/paper.css),
 * so the leaderboard reads as part of the page.
 */
export const SETTING_COLORS: Record<TaskSettingFilter, string> = {
  all: "var(--mv-ink-2)",
  "single-turn": "var(--mv-realism)",
  "multi-turn": "var(--mv-user)",
  "instruction-following": "var(--mv-trust)",
  "multi-turn-instruction-following": "var(--mv-task)",
};

export const SETTING_ICONS: Record<TaskSettingFilter, LucideIcon> = {
  all: LayoutGrid,
  "single-turn": MessageSquare,
  "multi-turn": MessagesSquare,
  "instruction-following": ListChecks,
  "multi-turn-instruction-following": ListChecks,
};

/**
 * One colour per harness, for the chart that compares harnesses. The bare
 * harness, the reference the others are read against, is neutral; the four
 * end-user harnesses take the page's role colours.
 */
export const HARNESS_COLORS: Record<string, string> = {
  none: "var(--mv-ink-3)",
  hermes: "var(--mv-task)",
  opencode: "var(--mv-user)",
  openhands: "var(--mv-trust)",
  openclaw: "var(--mv-realism)",
};

/** Short names of the harnesses, for the tag beside a number in the "Best harness" view. */
export const HARNESS_ABBR: Record<string, string> = {
  none: "B",
  hermes: "H",
  opencode: "OC",
  openhands: "OH",
  openclaw: "OCl",
};
