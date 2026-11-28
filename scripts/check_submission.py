#!/usr/bin/env python3
"""Check leaderboard submissions: the score files under submissions/<release>/.

A submission is one score file, written by `multiverse submit` of the code
repository and added by a pull request (submissions/README.md). This script
decides whether a score file can go on the leaderboard:

  1. the file is where its entry says: submissions/<release>/<entry id>.json;
  2. the format checks of scripts/submission_format.py pass against the
     reference of the release (submissions/reference/): the 400 validation
     tasks with their settings and applicable checks, the released task
     files, the run settings of the baselines, and the pass rule;
  3. the entry does not collide with a baseline or with another submission;
  4. the trajectory archive behind `trajectories.url` is the file the score
     file names, and the verifier votes in it give the verdicts of the score
     file. Skipped with --no-download.

The pull request workflow runs it on the files a pull request adds, read as
data from --candidates, with the scripts of the base branch. The site build
runs it on every committed submission without the download.

Usage:
  python3 scripts/check_submission.py                       # all committed files, with the download
  python3 scripts/check_submission.py --no-download
  python3 scripts/check_submission.py --candidates DIR submissions/v1.1.0/<entry>.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import submission_format as fmt

ROOT = Path(__file__).resolve().parents[1]
SUBMISSIONS = ROOT / "submissions"
SCORE_FILE = re.compile(r"submissions/(?P<release>v\d+\.\d+\.\d+)/(?P<entry>[a-z0-9_]+-[a-z]+)\.json")
BASELINES = {"v1.1.0": ROOT / "src" / "data" / "leaderboard.v1.1.0.json"}
SPLIT = "validation"


def reference_for(release: str) -> dict | None:
    path = SUBMISSIONS / "reference" / f"{release}.{SPLIT}.json"
    return json.loads(path.read_text()) if path.exists() else None


def baseline_models(release: str) -> dict[str, dict]:
    """The models of the release's baselines, each with the harnesses it has results under."""
    result_set = json.loads(BASELINES[release].read_text())["sets"][SPLIT]
    harnesses = [harness["id"] for harness in result_set["harnesses"]]
    return {model["id"]: {**model, "harnesses": harnesses} for model in result_set["models"]}


def committed_score_files(release: str | None = None) -> list[str]:
    """Paths of the committed score files, relative to the repository."""
    return sorted(
        path.relative_to(ROOT).as_posix()
        for path in SUBMISSIONS.glob("v*/*.json")
        if release is None or path.parent.name == release
    )


def read_score_file(path: Path) -> tuple[dict | None, list[str]]:
    try:
        data = path.read_bytes()
    except OSError:
        return None, ["the file cannot be read"]
    if len(data) > fmt.MAX_SCORE_FILE_BYTES:
        return None, [f"the file is larger than {fmt.MAX_SCORE_FILE_BYTES // 1024} KB"]
    try:
        document = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return None, ["the file is not JSON in UTF-8"]
    return (document, []) if isinstance(document, dict) else (None, ["the file is not a JSON object"])


def board_errors(document: dict, baselines: dict[str, dict], others: list[dict]) -> list[str]:
    """Reasons an entry cannot stand beside the baselines and the other submissions."""
    errors = []
    model, harness = document["entry"]["model"], document["entry"]["harness"]
    identity = lambda item: (item["name"], item["developer"], item["access"])
    same_name = lambda item: item["name"].casefold() == model["name"].casefold()
    baseline = baselines.get(model["id"])
    if baseline is not None:
        if identity(baseline) != identity(model):
            errors.append(f"entry.model.id {model['id']!r} is a baseline model, whose name, developer and access are {identity(baseline)}")
        if harness in baseline["harnesses"]:
            errors.append(f"{baseline['name']} under the {harness} harness is a baseline of the leaderboard already")
    elif any(same_name(item) for item in baselines.values()):
        errors.append(f"the model name {model['name']!r} is the name of a baseline model with another id")
    for other in others:
        other_model = other["entry"]["model"]
        if other_model["id"] == model["id"] and identity(other_model) != identity(model):
            errors.append(f"another submission gives {model['id']!r} the name, developer and access {identity(other_model)}")
        if other_model["id"] != model["id"] and same_name(other_model):
            errors.append(f"the model name {model['name']!r} is taken by the submission {other['entry']['id']}")
    return errors


def download_archive(url: str, size: int, sha256: str, target) -> str | None:
    """Stream the archive into `target`; return why it is not the named file, or None."""
    request = urllib.request.Request(url, headers={"User-Agent": "multiverse-leaderboard-check"})
    digest, received = hashlib.sha256(), 0
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            if not response.geturl().startswith("https://"):
                return "the address of the trajectory archive leaves https"
            while chunk := response.read(1 << 20):
                received += len(chunk)
                if received > size:
                    return "the file at trajectories.url is larger than trajectories.bytes"
                digest.update(chunk)
                target.write(chunk)
    except (urllib.error.URLError, OSError, ValueError) as error:
        return f"the trajectory archive cannot be downloaded without signing in ({type(error).__name__})"
    if received != size or digest.hexdigest() != sha256:
        return "the file at trajectories.url is not the archive the score file names (size or sha256 differs)"
    return None


def check_file(relative: str, candidates: Path, *, download: bool) -> tuple[dict | None, list[str]]:
    """Check one score file; `relative` is its path in the repository, read from `candidates`."""
    match = SCORE_FILE.fullmatch(relative)
    if match is None:
        return None, ["a score file must be submissions/<release>/<entry id>.json"]
    reference = reference_for(match["release"])
    if reference is None or match["release"] not in BASELINES:
        return None, [f"the leaderboard takes no submissions for {match['release']}"]
    document, errors = read_score_file(candidates / relative)
    if document is None:
        return None, errors
    errors = fmt.check_submission(document, reference)
    if errors:
        return document, errors
    if document["entry"]["id"] != match["entry"]:
        return document, [f"the file must be named after its entry: {document['entry']['id']}.json"]
    others = []
    for path in committed_score_files(match["release"]):
        if path != relative:
            other, _ = read_score_file(ROOT / path)
            if other is not None and isinstance(other.get("entry"), dict) and isinstance(other["entry"].get("model"), dict):
                others.append(other)
    errors = board_errors(document, baseline_models(match["release"]), others)
    if errors or not download:
        return document, errors
    trajectories = document["trajectories"]
    with tempfile.TemporaryFile() as archive:
        problem = download_archive(trajectories["url"], trajectories["bytes"], trajectories["sha256"], archive)
        if problem:
            return document, [problem]
        archive.seek(0)
        return document, fmt.check_archive(document, archive, reference)


def report_of(relative: str, document: dict | None, errors: list[str], downloaded: bool) -> str:
    """The result of one file in Markdown. Text from the file stays inside code blocks."""
    safe = lambda text: str(text).replace("`", "'")
    lines = [f"### `{safe(relative)}`", ""]
    if errors:
        lines += ["**Not accepted.**", "", "```text", *(safe(error) for error in errors), "```"]
        return "\n".join(lines) + "\n"
    entry, summary = document["entry"], document["summary"]
    attempts = fmt.attempt_totals(document["tasks"])
    rate = lambda cell: f"{100 * cell['passed'] / cell['scored']:.1f}"
    names = ("Average", *fmt.SETTINGS)
    lines += [
        "**All checks passed.**" if downloaded else "**The score file passed. The trajectory archive was not downloaded.**",
        "",
        "```text",
        f"model      {safe(entry['model']['name'])} ({safe(entry['model']['developer'])}, {entry['model']['access']})",
        f"harness    {entry['harness']}",
        f"submitter  {safe(entry['submitter']['name'])}",
        # A request that runs past the limit ends a case as skipped, so a longer limit lets a slow model finish.
        f"request limit  {', '.join(f'{limit} s' for limit in document['run']['model_call_timeout_seconds'])}",
        # The submitter's own count of repeated attempts. The newest result of a task is the one submitted.
        f"tasks run again after a scored result  {attempts['rerun_after_score']}",
        f"tasks retried after an infrastructure failure  {attempts['retried_after_skip']}",
        "```",
        "",
        "| " + " | ".join(names) + " |",
        "| " + " | ".join("---" for _ in names) + " |",
        "| " + " | ".join(f"{rate(summary[name])} ({summary[name]['passed']}/{summary[name]['scored']})" for name in names) + " |",
    ]
    changed = document["run"]["code"].get("changed_paths")
    if changed:
        lines += ["", "Paths in which the code of the run differs from the public code:", "", "```text", *(safe(path) for path in changed[:50]), "```"]
    elif changed is None:
        lines += ["", "The submission does not say how the code of the run differs from the public code."]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", help="score files as paths in the repository; default: every committed one")
    parser.add_argument("--candidates", type=Path, default=ROOT, help="folder to read the named files from (default: this repository)")
    parser.add_argument("--no-download", action="store_true", help="do not download and check the trajectory archives")
    parser.add_argument("--report", type=Path, help="also write the result as Markdown to this file")
    args = parser.parse_args()
    files = args.files or committed_score_files()
    reports, failed = [], 0
    for relative in files:
        document, errors = check_file(relative, args.candidates, download=not args.no_download)
        failed += bool(errors)
        reports.append(report_of(relative, document, errors, downloaded=not args.no_download))
        print(f"{'FAILED' if errors else 'ok':7s}{relative}")
        for error in errors:
            print(f"         - {error}")
    if not files:
        print("No submissions.")
    if args.report:
        heading = "## Leaderboard submission check\n\n" if files else ""
        args.report.write_text(heading + "\n".join(reports))
    if os.environ.get("GITHUB_STEP_SUMMARY") and reports:
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("## Leaderboard submission check\n\n" + "\n".join(reports))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
