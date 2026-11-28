#!/usr/bin/env python3
"""Build the validation leaderboard of v1.1.0: the baselines and the submissions.

Inputs, all in this repository:
  src/data/leaderboard.v1.1.0.json          the baselines (scripts/export_leaderboard.py)
  submissions/v1.1.0/<entry>.json           one score file per accepted submission
  public/data/v1.1.0/runs/index.json        the baselines task by task, for the self-check below

Output: src/data/leaderboard.v1.1.0.validation.json, the validation result set
in the shape of the baselines' file, which the page draws. It is generated,
not committed: the site build and the development server write it
(vite.config.ts), so the board always equals the committed submissions.

A submitted entry is a model under a harness. Its cells are computed here from
the task results of its score file: the success rate, the counts, and the 95%
task-bootstrap confidence interval with the baselines' procedure and seed. The
draws of that procedure depend only on the seed and the number of tasks, so an
entry gets the interval it would have had among the baselines. Before any
interval is computed, the intervals of the baselines are recomputed from the
run index and compared with the committed ones, which shows that the random
number generator of this machine gives the same draws.

Every score file is checked first (scripts/check_submission.py, without the
download of its trajectory archive); a file that fails stops the build.

With no submissions the output is the baselines' result set and NumPy is not
needed. With submissions the intervals need NumPy.

Usage:
  python3 scripts/build_board.py              # write the file
  python3 scripts/build_board.py --check      # validate the submissions and the merge; write nothing
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

import check_submission
import submission_format as fmt
from export_leaderboard import SETTING_IDS, TASK_SETTINGS, one_decimal, task_bootstrap

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v1.1.0"
SPLIT = "validation"
BASELINES = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.json"
PAPER = ROOT / "src" / "data" / "paper" / "leaderboard.json"
RUN_INDEX = ROOT / "public" / "data" / RELEASE / "runs" / "index.json"
OUT = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.{SPLIT}.json"
METRIC_SEVERAL_HARNESSES = "Success rate (%) for one scored trajectory per model, harness and task"


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
    entries = [document["entry"]["id"] for _, document in accepted]
    assert len(set(entries)) == len(entries), "Two score files have the same entry"
    return accepted


def rows_of(tasks: dict[str, dict], model: str, harness: str) -> list[dict]:
    return [
        {"taskId": task_id, "setting": task["setting"], "modelId": model, "harness": harness, "scored": True, "passed": task["passed"]}
        for task_id, task in tasks.items()
    ]


def confirm_baseline_intervals(baselines: dict) -> None:
    """Recompute the baselines' intervals from their task results; they must equal the committed ones."""
    index = json.loads(RUN_INDEX.read_text())
    reference = check_submission.reference_for(RELEASE)
    harness = index["harness"]
    rows = []
    for at, model in enumerate(index["models"]):
        assert isinstance(model, str), "The self-check reads the baselines of the run index"
        tasks = {task_id: {"setting": reference["tasks"][task_id]["setting"], "passed": codes[at][0] == "P"} for task_id, codes in index["cells"].items()}
        rows += rows_of(tasks, model, harness)
    computed = task_bootstrap(rows, list(index["models"]), [harness], baselines["taskCounts"])
    for setting in SETTING_IDS:
        for model in index["models"]:
            committed, cell = baselines["results"][setting][model][harness], computed[setting][model][harness]
            same = cell["passed"] == committed["passed"] and all(abs(a - b) < 1e-6 for a, b in zip(cell["ci95"], committed["ci95"]))
            assert same, f"The interval of {model} in {setting} differs from the committed one: this NumPy draws other samples than the export did"


def cells_of(document: dict, task_counts: dict[str, int]) -> dict[str, dict]:
    """The cells of one submitted entry, one per task setting and the average."""
    model, harness = document["entry"]["model"]["id"], document["entry"]["harness"]
    computed = task_bootstrap(rows_of(document["tasks"], model, harness), [model], [harness], task_counts)
    cells = {}
    for setting in SETTING_IDS:
        cell = computed[setting][model][harness]
        assert cell["passed"] == document["summary"][setting]["passed"] and cell["scored"] == document["summary"][setting]["scored"]
        # The rate from the counts, so that equal counts give equal rates: Average is the equal-weight mean of the settings.
        rates = [100 * computed[name][model][harness]["passed"] / task_counts[name] for name in (TASK_SETTINGS if setting == "Average" else (setting,))]
        mean = sum(rates) / len(rates)
        assert abs(mean - cell["mean"]) < 1e-9
        cells[setting] = {"mean": mean, "meanText": one_decimal(mean), "rank": 0, "passed": cell["passed"], "scored": cell["scored"], "sd": None, "sdText": None, "ci95": cell["ci95"]}
    return cells


def entry_info(relative: str, document: dict) -> dict:
    """What the page shows about a submitted entry besides its numbers."""
    entry, trajectories = document["entry"], document["trajectories"]
    info = {
        "id": entry["id"],
        "submitter": entry["submitter"]["name"],
        "submittedOn": entry["submitted_on"],
        "trajectories": trajectories["url"],
        "scoreFile": relative,
    }
    if "url" in entry["submitter"]:
        info["submitterUrl"] = entry["submitter"]["url"]
    if "url" in entry["model"]:
        info["modelUrl"] = entry["model"]["url"]
    return info


def build(submissions: list[tuple[str, dict]]) -> dict:
    baselines = json.loads(BASELINES.read_text())["sets"][SPLIT]
    board = copy.deepcopy(baselines)
    board["entries"] = {}
    if submissions:
        confirm_baseline_intervals(baselines)
    known_harnesses = {harness["id"]: harness for harness in json.loads(PAPER.read_text())["harnesses"]}
    models = {model["id"]: model for model in board["models"]}
    for relative, document in submissions:
        entry = document["entry"]
        model, harness = entry["model"], entry["harness"]
        if model["id"] not in models:
            models[model["id"]] = {"id": model["id"], "name": model["name"], "developer": model["developer"], "access": model["access"], "reference": False}
        if harness not in {item["id"] for item in board["harnesses"]}:
            board["harnesses"].append(known_harnesses[harness])
        for setting, cell in cells_of(document, board["taskCounts"]).items():
            column = board["results"][setting].setdefault(model["id"], {})
            assert harness not in column, f"{entry['id']} has results on the board already"
            column[harness] = cell
        board["entries"].setdefault(model["id"], {})[harness] = entry_info(relative, document)

    # The harnesses in the paper's order; the models by their average under the first harness they have.
    order = list(known_harnesses)
    board["harnesses"].sort(key=lambda harness: order.index(harness["id"]))
    harness_ids = [harness["id"] for harness in board["harnesses"]]
    average = board["results"]["Average"]
    first = lambda model: next(harness for harness in harness_ids if harness in average[model])
    position = {model: at for at, model in enumerate(models)}
    board["models"] = sorted(models.values(), key=lambda model: (harness_ids.index(first(model["id"])), -average[model["id"]][first(model["id"])]["mean"], position[model["id"]]))
    # Competition rank within a harness: 1 + the number of entries with a strictly higher rate.
    for setting in SETTING_IDS:
        for harness in harness_ids:
            column = [cells[harness] for cells in board["results"][setting].values() if harness in cells]
            for cell in column:
                cell["rank"] = 1 + sum(round(other["mean"], 9) > round(cell["mean"], 9) for other in column)
    if len(harness_ids) > 1:
        board["metric"] = METRIC_SEVERAL_HARNESSES
    return board


def validate(board: dict, submissions: list[tuple[str, dict]]) -> None:
    baselines = json.loads(BASELINES.read_text())["sets"][SPLIT]
    model_ids = [model["id"] for model in board["models"]]
    assert len(set(model_ids)) == len(model_ids)
    assert set(board["results"]) == set(SETTING_IDS)
    for setting in SETTING_IDS:
        assert set(board["results"][setting]) == set(model_ids), f"{setting}: the cells and the models differ"
        tasks = sum(board["taskCounts"].values()) if setting == "Average" else board["taskCounts"][setting]
        for model, cells in board["results"][setting].items():
            assert cells, f"{model} has no result"
            for harness, cell in cells.items():
                assert cell["scored"] == tasks and abs(cell["mean"] - 100 * cell["passed"] / tasks) < 1e-9
                assert cell["meanText"] == one_decimal(cell["mean"]) and cell["ci95"][0] <= cell["mean"] <= cell["ci95"][1]
    for model in baselines["models"]:
        for setting in SETTING_IDS:
            for harness, cell in baselines["results"][setting][model["id"]].items():
                merged = board["results"][setting][model["id"]][harness]
                assert {key: value for key, value in merged.items() if key != "rank"} == {key: value for key, value in cell.items() if key != "rank"}, f"The baseline {model['id']} changed"
    submitted = {(document["entry"]["model"]["id"], document["entry"]["harness"]) for _, document in submissions}
    assert {(model, harness) for model, harnesses in board["entries"].items() for harness in harnesses} == submitted
    for setting in TASK_SETTINGS:
        for model in model_ids:
            assert set(board["results"][setting][model]) == set(board["results"]["Average"][model])
    text = json.dumps(board)
    for forbidden in ("taskId", "taskResults", str(Path.home())):
        assert forbidden not in text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="validate the submissions and the merged board; write nothing")
    args = parser.parse_args()
    submissions = read_submissions()
    board = build(submissions)
    validate(board, submissions)
    payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "split": SPLIT,
        "generatedBy": "scripts/build_board.py",
        "submissions": [{"file": relative, "sha256": hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()} for relative, _ in submissions],
        "set": board,
    }
    entries = len(payload["submissions"])
    summary = f"{len(board['models'])} models, {entries} submitted {'entry' if entries == 1 else 'entries'}"
    if args.check:
        print(f"The validation leaderboard of {RELEASE} builds: {summary}.")
        return
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if not OUT.exists() or OUT.read_text() != text:
        OUT.write_text(text)
    print(f"Wrote {OUT.relative_to(ROOT)}: {summary}.")


if __name__ == "__main__":
    main()
