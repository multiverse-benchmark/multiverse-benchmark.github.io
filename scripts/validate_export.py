#!/usr/bin/env python3
"""Validate all static task assets, hashes, release membership, and references.

The manifest's cohortVersion decides what is expected:

  release-v1.0.0  the paper's 396-task validation set (in public/data)
  release-v1.1.0  the 400 validation tasks of the v1.1.0 release
                  (in public/data/v1.1.0)

Usage: validate_export.py [DATA_FOLDER]  (default: this project's public/data)
Standard library only.
"""

from collections import Counter
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

from task_setting import validate_task_setting

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data"
SETTINGS = ("ST", "IF", "MT", "MTIF")
PAPER_RELEASE = "release-v1.0.0"
# The fields of a task that the explorer publishes in its task record. The
# contamination canary travels beside the record.
TASK_FIELDS = {"task_id", "user_simulation_metadata", "environment_config", "verification", "gold_trajectories", "task_properties"}
# Tasks per setting and task statuses that each release must have. For the
# paper's release, also the number of instruction rubrics per setting that the
# paper reports.
COHORTS = {
    PAPER_RELEASE: {"counts": {"ST": 100, "IF": 97, "MT": 100, "MTIF": 99}, "status": {"original": 396},
                    "instructionRubrics": {"ST": 0, "IF": 509, "MT": 0, "MTIF": 537}},
    # The v1.1.0 release: the paper's 396 tasks (v1.0.0) plus four added ones.
    "release-v1.1.0": {"counts": {setting: 100 for setting in SETTINGS}, "status": {"retained": 396, "added": 4}},
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def absolute_paths(value):
    """Strings in a JSON value that look like machine-specific paths."""
    if isinstance(value, dict):
        return [found for key, item in value.items() for found in absolute_paths(key) + absolute_paths(item)]
    if isinstance(value, list):
        return [found for item in value for found in absolute_paths(item)]
    if isinstance(value, str) and re.match(r"(/|~|[A-Za-z]:\\)|.*(/home/|/Users/|/tmp/)", value, re.S):
        return [value]
    return []


def main():
    manifest = json.loads((DATA / "manifest.json").read_text())
    cohort = manifest.get("cohortVersion")
    require(cohort in COHORTS, f"Unknown cohort version in the manifest: {cohort!r}")
    require(cohort == f"release-{manifest['release']}", "Manifest release and cohort version differ")
    expected_counts = COHORTS[cohort]["counts"]
    expected_total = sum(expected_counts.values())
    index = json.loads((DATA / "tasks.json").read_text())
    require(len(index) == expected_total, f"Expected exactly {expected_total} index entries")
    ids = [task["id"] for task in index]
    require(len(set(ids)) == expected_total, "Duplicate task IDs")
    require(all(re.fullmatch(r"[A-Za-z0-9_-]+", task_id) for task_id in ids), "Unsafe task identifier")
    actual_counts = Counter(task["taskType"] for task in index)
    require(actual_counts == expected_counts, f"Expected {expected_counts} tasks per setting, found {dict(actual_counts)}")
    require(manifest["taskTypes"] == expected_counts, "Manifest setting counts differ")
    require(manifest["taskCount"] == expected_total, "Manifest task count differs")
    records = manifest["tasks"]
    require(ids == [record["id"] for record in records], "Index and provenance order differ")
    require(Counter(record["status"] for record in records) == COHORTS[cohort]["status"], "Selected release membership changed")
    require(not absolute_paths(manifest), f"Machine-specific paths in the manifest: {absolute_paths(manifest)[:5]}")
    dataset = manifest["sourceDataset"]
    require(dataset.get("split") == "validation", "The source is not the validation split")
    if "repository" in dataset:
        # On the Hugging Face Hub, a release is the dataset's revision of the same name.
        require(set(dataset) == {"repository", "revision", "commit", "split"} and dataset["revision"] == manifest["release"]
                and re.fullmatch(r"[0-9a-f]{40}", dataset["commit"]) is not None, "Unexpected source dataset record")
    else:
        require(set(dataset) == {"split"}, "Unexpected source dataset record")
    sources = manifest["sourceFiles"]
    require(set(sources) == set(SETTINGS), "Expected the source files of each setting")
    for setting in SETTINGS:
        # Only validation files are public; a file of another split must never be a source.
        require(sources[setting] and all(
            re.fullmatch(rf"data/{setting}/validation-\d{{5}}-of-\d{{5}}\.parquet", record["file"]) is not None
            and re.fullmatch(r"[0-9a-f]{64}", record["sha256"]) is not None for record in sources[setting]),
            f"Unexpected source file record: {setting}")
        require(sum(record["rows"] for record in sources[setting]) == expected_counts[setting],
                f"Source rows and tasks differ: {setting}")

    order_path = DATA / manifest["taskOrder"]["file"]
    require(hashlib.sha256(order_path.read_bytes()).hexdigest() == manifest["taskOrder"]["sha256"], "Task order hash mismatch")
    with order_path.open(newline="") as stream:
        order = list(csv.DictReader(stream, delimiter="\t"))
    ordered_ids = []
    for setting in SETTINGS:
        rows = sorted((row for row in order if row["historical_setting"] == setting), key=lambda row: int(row["output_index_0based"]))
        require(len(rows) == expected_counts[setting], f"Expected {expected_counts[setting]} {setting} task-order entries")
        ordered_ids.extend(row["output_task_id"] for row in rows)
    require(ids == ordered_ids, "Export no longer matches the task-order file")
    for setting in SETTINGS:
        positions = [record["index"] for record in records if record["setting"] == setting]
        require(positions == list(range(len(positions))), f"{setting} validation indices are not consecutive")

    for relative, expected in manifest["files"].items():
        path = DATA / relative
        blob = path.read_bytes()
        require(len(blob) == expected["bytes"], f"Size mismatch: {relative}")
        require(hashlib.sha256(blob).hexdigest() == expected["sha256"], f"Hash mismatch: {relative}")
        decoded = gzip.decompress(blob) if relative.endswith(".gz") else blob
        require(len(decoded) == expected["decodedBytes"], f"Decoded size mismatch: {relative}")
        json.loads(decoded)
    actual_payloads = {path.relative_to(DATA).as_posix() for folder in (DATA / "tasks", DATA / "states") for path in folder.rglob("*.json.gz")}
    require(actual_payloads == set(manifest["files"]) - {"tasks.json"}, "Unexpected or missing task assets")
    step_count = 0
    snapshot_count = 0
    tool_call_count = 0
    state_counts = Counter()
    rubric_counts = Counter({setting: 0 for setting in SETTINGS})
    prefix = manifest["canary"]["benchmarkPrefix"]
    for summary, source in zip(index, records):
        task_id = summary["id"]
        with gzip.open(DATA / f"tasks/{task_id}.json.gz", "rt") as stream:
            task = json.load(stream)
        require(task["id"] == task_id and task["taskType"] == summary["taskType"], f"Task detail mismatch: {task_id}")
        require(task["validationIndex"] == source["index"] == summary["validationIndex"], f"Validation index mismatch: {task_id}")
        require(source["setting"] == summary["taskType"], f"Index entry and provenance record differ: {task_id}")
        require(task["sourceSetting"] == summary["sourceSetting"] == source["sourceSetting"]
                and task["cohortStatus"] == summary["cohortStatus"] == source["status"],
                f"Task detail and provenance record differ: {task_id}")
        require(task.get("prompt"), f"Missing task prompt: {task_id}")
        require(task["rawTask"]["task_id"] == task_id, f"Source ID mismatch: {task_id}")
        actual_setting = validate_task_setting(task["rawTask"], summary["taskType"])
        require(task.get("inferredTaskType") == summary.get("inferredTaskType") == actual_setting,
                f"Stored inferred setting differs from active task fields: {task_id}")
        require(set(task["rawTask"]) <= TASK_FIELDS, f"Unexpected fields in the task record: {task_id}")
        # A public release asks that each task's contamination canary travels with its data.
        require(task["contaminationCanary"].startswith(prefix + "-") and summary["contaminationCanary"] == task["contaminationCanary"],
                f"Missing contamination canary: {task_id}")
        for trajectory in task["goldTrajectories"]:
            step_count += len(trajectory["steps"])
            tool_call_count += sum(step["action"] == "tool_use" for step in trajectory["steps"])
            require([step["sourceIndex"] for step in trajectory["steps"]] == list(range(len(trajectory["steps"]))), f"Trajectory order lost: {task_id}")
        for phase in ("initial", "final"):
            with gzip.open(DATA / f"states/{task_id}/{phase}.json.gz", "rt") as stream:
                state = json.load(stream)
            require(state["services"] == sorted(state["data"]), f"Snapshot services differ: {task_id}/{phase}")
            require(state["available"] == task["stateSnapshots"][phase]["available"], f"Snapshot metadata differs: {task_id}/{phase}")
            require(state["reason"], f"Missing snapshot provenance: {task_id}/{phase}")
            require(state.get("contaminationCanary") == task["contaminationCanary"],
                    f"Missing contamination canary: {task_id}/{phase}")
            state_counts[f"{phase}Available"] += int(state["available"])
            state_counts[f"{phase}UnavailableServices"] += len(state.get("unavailableServices", {}))
            snapshot_count += 1
        developer = task["instructions"]["developer"]
        instructions = developer.get("developer_instruction_chunks", [])
        rubric_counts[summary["taskType"]] += sum(len(item.get("rubrics", [])) for item in instructions)
        if cohort == PAPER_RELEASE:
            # The list of instructions and the joined developer prompt must agree.
            require(developer.get("instruction_text", "") == "\n".join(item["instruction"] for item in instructions),
                    f"Joined developer prompt differs from the instructions: {task_id}")
    require(step_count == manifest["referenceStepCount"], "Reference step total changed")
    require(tool_call_count == manifest["referenceToolCallCount"], "Reference tool calls in the task files differ from the manifest")
    require(dict(state_counts) == manifest["states"], "Snapshot counts changed")
    rubrics = manifest["instructionRubrics"]
    require(dict(rubric_counts) == rubrics["perSetting"] and sum(rubric_counts.values()) == rubrics["total"],
            f"Instruction rubrics in the task files differ from the manifest: {dict(rubric_counts)}")
    expected_rubrics = COHORTS[cohort].get("instructionRubrics")
    require(expected_rubrics is None or dict(rubric_counts) == expected_rubrics,
            f"Instruction rubrics per setting differ from the paper's: {dict(rubric_counts)}")
    total = sum(record["bytes"] for record in manifest["files"].values())
    require(total == manifest["totalAssetBytes"], "Asset total differs")
    require(total < 950_000_000, "Static task assets exceed the site's size budget")
    counts_text = ", ".join(f"{actual_counts[setting]} {setting}" for setting in SETTINGS)
    print(f"Validated {cohort}: {len(ids)} unique tasks ({counts_text}), {step_count:,} reference steps, "
          f"{sum(rubric_counts.values()):,} instruction rubrics, {tool_call_count:,} reference tool calls, "
          f"{snapshot_count} snapshots, {len(manifest['files']):,} file hashes; {total / 1_000_000:.1f} MB.")


if __name__ == "__main__":
    main()
