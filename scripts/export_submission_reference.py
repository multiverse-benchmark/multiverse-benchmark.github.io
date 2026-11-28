#!/usr/bin/env python3
"""Write what a leaderboard submission is checked against.

A submission to the validation leaderboard of v1.1.0 (submissions/README.md)
must cover the 400 validation tasks, run on the released task files, and be
scored with the settings of the baselines. This script writes those facts to
submissions/reference/v1.1.0.validation.json:

  - the required run settings: the API version, the user simulator and
    verifier models, the number of verifier votes, and the limit on model
    calls. They are the defaults of `multiverse eval`;
  - the sha256 of each task setting's Parquet file on the Hub, from the
    manifest of the exported tasks (public/data/v1.1.0/manifest.json);
  - for each validation task, its setting and the checks that apply to it.
    Which checks apply is a property of the task. It is read from the runs of
    the baselines (public/data/v1.1.0/runs/index.json), where every baseline
    must agree.

`multiverse submit` of the code repository ships a copy of the file, so the
same reference is used before a submission is sent and when it arrives.

Usage:
  python3 scripts/export_submission_reference.py           # write the file
  python3 scripts/export_submission_reference.py --check   # compare, write nothing
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v1.1.0"
SPLIT = "validation"
DATA = ROOT / "public" / "data" / RELEASE
OUT = ROOT / "submissions" / "reference" / f"{RELEASE}.{SPLIT}.json"
SETTINGS = ("ST", "IF", "MT", "MTIF")

# The settings of `multiverse eval` that the baselines were run with.
RUN_SETTINGS = {
    "api_version": "v1.1.0",
    "user_simulator_model": "gemini_3_5_flash",
    "verifier_model": "gemini_3_1_pro_high",
    "verifier_votes": 3,
    "max_model_calls_allowed": 320,
}
# The verifiers of the run index, under the names the result files use.
CHECK_OF = {"assertion": "final_assertion", "dbdiff": "dblevel", "response": "inspection", "instruction": "rubrics"}


def build() -> dict:
    manifest = json.loads((DATA / "manifest.json").read_text())
    tasks = json.loads((DATA / "tasks.json").read_text())
    index = json.loads((DATA / "runs" / "index.json").read_text())
    assert manifest["release"] == RELEASE and manifest["sourceDataset"]["split"] == SPLIT
    assert index["release"] == RELEASE and index["split"] == SPLIT and list(index["verifiers"]) == list(CHECK_OF)

    datasets = {}
    for setting in SETTINGS:
        files = manifest["sourceFiles"][setting]
        assert len(files) == 1, f"{setting}: a setting is one Parquet file"
        datasets[setting] = {"file": files[0]["file"], "sha256": files[0]["sha256"], "tasks": files[0]["rows"]}

    setting_of = {task["id"]: task["taskType"] for task in tasks}
    assert len(setting_of) == len(tasks) == sum(item["tasks"] for item in datasets.values())
    assert set(index["cells"]) == set(setting_of), "The run index and the task list name different tasks"
    reference_tasks = {}
    for task_id in sorted(setting_of):
        codes = [code for code in index["cells"][task_id] if code]
        assert codes, f"{task_id}: no baseline run"
        applies = {tuple(mark != "n" for mark in code[1:]) for code in codes}
        assert len(applies) == 1, f"{task_id}: the baselines disagree on which checks apply"
        checks = [check for check, applicable in zip(CHECK_OF.values(), applies.pop()) if applicable]
        assert checks[:2] == ["final_assertion", "dblevel"], f"{task_id}: a required check does not apply"
        reference_tasks[task_id] = {"setting": setting_of[task_id], "checks": checks}
    for setting in SETTINGS:
        assert sum(task["setting"] == setting for task in reference_tasks.values()) == datasets[setting]["tasks"]

    return {
        "schemaVersion": 1,
        "release": RELEASE,
        "split": SPLIT,
        "dataset": manifest["sourceDataset"]["repository"],
        **RUN_SETTINGS,
        "datasets": datasets,
        "tasks": reference_tasks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="fail when the committed file differs; write nothing")
    args = parser.parse_args()
    text = json.dumps(build(), indent=1, ensure_ascii=False) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            sys.exit(f"{OUT.relative_to(ROOT)} is out of date: run scripts/export_submission_reference.py")
        print(f"{OUT.relative_to(ROOT)} matches the exported tasks and the baseline runs.")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
