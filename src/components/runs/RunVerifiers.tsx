import { Check, ChevronRight, Minus, X } from "lucide-react";
import type { Run, RunVerifier, RunVote, Verdict } from "@/lib/runs";
import { DetailSection, TextPanel } from "@/components/explorer/detail/DetailPrimitives";
import { RUNS_COPY, VERIFIER_COPY } from "./copy";

/*
 * What each verifier decided about one run.
 *
 * First the four verifiers side by side, each with its verdict and, for an
 * LLM judge, how its votes fell. Then one disclosure per verifier that
 * applied: the message of the failed assertion, or the rationale of a vote
 * that agrees with the verdict and every vote.
 */

export const verdictOf = (verifier: RunVerifier): Verdict => (!verifier.applicable ? "na" : verifier.passed ? "pass" : "fail");

const VERDICT_TEXT: Record<Verdict, string> = { pass: "Passed", fail: "Failed", na: RUNS_COPY.notApplicable };
const VERDICT_TONE: Record<Verdict, string> = {
  pass: "text-[var(--mv-pass)] bg-[var(--mv-pass-tint)]",
  fail: "text-[var(--mv-fail)] bg-[var(--mv-fail-tint)]",
  na: "text-slate-500 bg-slate-100",
};

/** The mark of a verdict: a check, a cross, or a dash where the verifier did not apply. */
export function VerdictMark({ verdict, label, size = "h-5 w-5" }: { verdict: Verdict; label?: string; size?: string }) {
  const Icon = verdict === "pass" ? Check : verdict === "fail" ? X : Minus;
  return <span role="img" aria-label={label ?? VERDICT_TEXT[verdict]} className={`inline-flex shrink-0 items-center justify-center rounded-full ${size} ${VERDICT_TONE[verdict]}`}>
    <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
  </span>;
}

/** Whether the run as a whole passed. */
export function OutcomePill({ passed }: { passed: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${VERDICT_TONE[passed ? "pass" : "fail"]}`}>
    {passed ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
    {passed ? "Passed" : "Failed"}
  </span>;
}

const voteTally = (votes: RunVote[]) => {
  const passing = votes.filter(vote => vote.passed).length;
  return `${passing} of ${votes.length} votes pass`;
};

function VerifierCard({ verifier }: { verifier: RunVerifier }) {
  const copy = VERIFIER_COPY[verifier.id];
  const verdict = verdictOf(verifier);
  const split = verifier.votes ? new Set(verifier.votes.map(vote => vote.passed)).size > 1 : false;
  return <li data-run-verifier={verifier.id} data-verdict={verdict} className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-900">{copy.name}</h4>
        <p className="text-[11px] text-slate-500">{copy.kind}</p>
      </div>
      <VerdictMark verdict={verdict} />
    </div>
    <p className="text-sm font-medium text-slate-800">{VERDICT_TEXT[verdict]}</p>
    {verifier.votes && <p className="text-xs text-slate-500">{voteTally(verifier.votes)}{split && " (not unanimous)"}</p>}
    {verdict === "na" && <p className="text-xs leading-relaxed text-slate-500">{NOT_APPLICABLE[verifier.id] ?? "This task has nothing for this verifier to check."}</p>}
  </li>;
}

const NOT_APPLICABLE: Partial<Record<RunVerifier["id"], string>> = {
  response: "This task has no reference response to compare the final message with.",
  instruction: "This task has no developer/user instructions.",
};

function Vote({ vote, index, total }: { vote: RunVote; index: number; total: number }) {
  return <details className="group min-w-0 rounded-xl border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      <VerdictMark verdict={vote.passed ? "pass" : "fail"} size="h-4 w-4" />
      Vote {index + 1} of {total}: {vote.passed ? "pass" : "fail"}
    </summary>
    <div className="px-3 pb-3"><TextPanel>{vote.text || <span className="italic text-slate-400">The judge gave no rationale.</span>}</TextPanel></div>
  </details>;
}

/* What a verifier found, behind a disclosure so that the trajectory stays close to the verdicts. */
function VerifierDetail({ verifier }: { verifier: RunVerifier }) {
  const copy = VERIFIER_COPY[verifier.id];
  const verdict = verdictOf(verifier);
  const what = verifier.votes ? "rationale and votes" : verifier.passed ? "result" : "message";
  return <details data-run-verifier-detail={verifier.id} className="group/verifier min-w-0 rounded-xl border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium text-slate-800 hover:text-slate-950 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open/verifier:rotate-90" aria-hidden="true" />
      <VerdictMark verdict={verdict} size="h-4 w-4" />
      {copy.name}: {VERDICT_TEXT[verdict].toLowerCase()}
      <span className="text-xs font-normal text-slate-500">{verifier.votes ? `${voteTally(verifier.votes)} · ` : ""}show the {what}</span>
    </summary>
    <div className="space-y-3 border-t border-slate-100 px-4 py-4">
      <p className="text-xs leading-relaxed text-slate-500">{copy.text}</p>
      {!verifier.votes
        ? verifier.passed
          ? <TextPanel>Every assertion held on the final service state.</TextPanel>
          : verifier.message
            ? <div className="space-y-1.5"><p className="text-xs font-medium text-slate-500">Message of the failed assertion</p><TextPanel>{verifier.message}</TextPanel></div>
            : <TextPanel>An assertion failed on the final service state. It carries no message.</TextPanel>
        : <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Rationale of vote {(verifier.shown ?? 0) + 1}, which agrees with the verdict</p>
            <TextPanel>{verifier.votes[verifier.shown ?? 0].text || <span className="italic text-slate-400">The judge gave no rationale.</span>}</TextPanel>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">All votes</p>
            {verifier.votes.map((vote, index) => <Vote key={index} vote={vote} index={index} total={verifier.votes!.length} />)}
          </div>
        </>}
    </div>
  </details>;
}

export function RunVerifiers({ run }: { run: Run }) {
  return <DetailSection title="Verifier results" description={RUNS_COPY.rule}>
    <ul className="grid grid-cols-2 gap-3" aria-label="Verdict of each verifier">
      {run.verifiers.map(verifier => <VerifierCard key={verifier.id} verifier={verifier} />)}
    </ul>
    <div className="space-y-2">
      {run.verifiers.filter(verifier => verifier.applicable).map(verifier => <VerifierDetail key={verifier.id} verifier={verifier} />)}
    </div>
  </DetailSection>;
}
