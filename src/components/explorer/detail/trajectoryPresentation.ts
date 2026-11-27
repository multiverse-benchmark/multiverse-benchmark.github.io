import type { ReferenceTrajectoryStep } from "@/types";

/** How a step was recognised as a hint: by its marker, or by where it stands in the trajectory. */
export type HintSource = "marker" | "position";

export interface PresentedTrajectoryStep {
  step: ReferenceTrajectoryStep;
  index: number;
  kind: string;
  isHint: boolean;
  hintSource?: HintSource;
}

/** A leading source marker identifies a hint whatever its position. */
export function isExplicitHint(step: ReferenceTrajectoryStep): boolean {
  if (!["USER", "SYSTEM", "UNKNOWN", "UNSPECIFIED_ROLE"].includes(step.role)
    || !["user", "system", "text"].includes(step.action)) return false;
  return /^\s*(?:\[(?:SYSTEM HINT|HINT)\]|\*\*\[(?:SYSTEM HINT|HINT)\]\*\*)(?:\s|$)/i
    .test(step.content ?? "");
}

const isUserMessage = (step: ReferenceTrajectoryStep) => step.role === "USER" && step.action === "user" && Boolean(step.content?.trim());

/**
 * A display-only projection: source objects, roles, and numbering are retained.
 *
 * Hints. A gold trajectory stores a hint as a user message, and most hints
 * carry no marker. Besides the marked ones, a user message after the task's
 * query is shown as a hint
 *   - in a single-turn task, always: the task has no other user turn;
 *   - in a multi-turn task, when it does not follow a message of the agent:
 *     the user of the task speaks in reply to the agent, so a user message
 *     that arrives while the agent is still calling tools is a hint.
 * A hint that directly follows a message of the agent in a multi-turn task
 * cannot be told from a turn of the user and stays a user message.
 */
export function presentGoldTrajectory(steps: ReferenceTrajectoryStep[], options: { singleTurn?: boolean } = {}): {
  visible: PresentedTrajectoryStep[];
  duplicates: PresentedTrajectoryStep[];
} {
  const first = steps[0];
  const systemText = first?.content?.trim();
  let duplicateEnd = 1;
  if (first?.role === "SYSTEM" && first.action === "system" && systemText) {
    while (duplicateEnd < steps.length) {
      const candidate = steps[duplicateEnd];
      // Ignore only the known export wrapper and boundary whitespace. Internal
      // formatting, words, and case must match; other payloads stay visible.
      const onlyText = [candidate.tool, candidate.input, candidate.output,
        candidate.reasoning, candidate.code, candidate.codeOutput]
        .every((value) => value === undefined || value === null || value === "");
      const candidateText = candidate.content?.trim()
        .replace(/^\*\*\[SYSTEM\]\*\*\s*/, "").trim();
      if (candidate.role !== "USER" || candidate.action !== "user" || !onlyText
        || candidateText !== systemText) break;
      duplicateEnd += 1;
    }
  }

  // The query is the first user message after the system prompt and its copies.
  const queryIndex = steps.findIndex((step, index) => index >= (first?.role === "SYSTEM" ? duplicateEnd : 0) && isUserMessage(step) && !isExplicitHint(step));
  const entries = steps.map((step, index): PresentedTrajectoryStep => {
    let hintSource: HintSource | undefined;
    if (isExplicitHint(step)) hintSource = "marker";
    else if (queryIndex >= 0 && index > queryIndex && isUserMessage(step) && !step.content!.trimStart().startsWith("USER_QUERY:")
      && (options.singleTurn || steps[index - 1]?.action !== "response")) hintSource = "position";
    return { step, index, isHint: hintSource !== undefined, hintSource, kind: hintSource ? "hint" : step.action };
  });
  return {
    visible: entries.filter((_, index) => index === 0 || index >= duplicateEnd),
    duplicates: entries.slice(1, duplicateEnd),
  };
}
