#!/usr/bin/env python3
"""Export the runs behind the v1.1.0 validation leaderboard for the project page.

The leaderboard of v1.1.0 reports one scored trajectory per model and task
under the bare harness (scripts/export_leaderboard.py). This script exports
those trajectories themselves for the 400 validation tasks: for every model
and task, what each verifier decided and what the agent did.

Only the validation set is exported. The test tasks are hidden, so no record
of a test run may reach the site, and this script refuses any other split.

Inputs:
  --validation  the result export of the validation set, the same file the
                leaderboard is built from (its hash must equal the one that
                src/data/leaderboard.v1.1.0.json records)
  --records     the folder that holds the result record of every run
                (results/validation/<model>/<task>.json.gz) and the stored
                outcome of every assertion that was evaluated on a saved final
                state (evidence/assertions/runs/<run>/evidence/result.json)
  --text-edits  optional: a JSON file of exact replacements in the text of the
                runs of named tasks ({task id: [[text, replacement], ...]}),
                applied in order to the messages, the recorded thoughts, the
                rationales, the assertion message and the final response.
                Tool calls and their outputs are never changed. The file is
                not part of this repository.

A run counts as the result export says: it passes when the assertion code and
every applicable LLM verifier pass, and an LLM verifier's verdict is the
majority of its votes. The export is the source of every verdict shown. The
result record supplies the votes with their rationales, the assertion message
and the trajectory, and each of its verdicts is checked against the export.

Output, under public/data/v1.1.0/runs/:
  index.json                  one cell per task and model: the outcome and the
                              verdict of each verifier
  <model>/<task>.json.gz      one run: the verifiers with their votes, the
                              steps of the trajectory, the final response

A step has the shape of a gold trajectory step in the task files
(scripts/vendor/explorer_helpers.py), so the task explorer shows both with the
same component. Request signatures, token counts and other provider metadata
of the stored messages are not exported.

A run is a trajectory of an attempt at a task, so each run file carries the
contamination canary of its task (contaminationCanary), as the task files do.

The input files are not part of this repository, so their paths are
arguments. `--validate-only` re-checks the exported files without them.

Example:
  python3 scripts/export_runs.py \
    --validation /path/to/MultiVerse-validation-400-bare-results.json \
    --records /path/to/records
  python3 scripts/export_runs.py --validate-only
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import multiprocessing
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v1.1.0"
SPLIT = "validation"
HARNESS = "bare"
DATA = ROOT / "public" / "data" / RELEASE
OUT = DATA / "runs"
LEADERBOARD = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.json"
TASK_SETTINGS = ("ST", "IF", "MT", "MTIF")

# The verifiers in the order the page lists them: the id used on the page, the
# field of the result export that holds the verdict, and the name of the
# verifier in a result record (None for the deterministic assertion code).
VERIFIERS = (
    ("assertion", "assertionPassed", None),
    ("dbdiff", "dbJudgePassed", "dblevel"),
    ("response", "responseJudgePassed", "inspection"),
    ("instruction", "instructionJudgePassed", "rubrics"),
)
VERIFIER_IDS = tuple(verifier for verifier, _, _ in VERIFIERS)
TERMINATIONS = ("completed", "context_window", "malformed", "output_limit", "policy_block")
# Text that would name a working document or a file of the machine that made
# the export must not be exported. (A path alone is not a sign of one: the
# simulated services hold file paths of their own.)
WORKING_DOCUMENTS = ("colab.research.google.com",)


def forbidden_text(*inputs: Path) -> tuple[str, ...]:
    return (*WORKING_DOCUMENTS, str(Path.home()), *(str(path.resolve()) for path in inputs))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def cell_code(passed: bool, verdicts: list[bool | None]) -> str:
    """Five characters: the outcome of the run, then one verdict per verifier (p, f, or n for not applicable)."""
    return ("P" if passed else "F") + "".join("n" if verdict is None else "p" if verdict else "f" for verdict in verdicts)


# ---------------------------------------------------------------------------
# Trajectory
# ---------------------------------------------------------------------------
def reasoning_of(message: dict) -> str:
    """The reasoning text a provider returned with a message, whatever field it uses."""
    texts: list[str] = []
    content = message.get("content")
    if isinstance(content, list):
        texts += [part.get("thinking") or "" for part in content if isinstance(part, dict) and part.get("type") == "thinking"]
    details = message.get("reasoning_details") or []
    for item in details:
        if isinstance(item, dict):
            texts.append(item.get("text") or item.get("summary") or "")
    if not details:
        for item in message.get("summary") or []:
            if isinstance(item, dict):
                texts.append(item.get("text") or "")
    for item in message.get("responses_output") or []:
        if isinstance(item, dict) and item.get("type") == "reasoning":
            for part in item.get("summary") or []:
                if isinstance(part, dict):
                    texts.append(part.get("text") or "")
    return "\n\n".join(text.strip() for text in texts if isinstance(text, str) and text.strip())


def text_of(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    return "\n\n".join(
        part.get("text") or "" for part in content or [] if isinstance(part, dict) and part.get("type") == "text"
    )


def steps_of(messages: list[dict]) -> list[dict]:
    """The stored messages of a run as steps, in the shape of gold trajectory steps."""
    steps: list[dict] = []

    def add(**entry) -> None:
        steps.append({"step": len(steps) + 1, **entry})

    for event in messages:
        kind, message = event.get("type"), event.get("data") or {}
        if kind == "system":
            add(role="SYSTEM", action="system", content=message.get("content") or "")
        elif kind == "human":
            # The conversation ends with an empty message of the simulated user.
            if message.get("content"):
                add(role="USER", action="user", content=message["content"])
        elif kind == "ai":
            reasoning = reasoning_of(message)
            if reasoning:
                add(role="MODEL", action="thought", content=reasoning, reasoning=reasoning)
            text = text_of(message)
            if text.strip():
                add(role="MODEL", action="response", content=text)
            for call in message.get("tool_calls") or []:
                add(role="MODEL", action="tool_use", tool=call.get("name") or "", input=call.get("args"))
        elif kind == "tool":
            add(role="FUNCTION", action="tool_result", tool=message.get("name") or "", output=message.get("content"))
        elif kind is not None:
            raise ValueError(f"unknown message type {kind!r}")
    return steps


# ---------------------------------------------------------------------------
# Verifiers
# ---------------------------------------------------------------------------
def vote_text(dimension: str, result) -> str:
    """The rationale of one vote. The final-response verifier answers in JSON; its explanation is the rationale."""
    if not isinstance(result, str):
        return "" if result is None else json.dumps(result, ensure_ascii=False)
    if dimension == "inspection":
        try:
            parsed = json.loads(result)
        except ValueError:
            return result
        if isinstance(parsed, dict) and isinstance(parsed.get("rating_explanation"), str):
            return parsed["rating_explanation"]
    return result


def llm_verifier(record: dict, verifier: str, dimension: str, verdict: bool) -> dict:
    votes = []
    for vote in record.get("autorater_votes") or []:
        entry = vote.get(dimension)
        if isinstance(entry, dict) and isinstance(entry.get("outcome"), bool):
            votes.append({"passed": entry["outcome"], "text": vote_text(dimension, entry.get("result"))})
    if not votes:
        # A record with one vote stores it without the list.
        outcome = record.get(f"autorater_{dimension}_outcome")
        assert isinstance(outcome, bool), f"{verifier}: no vote in the record"
        votes.append({"passed": outcome, "text": vote_text(dimension, record.get(f"autorater_{dimension}_result"))})
    passing = sum(vote["passed"] for vote in votes)
    assert (passing * 2 > len(votes)) is verdict, f"{verifier}: the majority of the votes is not the verdict of the result export"
    # The rationale shown first is the one the record names, or the first vote that agrees with the verdict.
    named = record.get(f"autorater_{dimension}_majority_pass")
    shown = named - 1 if isinstance(named, int) and 0 < named <= len(votes) and votes[named - 1]["passed"] is verdict else None
    if shown is None:
        shown = next(index for index, vote in enumerate(votes) if vote["passed"] is verdict)
    return {"id": verifier, "applicable": True, "passed": verdict, "shown": shown, "votes": votes}


def assertion_verifier(record: dict, row: dict, replayed: dict | None) -> dict:
    verdict = row["assertionPassed"]
    assert isinstance(verdict, bool), "no assertion verdict"
    if replayed is not None:
        assert replayed["outcome"] is verdict, "the stored assertion outcome is not the verdict of the result export"
        message = replayed.get("message") or ""
    else:
        assert record.get("final_assertion_outcome") is verdict, "the record's assertion outcome is not the verdict of the result export"
        errors = record.get("final_assertion_errors") or []
        message = "\n".join(str(error) for error in errors) if isinstance(errors, list) else str(errors)
    entry = {"id": "assertion", "applicable": True, "passed": verdict}
    if not verdict and message.strip():
        entry["message"] = message.strip()
    return entry


def run_of(
    record: dict, row: dict, replayed: dict | None, canary: str, *, harness: str = HARNESS,
    terminations: tuple[str, ...] | None = TERMINATIONS,
) -> dict:
    """One run as the page shows it. The baselines ran under the bare harness and ended in one of TERMINATIONS.

    scripts/export_submission_runs.py converts the runs of a submitted entry with the same function: it
    names the harness of the entry and passes no list of terminations, because the check of a score file
    has already decided what a termination may be.
    """
    # A result record that carries a canary carries the one of its task.
    assert record.get("contamination_canary") in (None, canary), "the record carries the canary of another task"
    status = row["judgeDimensionStatus"]
    verifiers = []
    for verifier, field, dimension in VERIFIERS:
        verdict = row[field]
        if dimension is None:
            verifiers.append(assertion_verifier(record, row, replayed))
        elif verdict is None:
            assert status[dimension] == "not_applicable", f"{verifier}: no verdict although the verifier applies"
            verifiers.append({"id": verifier, "applicable": False})
        else:
            assert status[dimension] == "scored", f"{verifier}: a verdict although the verifier does not apply"
            verifiers.append(llm_verifier(record, verifier, dimension, verdict))
    passed = all(entry["passed"] for entry in verifiers if entry["applicable"])
    assert passed is row["passed"], "the verdicts do not give the outcome of the result export"
    assert terminations is None or row["terminationReason"] in terminations, f"unknown termination {row['terminationReason']!r}"
    steps = steps_of(record.get("model_logs") or [])
    assert steps, "no trajectory"

    def count(name: str) -> int | None:
        value = record.get(name)
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    return {
        "schemaVersion": 1,
        "release": RELEASE,
        "taskId": row["taskId"],
        "contaminationCanary": canary,
        "modelId": row["modelId"],
        "setting": row["setting"],
        "harness": harness,
        "passed": passed,
        "termination": row["terminationReason"],
        "verifiers": verifiers,
        "toolCalls": sum(step["action"] == "tool_use" for step in steps),
        "modelCalls": count("number_of_model_calls"),
        "turns": count("number_of_turns"),
        "finalResponse": record.get("final_response_text") or "",
        "steps": steps,
    }


# ---------------------------------------------------------------------------
# Reading the inputs
# ---------------------------------------------------------------------------
VERDICT_FIELDS = (
    "setting", "passed", "assertionPassed", "dbJudgePassed", "instructionJudgePassed", "responseJudgePassed",
    "judgeDimensionStatus", "terminationReason",
)


def folder_rows(records: Path) -> dict[tuple[str, str], dict]:
    """The folder's own list of its records: where each one is, its hash, and the verdicts it was selected with."""
    listing = json.loads((records / "scores" / f"MultiVerse-{SPLIT}-400-{HARNESS}-results.json").read_text())
    return {(row["taskId"], row["modelId"]): row for row in listing["taskResults"]}


def in_folder(row: dict, listed: dict) -> bool:
    """Whether the run of the result export is the folder's record of that task and model.

    It is when the export names the same file hash. An export row without a
    hash is the folder's record when both carry the same verdicts. A row with
    another hash is a run that replaced the folder's; its record is the file
    the export names.
    """
    selected = (row.get("sourceResult") or {}).get("sha256")
    if selected is None:
        assert all(row[field] == listed[field] for field in VERDICT_FIELDS), "the folder's record carries other verdicts"
        return True
    return selected == listed["sourceResult"]["sha256"]


def record_bytes(row: dict, records: Path, listed: dict) -> bytes:
    """The result record of a run: the folder's record, or the file the export names for a run that replaced it."""
    if in_folder(row, listed):
        data = gzip.decompress((records / listed["sourceResult"]["path"]).read_bytes())
        assert sha256_bytes(data) == listed["sourceResult"]["sha256"], "the folder's record does not have its listed hash"
    else:
        source = row["sourceResult"]
        assert source.get("kind") == "native_result", "a replaced run without a result file"
        data = Path(source["path"]).read_bytes()
        assert sha256_bytes(data) == source["sha256"], "the record is not the one the result export selected"
    return data


def replayed_assertion(row: dict, records: Path, listed: dict) -> dict | None:
    """The stored outcome of the assertion code on the saved final state of a run, where one exists."""
    replay = row.get("assertionReplay")
    if not replay:
        return None
    assert in_folder(row, listed) and listed.get("assertionReplay"), "a stored assertion outcome for a run outside the folder"
    path = records / listed["assertionReplay"]["bundledEvidence"]["relative_path"]
    assert sha256(path) == replay["result_sha256"], "the stored assertion outcome is not the one the result export names"
    matches = [entry for entry in json.loads(path.read_text())["comparisons"] if entry["model"] == row["modelId"]]
    assert len(matches) == 1, "no single stored assertion outcome for this model"
    return matches[0]["candidate"]


def edit_text(run: dict, edits: list[list[str]]) -> int:
    """Apply the replacements of --text-edits to the text of a run, in order. Returns how many were made.

    The text is what the system, the user, the agent and the judges wrote: the
    messages and thoughts of the trajectory, the final response, the
    rationales, and the assertion message. Tool calls and their outputs are
    left as they are.
    """
    made = 0

    def edited(text):
        nonlocal made
        if not isinstance(text, str):
            return text
        for old, new in edits:
            count = text.count(old)
            if count:
                made += count
                text = text.replace(old, new)
        return text

    for step in run["steps"]:
        if step["action"] in ("system", "user", "thought", "response"):
            for field in ("content", "reasoning"):
                if field in step:
                    step[field] = edited(step[field])
    run["finalResponse"] = edited(run["finalResponse"])
    for verifier in run["verifiers"]:
        if "message" in verifier:
            verifier["message"] = edited(verifier["message"])
        for vote in verifier.get("votes", []):
            vote["text"] = edited(vote["text"])
    return made


def write_run(arguments: tuple[dict, dict, str, str, tuple[str, ...], list[list[str]], str]) -> dict:
    row, listed, records, out, forbidden_strings, edits, canary = arguments
    try:
        record = json.loads(record_bytes(row, Path(records), listed))
        run = run_of(record, row, replayed_assertion(row, Path(records), listed), canary)
    except Exception as error:
        raise RuntimeError(f"{row['modelId']} / {row['taskId']}: {error}") from error
    replacements = edit_text(run, edits) if edits else 0
    text = json.dumps(run, ensure_ascii=False, separators=(",", ":"))
    for forbidden in forbidden_strings:
        assert forbidden not in text, f"{row['modelId']} / {row['taskId']}: the run contains {forbidden!r}"
    data = gzip.compress(text.encode("utf-8"), compresslevel=9, mtime=0)
    target = Path(out) / row["modelId"] / f"{row['taskId']}.json.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {
        "taskId": row["taskId"], "modelId": row["modelId"], "bytes": len(data), "steps": len(run["steps"]),
        "replacements": replacements,
        "code": cell_code(run["passed"], [entry.get("passed") if entry["applicable"] else None for entry in run["verifiers"]]),
    }


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
def page_tasks() -> dict[str, str]:
    """The setting of every validation task of the release, from the page's task list."""
    return {task["id"]: task["taskType"] for task in json.loads((DATA / "tasks.json").read_text())}


def page_canaries() -> dict[str, str]:
    """The contamination canary of every validation task of the release, from the page's task list."""
    canaries = {task["id"]: task["contaminationCanary"] for task in json.loads((DATA / "tasks.json").read_text())}
    prefix = json.loads((DATA / "manifest.json").read_text())["canary"]["benchmarkPrefix"]
    assert all(canary.startswith(prefix + "-") for canary in canaries.values()), "a task without the benchmark's canary"
    assert len(set(canaries.values())) == len(canaries), "two tasks share a canary"
    return canaries


def validate_index(index: dict) -> list[str]:
    """Check the index against the task list and the leaderboard of the page."""
    assert index["release"] == RELEASE and index["split"] == SPLIT and index["harness"] == HARNESS
    assert tuple(index["verifiers"]) == VERIFIER_IDS
    leaderboard = json.loads(LEADERBOARD.read_text())
    assert index["input"]["sha256"] == leaderboard["inputs"][SPLIT]["sha256"], "the runs and the leaderboard come from different result exports"
    board = leaderboard["sets"][SPLIT]
    models = [model["id"] for model in board["models"]]
    assert index["models"] == models, "the models differ from the leaderboard's, or their order does"
    tasks = page_tasks()
    assert set(index["cells"]) == set(tasks), "the tasks differ from the task list of the release"
    passed: Counter = Counter()
    for task, cells in index["cells"].items():
        assert len(cells) == len(models), f"{task}: {len(cells)} cells"
        setting = tasks[task]
        for model, code in zip(models, cells):
            assert len(code) == 5 and code[0] in "PF" and set(code[1:]) <= set("pfn"), f"{task} / {model}: cell {code!r}"
            verdicts = code[1:]
            assert verdicts[0] != "n" and verdicts[1] != "n", f"{task} / {model}: the assertion code and the DB-diff verifier always apply"
            assert (code[0] == "P") == ("f" not in verdicts), f"{task} / {model}: the outcome does not follow from the verdicts"
            if setting in ("ST", "MT"):
                assert verdicts[3] == "n", f"{task} / {model}: an instruction verdict on a task without instructions"
            passed[(model, setting)] += code[0] == "P"
    for model in models:
        for setting in TASK_SETTINGS:
            cell = board["results"][setting][model][HARNESS]
            assert passed[(model, setting)] == cell["passed"], (
                f"{model} / {setting}: {passed[(model, setting)]} passed runs, the leaderboard says {cell['passed']}"
            )
        total = sum(passed[(model, setting)] for setting in TASK_SETTINGS)
        assert total == board["results"]["Average"][model][HARNESS]["passed"], f"{model}: total of passed runs"
    for task, by_model in index["terminations"].items():
        for model, reason in by_model.items():
            assert task in tasks and model in models and reason in TERMINATIONS[1:], f"termination of {task} / {model}"
    return [f"{len(tasks)} tasks x {len(models)} models; {sum(passed.values())} passed runs, as on the leaderboard"]


def validate_files(index: dict) -> list[str]:
    """Check every run file against its cell of the index."""
    models = index["models"]
    canaries = page_canaries()
    files = sorted(path.relative_to(OUT).as_posix() for path in OUT.glob("*/*.json.gz"))
    expected = sorted(f"{model}/{task}.json.gz" for task in index["cells"] for model in models)
    assert files == expected, "the run files are not exactly one per cell of the index"
    total = steps = 0
    for task, cells in index["cells"].items():
        for model, code in zip(models, cells):
            data = (OUT / model / f"{task}.json.gz").read_bytes()
            total += len(data)
            text = gzip.decompress(data).decode("utf-8")
            for forbidden in forbidden_text():
                assert forbidden not in text, f"{model} / {task}: the run contains {forbidden!r}"
            run = json.loads(text)
            assert (run["taskId"], run["modelId"], run["release"], run["harness"]) == (task, model, RELEASE, HARNESS)
            assert run["contaminationCanary"] == canaries[task], f"{model} / {task}: the run does not carry the canary of its task"
            assert text.count("MULTIVERSE-CANARY-") == 1, f"{model} / {task}: a canary occurs inside the run's content"
            assert [entry["id"] for entry in run["verifiers"]] == list(VERIFIER_IDS)
            verdicts = [entry.get("passed") if entry["applicable"] else None for entry in run["verifiers"]]
            assert cell_code(run["passed"], verdicts) == code, f"{model} / {task}: the run and the index disagree"
            for entry in run["verifiers"][1:]:
                if entry["applicable"]:
                    votes = [vote["passed"] for vote in entry["votes"]]
                    assert (sum(votes) * 2 > len(votes)) is entry["passed"] and votes[entry["shown"]] is entry["passed"]
            assert run["termination"] == index["terminations"].get(task, {}).get(model, "completed")
            assert run["steps"] and [step["step"] for step in run["steps"]] == list(range(1, len(run["steps"]) + 1))
            steps += len(run["steps"])
    assert total == index["bytes"], "the size of the run files differs from the index"
    return [f"{len(files)} run files, {steps:,} steps, {total / 1e6:.1f} MB"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--validation", type=Path, help="the result export of the validation set")
    parser.add_argument("--records", type=Path, help="the folder with the result records and the stored assertion outcomes")
    parser.add_argument("--text-edits", type=Path, metavar="FILE", help="exact replacements in the text of the runs of named tasks")
    parser.add_argument("--workers", type=int, default=4, help="number of records read at a time")
    parser.add_argument("--validate-only", action="store_true", help="check the exported files without the inputs")
    args = parser.parse_args()

    if not args.validate_only:
        if args.validation is None or args.records is None:
            parser.error("--validation and --records are required (or use --validate-only)")
        export = json.loads(args.validation.read_text())
        assert export["split"] == SPLIT, "only the validation set may be exported: the test tasks are hidden"
        assert [harness["id"] for harness in export["harnesses"]] == [HARNESS]
        rows = export["taskResults"]
        assert all(row["scored"] and row["harness"] == HARNESS for row in rows), "an unscored run or another harness"
        tasks = page_tasks()
        for row in rows:
            assert tasks.get(row["taskId"]) == row["setting"], f"{row['taskId']}: not a task of the release, or another setting"
        models = [model["id"] for model in export["models"]]
        assert len(rows) == len(tasks) * len(models) == len({(row["taskId"], row["modelId"]) for row in rows})

        listed = folder_rows(args.records)
        staging = OUT.with_name("runs.new")
        shutil.rmtree(staging, ignore_errors=True)
        forbidden_strings = forbidden_text(args.records, args.validation.parent)
        text_edits = json.loads(args.text_edits.read_text()) if args.text_edits else {}
        assert set(text_edits) <= set(tasks), "--text-edits names a task that is not in the release"
        canaries = page_canaries()
        jobs = [
            (
                row, listed[(row["taskId"], row["modelId"])], str(args.records), str(staging), forbidden_strings,
                text_edits.get(row["taskId"], []), canaries[row["taskId"]],
            )
            for row in rows
        ]
        with multiprocessing.Pool(args.workers) as pool:
            written = pool.map(write_run, jobs, chunksize=8)
        if text_edits:
            edited_runs = [entry for entry in written if entry["replacements"]]
            print(f"  --text-edits: {sum(entry['replacements'] for entry in edited_runs):,} replacements in {len(edited_runs):,} runs of {len({entry['taskId'] for entry in edited_runs})} tasks")
        by_cell = {(entry["taskId"], entry["modelId"]): entry for entry in written}
        terminations: dict[str, dict[str, str]] = {}
        for row in rows:
            if row["terminationReason"] != "completed":
                terminations.setdefault(row["taskId"], {})[row["modelId"]] = row["terminationReason"]
        index = {
            "schemaVersion": 1,
            "release": RELEASE,
            "split": SPLIT,
            "harness": HARNESS,
            "generatedBy": "scripts/export_runs.py",
            "input": {"file": args.validation.name, "sha256": sha256(args.validation)},
            "models": models,
            "verifiers": list(VERIFIER_IDS),
            "cells": {task: [by_cell[(task, model)]["code"] for model in models] for task in sorted(tasks)},
            "terminations": {task: terminations[task] for task in sorted(terminations)},
            "bytes": sum(entry["bytes"] for entry in written),
        }
        for note in validate_index(index):
            print(f"  {note}")
        (staging / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n")
        shutil.rmtree(OUT, ignore_errors=True)
        staging.rename(OUT)
        print(f"Wrote {OUT.relative_to(ROOT)}")

    index = json.loads((OUT / "index.json").read_text())
    for note in validate_index(index) + validate_files(index):
        print(f"  {note}")
    print(f"The runs of the {RELEASE} validation leaderboard are consistent with the leaderboard and the task list.")


if __name__ == "__main__":
    main()
