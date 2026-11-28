#!/usr/bin/env python3
"""Add the runs of the submitted entries to the run viewer of a built site.

The task explorer shows, in the "Trajectories" tab of a validation task, the
run of every entry of the leaderboard on that task: the verdict of each
verifier and the trajectory. The runs of the baselines are part of this
repository (public/data/v1.1.0/runs, written by scripts/export_runs.py). A
submitted entry brings its runs as a trajectory archive, which its score file
names by address and sha256 (submissions/v1.1.0/<entry>.json). This script
converts each archive to the run files the viewer reads and adds the entry to
the run index, so that a submitted entry can be browsed like a baseline.

It writes into a built site, never into public/:

  <site>/data/v1.1.0/runs/<entry>/<task>.json.gz   one run of the entry
  <site>/data/v1.1.0/runs/index.json               the baselines' index with one
                                                   more column per entry

A local build links the files of public/ into the site instead of copying
them, so nothing is changed in place: a run file is a new file, and the index
is written beside the old one and then takes its place.

For every committed score file of the release:
  1. The score file is checked (scripts/check_submission.py).
  2. Its trajectory archive is fetched from the address the score file gives,
     or read from a local file given with --archive. Either way the file must
     have the size and the sha256 the score file names.
  3. The archive is checked against the score file (scripts/submission_format.py),
     and every trajectory is converted with the functions that write the runs
     of the baselines (scripts/export_runs.py). The cell of each run in the
     index is the verdicts of the score file.

An archive that cannot be fetched is reported and its entry is left out: the
entry stays on the leaderboard, and its row links to the archive instead of
the explorer. That is not a failure of the script, so a host that is down
does not stop a deployment. An archive that was fetched and fails a check
stops the script with a failure, as does an index that fails its checks, and
the site is left as it was. With no committed score file the script does
nothing. In a workflow, what it prints is also written to the summary of the
step.

The deployment runs it with --keep-going: an entry whose archive is no longer
the file its score file names, fails a check, or cannot be converted is then
left out in the same way, with a warning on the workflow run, and nothing
about a submitted entry's trajectories stops the site from being deployed.
The check of a submission pull request converts the archive too
(scripts/check_submission.py), so such a problem shows before the entry is
merged.

It needs the Python standard library only, and is meant to run right after
the site is built.

Only validation tasks can appear: a score file holds the 400 validation tasks
of the release and no other task, and the index has a row for exactly those.

Usage:
  python3 scripts/export_submission_runs.py --site dist
  python3 scripts/export_submission_runs.py --site dist --archive my_model-bare=/path/to/archive.tar.gz
"""
from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

import check_submission
import export_runs
import submission_format as fmt

ROOT = Path(__file__).resolve().parents[1]
RELEASE = export_runs.RELEASE
# The runs inside a site, and the baselines' index in this repository.
RUNS = Path("data") / RELEASE / "runs"
BASE_INDEX = export_runs.OUT / "index.json"
GENERATED_BY = "scripts/export_submission_runs.py"
NO_ENTRIES = "No submitted entries: the run viewer has the baselines only."

VERDICT = {fmt.PASS: True, fmt.FAIL: False, fmt.NOT_APPLICABLE: None}
# A cut-off model output can end in half of a character pair, which UTF-8 cannot hold.
LONE_SURROGATE = re.compile("[\ud800-\udfff]")
CELL = re.compile(r"[PF][pfn]{4}")

Fetch = Callable[[str, int, str, object], "str | None"]


def check_name(dimension: str | None) -> str:
    """The check of a score file behind a verifier of export_runs.VERIFIERS."""
    return dimension or fmt.FINAL_ASSERTION


def row_of(task_id: str, task: dict, model_id: str) -> dict:
    """The result of one task in a score file, as the row of a result export that export_runs.run_of reads."""
    checks = task["checks"]
    row = {
        "taskId": task_id, "modelId": model_id, "setting": task["setting"], "passed": task["passed"],
        "terminationReason": task["termination"],
        "judgeDimensionStatus": {
            verifier: "not_applicable" if checks[verifier] == fmt.NOT_APPLICABLE else "scored" for verifier in fmt.VERIFIERS
        },
    }
    for _, field, dimension in export_runs.VERIFIERS:
        row[field] = VERDICT[checks[check_name(dimension)]]
    return row


def code_of(task: dict) -> str:
    """The cell of the run index that the verdicts of a score file give."""
    return export_runs.cell_code(task["passed"], [VERDICT[task["checks"][check_name(dimension)]] for _, _, dimension in export_runs.VERIFIERS])


def viewer_messages(logs: list[dict]) -> list[dict]:
    """The messages of a trajectory archive in the form export_runs.steps_of reads.

    An archive keeps the reasoning a provider returned outside the content of a
    message as one text (reasoning_text). A result record holds it as reasoning
    details, which is where steps_of looks for it.
    """
    messages = []
    for message in logs:
        data = dict(message["data"])
        reasoning = data.pop(fmt.REASONING_TEXT, None)
        if reasoning:
            data["reasoning_details"] = [{"text": reasoning}]
        messages.append({"type": message["type"], "data": data})
    return messages


def run_file(record: dict, row: dict, canary: str, harness: str) -> tuple[bytes, str]:
    """The run file of one trajectory record, and the cell its verdicts give."""
    record = {**record, "model_logs": viewer_messages(record.get("model_logs") or [])}
    run = export_runs.run_of(record, row, None, canary, harness=harness, terminations=None)
    code = export_runs.cell_code(run["passed"], [entry.get("passed") if entry["applicable"] else None for entry in run["verifiers"]])
    text = LONE_SURROGATE.sub("�", json.dumps(run, ensure_ascii=False, separators=(",", ":")))
    return gzip.compress(text.encode("utf-8"), compresslevel=9, mtime=0), code


def convert_archive(document: dict, archive, reference: dict, canaries: dict[str, str] | None, folder: Path) -> tuple[dict[str, str], int, list[str]]:
    """Check an archive against its score file and write the run of every task into `folder`.

    Returns the cell of every task, the size of the run files, and every problem found.
    `canaries` is the canary of every task from the page's task list; a record that carries
    another one is a problem. Without the list (None), each run keeps the canary of its record.
    """
    entry = document["entry"]
    model_id, harness = entry["model"]["id"], entry["harness"]
    codes: dict[str, str] = {}
    problems: list[str] = []
    size = 0

    def convert(task_id: str, record: dict) -> None:
        nonlocal size
        task = document["tasks"][task_id]
        try:
            canary = canaries[task_id] if canaries is not None else (record.get("contamination_canary") or "")
            data, code = run_file(record, row_of(task_id, task, model_id), canary, harness)
            assert code == code_of(task), "the run does not give the verdicts of the score file"
        except (AssertionError, ValueError, KeyError, TypeError, AttributeError) as error:
            if len(problems) < 40:
                problems.append(f"{task_id}: {error}")
            return
        (folder / f"{task_id}.json.gz").write_bytes(data)
        codes[task_id] = code
        size += len(data)

    errors = fmt.check_archive(document, archive, reference, on_member=convert)
    # A task that the check of the archive reports is reported once, with that problem.
    reported = {error.split(":", 1)[0] for error in errors}
    return codes, size, errors + [problem for problem in problems if problem.split(":", 1)[0] not in reported]


def local_archive_problem(path: Path, size: int, sha256: str) -> str | None:
    """Why a local file is not the archive a score file names, or None."""
    if not path.is_file():
        return f"{path} is not a file"
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1 << 20):
            digest.update(chunk)
    if path.stat().st_size != size or digest.hexdigest() != sha256:
        return f"{path} is not the archive the score file names (size or sha256 differs)"
    return None


def index_with(base: dict, entries: list[dict]) -> dict:
    """The baselines' index with one more column per converted entry, in the given order."""
    index = copy.deepcopy(base)
    index["models"] = base["models"] + [
        {"id": entry["id"], "modelId": entry["modelId"], "harness": entry["harness"], "name": entry["name"]} for entry in entries
    ]
    index["cells"] = {task: cells + [entry["codes"][task] for entry in entries] for task, cells in base["cells"].items()}
    terminations = copy.deepcopy(base["terminations"])
    for entry in entries:
        for task, reason in entry["terminations"].items():
            terminations.setdefault(task, {})[entry["id"]] = reason
    index["terminations"] = {task: terminations[task] for task in sorted(terminations)}
    index["bytes"] = base["bytes"] + sum(entry["bytes"] for entry in entries)
    index["submissions"] = {
        "generatedBy": GENERATED_BY,
        "entries": [
            {"id": entry["id"], "scoreFile": entry["scoreFile"], "archiveSha256": entry["archiveSha256"], "bytes": entry["bytes"]}
            for entry in entries
        ],
    }
    return index


def validate(index: dict, base: dict, entries: list[dict], reference: dict, staging: Path) -> None:
    """Checks that hold for the index of a site with submitted entries, and for their run files."""
    tasks = reference["tasks"]
    assert set(index["cells"]) == set(base["cells"]) == set(tasks), "the index does not have exactly the validation tasks of the release"
    width = len(base["models"])
    assert index["models"][:width] == base["models"], "the baselines' columns moved"
    ids = [entry["id"] for entry in entries]
    assert [model["id"] for model in index["models"][width:]] == ids and len(set(ids)) == len(ids)
    assert not set(ids) & {model if isinstance(model, str) else model["id"] for model in base["models"]}, "an entry has the id of a baseline"
    for task, cells in index["cells"].items():
        assert cells[:width] == base["cells"][task], f"{task}: a cell of a baseline changed"
        assert len(cells) == len(index["models"]), f"{task}: {len(cells)} cells for {len(index['models'])} entries"
        for entry, code in zip(entries, cells[width:]):
            assert CELL.fullmatch(code), f"{task} / {entry['id']}: cell {code!r}"
            verdicts = code[1:]
            assert verdicts[0] != "n" and verdicts[1] != "n", f"{task} / {entry['id']}: the assertion code and the DB-diff verifier always apply"
            assert (code[0] == "P") == ("f" not in verdicts), f"{task} / {entry['id']}: the outcome does not follow from the verdicts"
            if tasks[task]["setting"] in ("ST", "MT"):
                assert verdicts[3] == "n", f"{task} / {entry['id']}: an instruction verdict on a task without instructions"
    for entry in entries:
        for setting in fmt.SETTINGS:
            passed = sum(code[0] == "P" for task, code in entry["codes"].items() if tasks[task]["setting"] == setting)
            assert passed == entry["summary"][setting]["passed"], f"{entry['id']} / {setting}: {passed} passed runs, the score file says {entry['summary'][setting]['passed']}"
        files = sorted(path.name for path in (staging / entry["id"]).iterdir())
        assert files == sorted(f"{task}.json.gz" for task in tasks), f"{entry['id']}: the run files are not one per task"
    for task, by_entry in index["terminations"].items():
        assert task in tasks and all(name in {*ids, *base["models"]} for name in by_entry), f"termination of {task}"


def export(
    site: Path, submissions: list[tuple[str, dict]], archives: dict[str, Path], *,
    fetch: Fetch = check_submission.download_archive, say=print, keep_going: bool = False,
) -> dict | None:
    """Convert the archives of the given checked score files into `site`. Returns what was done, or None with no submissions.

    Exits with the problems of an archive that was fetched and fails a check; the site is then as it was.
    With `keep_going`, such an entry is left out like one whose archive cannot be fetched, and nothing stops the export.
    """
    if not submissions:
        say(NO_ENTRIES)
        return None
    runs = site / RUNS
    index_path = runs / "index.json"
    if not index_path.is_file():
        sys.exit(f"{site} is not a built site: it has no {RUNS / 'index.json'}")
    if runs.resolve() == export_runs.OUT.resolve():
        sys.exit("The runs of the submitted entries go into a built site, never into public/.")
    base = json.loads(BASE_INDEX.read_text())
    export_runs.validate_index(base)
    built = json.loads(index_path.read_text())
    if built.get("input") != base["input"] or built.get("models", [])[: len(base["models"])] != base["models"]:
        sys.exit(f"{site} was not built from the runs of this checkout: its run index differs from {BASE_INDEX.relative_to(ROOT)}")
    reference = check_submission.reference_for(RELEASE)
    canaries = export_runs.page_canaries()
    unknown = sorted(set(archives) - {document["entry"]["id"] for _, document in submissions})
    if unknown:
        sys.exit(f"--archive names {unknown[0]!r}, which is not a committed entry")

    staging = Path(tempfile.mkdtemp(prefix=".submission-runs-", dir=runs.parent))
    try:
        entries, skipped, failures = [], [], []

        def leave_out(entry_id: str, reasons: list[str]) -> None:
            more = f" (and {len(reasons) - 1} more)" if len(reasons) > 1 else ""
            skipped.append({"id": entry_id, "reason": reasons[0] + more})
            say(f"  {entry_id}: left out, {reasons[0]}{more}. Its row on the leaderboard links to the archive.")

        for relative, document in submissions:
            entry, trajectories = document["entry"], document["trajectories"]
            started = time.monotonic()
            folder = staging / entry["id"]
            folder.mkdir()
            with tempfile.TemporaryFile() as fetched:
                local = archives.get(entry["id"])
                if local is not None:
                    problem = local_archive_problem(local, trajectories["bytes"], trajectories["sha256"])
                else:
                    problem = fetch(trajectories["url"], trajectories["bytes"], trajectories["sha256"], fetched)
                if problem and (keep_going or (local is None and problem.startswith(check_submission.UNREACHABLE))):
                    leave_out(entry["id"], [problem])
                    continue
                if problem:
                    failures.append(f"{entry['id']}: {problem}")
                    continue
                if local is not None:
                    with local.open("rb") as archive:
                        codes, size, problems = convert_archive(document, archive, reference, canaries, folder)
                else:
                    fetched.seek(0)
                    codes, size, problems = convert_archive(document, fetched, reference, canaries, folder)
            if problems and keep_going:
                leave_out(entry["id"], problems)
                continue
            if problems:
                failures += [f"{entry['id']}: {problem}" for problem in problems]
                continue
            entries.append({
                "id": entry["id"], "modelId": entry["model"]["id"], "harness": entry["harness"], "name": entry["model"]["name"],
                "scoreFile": relative, "archiveSha256": trajectories["sha256"], "codes": codes, "bytes": size,
                "summary": document["summary"],
                "terminations": {task: result["termination"] for task, result in document["tasks"].items() if result["termination"] != "completed"},
            })
            say(f"  {entry['id']}: {len(codes)} runs, {size / 1e6:.1f} MB, {time.monotonic() - started:.1f} s")
        if failures:
            sys.exit("Trajectory archives that fail their check:\n" + "\n".join(f"  - {line}" for line in failures))
        if not entries:
            say("No entry could be added: the site is unchanged.")
            return {"entries": [], "skipped": skipped}
        index = index_with(base, entries)
        try:
            validate(index, base, entries, reference, staging)
        except AssertionError as error:
            problem = f"The run index with the submitted entries is not valid: {error}"
            if not keep_going:
                sys.exit(problem)
            say(f"{problem}. The site is unchanged.")
            return {"entries": [], "skipped": skipped + [{"id": entry["id"], "reason": problem} for entry in entries]}

        # The run folders first, then the index that names them. Folders of an earlier run of this script go.
        kept = {entry["id"] for entry in entries}
        baselines = {model if isinstance(model, str) else model["id"] for model in base["models"]}
        earlier = [item.get("id") for item in (built.get("submissions") or {}).get("entries", []) if isinstance(item, dict)]
        for name in {*earlier, *kept}:
            if isinstance(name, str) and check_submission.SCORE_FILE.fullmatch(f"submissions/{RELEASE}/{name}.json") and name not in baselines:
                shutil.rmtree(runs / name, ignore_errors=True)
        for entry in entries:
            os.replace(staging / entry["id"], runs / entry["id"])
        # A new file that takes the place of the old one: the old one can be a link to the file in public/.
        fresh = runs / "index.json.new"
        fresh.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n")
        os.replace(fresh, index_path)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    say(f"Added {len(entries)} submitted {'entry' if len(entries) == 1 else 'entries'} to the run viewer of {site}.")
    return {"entries": [entry["id"] for entry in entries], "skipped": skipped}


def read_submissions() -> list[tuple[str, dict]]:
    """Every committed score file of the release, checked. Stops on a file that fails."""
    accepted, failures = [], []
    for relative in check_submission.committed_score_files(RELEASE):
        document, errors = check_submission.check_file(relative, ROOT, download=False)
        if errors:
            failures += [f"{relative}: {error}" for error in errors]
        else:
            accepted.append((relative, document))
    if failures:
        sys.exit("Submissions that fail their check:\n" + "\n".join(f"  - {line}" for line in failures))
    return accepted


def summarize(lines: list[str]) -> None:
    """In a workflow, show what was printed in the summary of the step. Text from a score file stays inside a code block."""
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if not target or not lines or lines == [NO_ENTRIES]:
        return
    text = "\n".join(lines).replace("```", "'''")
    with open(target, "a") as summary:
        summary.write(f"## Runs of the submitted entries in the task explorer\n\n```text\n{text}\n```\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", type=Path, required=True, help="the built site to add the runs to, for example dist")
    parser.add_argument(
        "--archive", action="append", default=[], metavar="ENTRY=FILE",
        help="read the trajectory archive of an entry from a local file instead of its address (may be repeated)",
    )
    parser.add_argument(
        "--keep-going", action="store_true",
        help="leave out an entry whose archive fails a check or cannot be converted, with a warning, instead of stopping (for the deployment)",
    )
    args = parser.parse_args()
    archives = {}
    for item in args.archive:
        entry, separator, path = item.partition("=")
        if not separator or not entry or not path:
            parser.error(f"--archive takes ENTRY=FILE, not {item!r}")
        archives[entry] = Path(path)
    lines: list[str] = []

    def say(line: str) -> None:
        print(line)
        lines.append(line)

    def warn(text: str) -> None:
        # In a workflow, a warning of the run; one line, so that it cannot start another command.
        if os.environ.get("GITHUB_ACTIONS"):
            print("::warning title=Submitted entry without trajectories::" + " ".join(text.split()).replace("::", ": :"))

    try:
        done = export(args.site, read_submissions(), archives, say=say, keep_going=args.keep_going)
        for entry in (done or {}).get("skipped", []):
            warn(f"{entry['id']}: {entry['reason']}")
    except SystemExit as stopped:
        if isinstance(stopped.code, str):
            lines.append(stopped.code)
        raise
    except Exception as error:  # A deployment is not stopped by the trajectories of a submitted entry.
        if not args.keep_going:
            raise
        say(f"The runs of the submitted entries were not added: {type(error).__name__}: {error}")
        warn(lines[-1])
    finally:
        summarize(lines)


if __name__ == "__main__":
    main()
