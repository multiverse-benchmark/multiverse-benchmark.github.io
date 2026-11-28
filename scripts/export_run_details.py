#!/usr/bin/env python3
"""Export the settings the v1.1.0 validation baselines were run under.

The leaderboard shows, on request, the settings of a run that can affect its
result: the action model's limits on input and output, its sampling and
reasoning settings and the route of its requests, the limit on model calls,
and which message carried the developer instructions. A submitted entry states
them in its score file (scripts/submission_format.py). This script reads the
same facts for the baselines from their run records, where every result file
records them, and writes src/data/leaderboard.v1.1.0.run-details.json. The
user simulator and the verifier are the same for every entry of the
leaderboard and are not part of an entry's details.

Input: the folder of the baselines' run records, with its manifest.jsonl (one
line per split, model and task, naming the result file). The folder is not
part of this repository, so its path is an argument. Only the validation set
is read: nothing of a hidden test task is opened or written.

Every result file of a model is read, and the settings are written as a
submission lists them: each distinct settings record with its number of
tasks, the most frequent first. The run-level settings must be the same for
every task of a model.

Usage:
  python3 scripts/export_run_details.py --records /path/to/records
  python3 scripts/export_run_details.py --validate-only
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import submission_format as fmt

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v1.1.0"
SPLIT = "validation"
HARNESS = "bare"
OUT = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.run-details.json"
BASELINES = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.json"
# The run-level settings, and where a result file records each.
RUN_FIELDS = {
    "max_model_calls_allowed": ("multiverse_inference_identity", "max_model_calls_allowed"),
    "developer_instruction_placement": ("developer_instruction_placement",),
}


def dig(record: dict, path: tuple[str, ...]):
    value = record
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def read_settings(path: str) -> tuple[str, str]:
    """The model settings and the run-level settings of one result file, each as canonical JSON text."""
    with gzip.open(path, "rb") as stream:
        record = json.load(stream)
    run = {name: dig(record, where) for name, where in RUN_FIELDS.items()}
    return fmt.canonical_json(fmt.model_settings_of(record)).decode("ascii"), json.dumps(run, sort_keys=True)


def export(records: Path, workers: int) -> dict:
    manifest = records / "manifest.jsonl"
    rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    rows = [row for row in rows if row["split"] == SPLIT]
    assert all(row["harness"] == HARNESS for row in rows), "the baselines of the validation set ran under the bare harness"
    paths = [str(records / row["result_path"]) for row in rows]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        settings = list(pool.map(read_settings, paths, chunksize=16))
    models: dict[str, dict] = {}
    for row, (behavior, run) in zip(rows, settings):
        entry = models.setdefault(row["model"], {"behaviors": {}, "runs": set(), "tasks": set()})
        assert row["task_id"] not in entry["tasks"], f"{row['model']}: two results of {row['task_id']}"
        entry["tasks"].add(row["task_id"])
        entry["behaviors"][behavior] = entry["behaviors"].get(behavior, 0) + 1
        entry["runs"].add(run)
    details = {}
    for model in sorted(models):
        entry = models[model]
        assert len(entry["runs"]) == 1, f"{model}: its tasks were not run under one set of run-level settings"
        run = {name: value for name, value in json.loads(entry["runs"].pop()).items() if value is not None}
        details[model] = {HARNESS: {"tasks": len(entry["tasks"]), "action_model_behavior": fmt.settings_groups(entry["behaviors"]), **run}}
    return {
        "schemaVersion": 1,
        "release": RELEASE,
        "split": SPLIT,
        "generatedBy": "scripts/export_run_details.py",
        "input": {"file": manifest.name, "sha256": hashlib.sha256(manifest.read_bytes()).hexdigest()},
        "models": details,
    }


def validate(payload: dict) -> str:
    """Checks that hold for the exported file; returns one line for the log."""
    assert payload["release"] == RELEASE and payload["split"] == SPLIT
    baselines = json.loads(BASELINES.read_text())["sets"][SPLIT]
    tasks = sum(baselines["taskCounts"].values())
    assert sorted(payload["models"]) == sorted(model["id"] for model in baselines["models"]), "the models are not the baselines of the leaderboard"
    for model, harnesses in payload["models"].items():
        assert list(harnesses) == [HARNESS], f"{model}: unexpected harnesses"
        run = harnesses[HARNESS]
        groups = run["action_model_behavior"]
        assert run["tasks"] == tasks == sum(group["tasks"] for group in groups), f"{model}: the settings do not cover the {tasks} tasks"
        assert all(fmt.is_model_settings(group["settings"]) and group["settings"] for group in groups), f"{model}: not model settings"
        assert groups == fmt.settings_groups({fmt.canonical_json(group["settings"]).decode("ascii"): group["tasks"] for group in groups})
        assert set(run) <= {"tasks", "action_model_behavior", *RUN_FIELDS}, f"{model}: unexpected fields"
        assert run.get("developer_instruction_placement") in (None, *fmt.INSTRUCTION_PLACEMENTS)
    text = json.dumps(payload)
    for forbidden in ("taskId", "task_id", str(Path.home())):
        assert forbidden not in text, f"exported file contains {forbidden!r}"
    several = sum(len(harnesses[HARNESS]["action_model_behavior"]) > 1 for harnesses in payload["models"].values())
    return f"{len(payload['models'])} models; {several} with cases under more than one settings record"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--records", type=Path, help="the folder of the baselines' run records")
    parser.add_argument("--workers", type=int, default=8, help="result files read at the same time")
    parser.add_argument("--validate-only", action="store_true", help="check the committed JSON without the records")
    args = parser.parse_args()
    if args.validate_only:
        print(f"The run details of the {RELEASE} baselines are consistent: {validate(json.loads(OUT.read_text()))}.")
        return
    if args.records is None:
        parser.error("--records is required (or use --validate-only)")
    payload = export(args.records, args.workers)
    note = validate(payload)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {note}.")


if __name__ == "__main__":
    main()
