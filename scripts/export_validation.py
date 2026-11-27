#!/usr/bin/env python3
"""Export MultiVerse validation tasks for the static task explorer.

Both public releases are read from the MultiVerse dataset on the Hugging Face
Hub (--dataset), where each data release is a revision named after the
release:

  v1.0.0  The release the paper describes: 396 validation tasks (100 ST,
          97 IF, 100 MT, 99 MTIF). Written to public/data.
  v1.1.0  400 validation tasks, 100 per setting. Written to
          public/data/v1.1.0, next to the paper's set, so that the site can
          show either release.

The dataset has one row per task, in one folder of Parquet files per task
setting (data/<SETTING>/validation-NNNNN-of-NNNNN.parquet). --dataset names
the dataset on the Hub (hf://datasets/<repository>; a private repository needs
an access token in HF_TOKEN) or a folder that holds a copy of the release's
revision.

Only the validation split is public. A dataset that holds a Parquet file of
any other split is rejected.

Each task's contamination canary is published with it, in its task file and in
its state files, as the dataset asks of every redistribution of task data.

Requires Python 3.11+, pyarrow, and, to read from the Hub, huggingface_hub.
No task code or API code is executed.
Run from any directory; the destination defaults to this project's public/data
(public/data/v1.1.0 for v1.1.0).
The checked-in JSON/gzip files are sufficient to build and host the website.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re

from task_setting import validate_task_setting

SETTINGS = ("ST", "IF", "MT", "MTIF")
ROOT = Path(__file__).resolve().parents[1]
HUB_REFERENCE = re.compile(r"hf://datasets/(?P<repository>[^/@\s]+/[^/@\s]+)")
DEFAULT_DATASET = "hf://datasets/google/MultiVerse"
SPLIT = "validation"
SHARD = re.compile(r"(?P<split>.+)-(?P<index>\d{5})-of-(?P<count>\d{5})\.parquet")
# The columns of a row. Each top-level field of a task has one column: a nested
# field is stored as JSON text, a plain field keeps its value, and a null means
# that the field is not set.
JSON_COLUMNS = ("user_simulation_metadata", "environment_config", "verification", "gold_trajectories", "task_properties")
VALUE_COLUMNS = ("task_id", "contamination_canary")
# Columns that repeat parts of a task for browsing the dataset. The first two
# are checked against the task and its folder; the others are not read.
DERIVED_COLUMNS = ("id", "setting", "task_name", "scenario_type", "main_capabilities", "available_services", "query")
# A canary is the benchmark's marker followed by the task's own token.
CANARY = re.compile(r"(?P<marker>MULTIVERSE-CANARY-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})-[0-9a-f]{32}")
PAPER_RELEASE = "v1.0.0"
# Tasks per setting of each release, and where its export is written. For the
# paper's release, also the number of instruction rubrics per setting that the
# paper reports; an export that disagrees with it stops.
RELEASES = {
    "v1.0.0": {"counts": {"ST": 100, "IF": 97, "MT": 100, "MTIF": 99}, "output": ROOT / "public/data",
               "instructionRubrics": {"ST": 0, "IF": 509, "MT": 0, "MTIF": 537}},
    "v1.1.0": {"counts": {setting: 100 for setting in SETTINGS}, "output": ROOT / "public/data/v1.1.0"},
}
ORDER_FILE = "MultiVerse-validation.task_order.tsv"
STATE_NOTICE = (
    "Initial states are authored JSON inputs, and final states are reconstructed from the authored reference diff. "
    "No task or connector code was executed; these are not evaluated agent outcomes."
)


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def resolve_dataset(reference, release):
    """Find the files of a release.

    Returns the folder that holds them and, for the Hub, the repository, the
    revision, and the commit they were downloaded from.
    """
    if reference.startswith("hf://"):
        match = HUB_REFERENCE.fullmatch(reference)
        if match is None:
            raise ValueError("Expected the dataset as hf://datasets/<repository>; the release names the revision")
        from huggingface_hub import snapshot_download

        try:
            root = Path(snapshot_download(repo_id=match["repository"], repo_type="dataset", revision=release,
                                          allow_patterns=["data/*/*.parquet"]))
        except Exception as error:
            raise ValueError(f"Cannot download {reference} at revision {release}: {type(error).__name__}. Check the "
                             "repository and the revision; a private dataset needs an access token in HF_TOKEN.") from error
        # The Hub's cache names the folder of a download after its commit.
        if re.fullmatch(r"[0-9a-f]{40}", root.name) is None:
            raise ValueError("Cannot tell which commit of the dataset was downloaded")
        return root, {"repository": match["repository"], "revision": release, "commit": root.name}
    root = Path(reference).expanduser().resolve()
    if not (root / "data").is_dir():
        raise ValueError(f"No data folder in the dataset copy: {reference}")
    return root, {}


def dataset_files(root, expected_counts):
    """The Parquet files of each setting, in order, with their hashes and row counts.

    Stops at a file of another split, at a file outside the four settings, at
    an incomplete set of files, and at an unexpected number of tasks.
    """
    import pyarrow.parquet as pq

    shards = {setting: [] for setting in SETTINGS}
    for path in sorted((root / "data").rglob("*.parquet")):
        relative = path.relative_to(root).as_posix()
        match = SHARD.fullmatch(path.name)
        if path.parent.parent != root / "data" or path.parent.name not in SETTINGS or match is None:
            raise ValueError(f"Unexpected file in the dataset: {relative}")
        if match["split"] != SPLIT:
            raise ValueError(f"The dataset holds a split other than {SPLIT}: {relative}")
        shards[path.parent.name].append((int(match["index"]), int(match["count"]), path, relative))
    files = {}
    for setting in SETTINGS:
        found = shards[setting]
        if not found or [(index, count) for index, count, _, _ in found] != [(index, len(found)) for index in range(len(found))]:
            raise ValueError(f"Missing or incomplete Parquet files for {setting}")
        files[setting] = [{"path": path, "file": relative, "sha256": sha256(path), "bytes": path.stat().st_size,
                           "rows": pq.ParquetFile(path).metadata.num_rows} for _, _, path, relative in found]
        if sum(record["rows"] for record in files[setting]) != expected_counts[setting]:
            raise ValueError(f"Expected exactly {expected_counts[setting]} {setting} tasks")
    return files


def read_rows(path):
    """The rows of one Parquet file, in order. A column this script does not know is an error,
    so that a task is never published with one of its fields missing."""
    import pyarrow.parquet as pq

    parquet = pq.ParquetFile(path)
    columns = set(parquet.schema_arrow.names)
    expected = set(JSON_COLUMNS + VALUE_COLUMNS + DERIVED_COLUMNS)
    if columns != expected:
        raise ValueError(f"Unexpected or missing columns in {path.name}: {sorted(columns ^ expected)}")
    for batch in parquet.iter_batches(batch_size=16, columns=[*JSON_COLUMNS, *VALUE_COLUMNS, "id", "setting"]):
        yield from batch.to_pylist()


def task_from_row(row):
    """The task of one row, under the field names of the task schema, without its canary."""
    task = {}
    for name in JSON_COLUMNS:
        if row[name] is None:
            continue
        value = json.loads(row[name])
        # A row with an empty list of reference trajectories has none set.
        if name == "gold_trajectories" and not value:
            continue
        task[name] = value
    task["task_id"] = row["task_id"]
    return task


def encode_asset(value, compressed=True):
    """Serialize one JSON asset. Returns (file bytes, decoded size)."""
    raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False) + "\n").encode()
    if not compressed:
        return raw, len(raw)
    buffer = io.BytesIO()
    # mtime=0 and an empty embedded filename make exports reproducible.
    with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as zipped:
        zipped.write(raw)
    return buffer.getvalue(), len(raw)


def write_asset(output, files, relative, value, compressed=True):
    """Write one JSON asset under the output folder and record its hash and sizes."""
    blob, decoded_size = encode_asset(value, compressed)
    path = output / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    files[relative] = {"sha256": hashlib.sha256(blob).hexdigest(), "bytes": len(blob), "decodedBytes": decoded_size}


def remove_stale_payloads(output, files):
    """Remove only stale generated task/state payloads, never unrelated files."""
    for directory in (output / "tasks", output / "states"):
        for path in directory.rglob("*.json.gz"):
            if path.relative_to(output).as_posix() not in files:
                path.unlink()


def build_task_assets(task, *, setting, index, status, source_setting):
    """Build one task's index entry, detail record, and state snapshots.

    `task` is the task to publish, `setting` its validation setting, `index`
    its position within that setting, and `source_setting` the setting of the
    folder its row came from. Every release is exported through this function,
    so the explorer's data format is the same for all of them.
    """
    from vendor.explorer_helpers import (
        AUTHORED_TASK_FIELDS, _derive_reference_final, _initialization_literals,
        _initialization_warnings, _reference_diff, _task_to_frontend,
    )

    task_id = task["task_id"]
    validate_task_setting(task, setting)
    # Publish the authored fields. The canary is published beside the task,
    # not inside it.
    authored = {name: value for name, value in task.items() if name in AUTHORED_TASK_FIELDS}
    summary = _task_to_frontend(authored, task_id=task_id)
    detail = _task_to_frontend(authored, include_detail=True, task_id=task_id)
    props = authored.get("task_properties", {})
    for record in (summary, detail):
        record["inferredTaskType"] = record["taskType"]
        record["taskType"] = setting  # Membership was checked against the active task fields.
        record["validationIndex"] = index
        record["cohortStatus"] = status
        record["sourceSetting"] = source_setting
        if props.get("task_name"):
            record["title"] = props["task_name"]
        if props.get("target_capabilities"):
            record["capabilities"] = " | ".join(cap.get("name") or cap.get("id", "") for cap in props["target_capabilities"])
    detail["referenceDiff"] = _reference_diff(authored, serialized_values=False)

    initialization = authored.get("environment_config", {}).get("initialization", {})
    initial = initialization.get("initial_db") or {}
    initial_provenance = "stored_initial_db"
    reason = "Initial database data stored in the selected dataset. No task code was executed."
    warnings = []
    if not initial:
        code = initialization.get("setup_code", "")
        initial = _initialization_literals(code)
        warnings = _initialization_warnings(code, len(initial))
        initial_provenance = "initialization_literals" if initial else "unavailable"
        reason = (
            "JSON database inputs extracted from literal initialization code without executing it. "
            "Runtime loading, defaults, normalization, and later code effects are not reproduced."
            if initial else "No stored initial database or supported literal database inputs are available."
        )
        if warnings:
            reason += " " + " ".join(warnings)
    snapshots = {
        "initial": {"available": bool(initial), "provenance": initial_provenance, "reason": reason,
                    "services": sorted(initial), "data": initial, "warnings": warnings},
        "final": _derive_reference_final(initial, detail["referenceDiff"], warnings),
    }
    detail["stateSnapshots"] = {
        name: {key: value for key, value in snapshot.items() if key != "data"}
        for name, snapshot in snapshots.items()
    }
    return summary, detail, snapshots


def check_instruction_mirrors(task_id, detail):
    """The paper's release keeps the instructions in two places, which must agree:
    the list of instructions with their rubrics, and the joined developer prompt."""
    developer = detail["instructions"]["developer"]
    instructions = developer.get("developer_instruction_chunks", [])
    if developer.get("instruction_text", "") != "\n".join(item["instruction"] for item in instructions):
        raise ValueError(f"Task {task_id}: the joined developer prompt differs from the instructions")


def export_release(args, release):
    """Export the validation tasks of a public release.

    The release is the dataset's revision of the same name. The order of the
    tasks is the order of the rows: setting by setting, file by file. Every
    file is checked before anything is written, and every row while it is
    exported.
    """
    expected_counts = RELEASES[release]["counts"]
    expected_total = sum(expected_counts.values())
    root, hub = resolve_dataset(args.dataset, release)
    # Tasks that the paper's validation set (already exported to public/data) also has.
    paper_canaries = None
    if release != PAPER_RELEASE:
        paper_canaries = {task["id"]: task["contaminationCanary"]
                          for task in json.loads((RELEASES[PAPER_RELEASE]["output"] / "tasks.json").read_text())}

    # Validate every source before writing any output.
    sources = dataset_files(root, expected_counts)
    for setting in SETTINGS:
        for source in sources[setting]:
            for row in read_rows(source["path"]):
                validate_task_setting(task_from_row(row), setting)

    output = (args.output or RELEASES[release]["output"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    summaries, task_records, files = [], [], {}
    state_counts, inferred_counts, service_counts = Counter(), Counter(), Counter()
    rubric_counts = Counter({setting: 0 for setting in SETTINGS})
    total_steps = total_tool_calls = 0
    seen, canaries, markers = set(), set(), set()

    def write_json(relative, value, compressed=True):
        write_asset(output, files, relative, value, compressed)

    for setting in SETTINGS:
        rows = (row for source in sources[setting] for row in read_rows(source["path"]))
        for index, row in enumerate(rows):
            task = task_from_row(row)
            task_id = task["task_id"]
            if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", task_id) or task_id in seen:
                raise ValueError(f"Invalid or duplicate task identifier: {task_id}")
            seen.add(task_id)
            if row["id"] != task_id or row["setting"] != setting:
                raise ValueError(f"Task {task_id}: the row's id or setting differs from its task or its folder")
            canary = row["contamination_canary"]
            match = CANARY.fullmatch(canary or "")
            if match is None or canary in canaries:
                raise ValueError(f"Missing, unexpected, or repeated contamination canary: {task_id}")
            canaries.add(canary)
            markers.add(match["marker"])

            if paper_canaries is None:
                status = "original"
            else:
                status = "retained" if task_id in paper_canaries else "added"
                # A task has the same canary in every release that holds it.
                if status == "retained" and paper_canaries[task_id] != canary:
                    raise ValueError(f"Task {task_id}: its canary differs from the one in {PAPER_RELEASE}")
            summary, detail, snapshots = build_task_assets(
                task, setting=setting, index=index, status=status, source_setting=setting)
            for record in (summary, detail):
                record["contaminationCanary"] = canary
            if release == PAPER_RELEASE:
                check_instruction_mirrors(task_id, detail)
            inferred_counts[summary["inferredTaskType"]] += 1
            service_counts.update(set(summary["tools"]))
            rubric_counts[setting] += sum(
                len(item.get("rubrics", []))
                for item in detail["instructions"]["developer"].get("developer_instruction_chunks", []))
            for trajectory in detail["goldTrajectories"]:
                total_steps += len(trajectory["steps"])
                total_tool_calls += sum(step["action"] == "tool_use" for step in trajectory["steps"])
            for name, snapshot in snapshots.items():
                state_counts[f"{name}Available"] += int(snapshot["available"])
                state_counts[f"{name}UnavailableServices"] += len(snapshot.get("unavailableServices", {}))
                # A state file holds data of the task, so it carries the task's canary too.
                write_json(f"states/{task_id}/{name}.json.gz", {**snapshot, "contaminationCanary": canary})
            write_json(f"tasks/{task_id}.json.gz", detail)
            summaries.append(summary)
            task_records.append({"id": task_id, "setting": setting, "index": index, "status": status,
                                 "sourceSetting": setting})
            if (len(summaries) % 25) == 0:
                print(f"Exported {len(summaries)}/{expected_total} tasks", flush=True)

    if len(seen) != expected_total or Counter(task["taskType"] for task in summaries) != expected_counts:
        raise ValueError(f"Expected {expected_total} unique tasks in {expected_counts}")
    if paper_canaries is not None and not set(paper_canaries) <= seen:
        raise ValueError("The release no longer contains every task of the paper's validation set")
    if len(markers) != 1:
        raise ValueError(f"Expected one benchmark marker in the canaries, found {sorted(markers)}")
    expected_rubrics = RELEASES[release].get("instructionRubrics")
    if expected_rubrics is not None and dict(rubric_counts) != expected_rubrics:
        raise ValueError(f"Instruction rubrics per setting differ from the paper's: {dict(rubric_counts)}")
    write_json("tasks.json", summaries, compressed=False)

    order_text = io.StringIO()
    writer = csv.writer(order_text, delimiter="\t", lineterminator="\n")
    writer.writerow(["output_task_id", "historical_setting", "output_index_0based", "status"])
    for record in task_records:
        writer.writerow([record["id"], record["setting"], record["index"], record["status"]])
    order_path = output / ORDER_FILE
    order_path.write_text(order_text.getvalue())

    status_meaning = ({"original": "the paper's validation set (v1.0.0)"} if paper_canaries is None else
                      {"retained": "also in the paper's 396-task validation set (v1.0.0)", "added": "new in this release"})
    export_manifest = {
        "schemaVersion": 2, "datasetName": "MultiVerse validation", "release": release, "taskCount": expected_total,
        "cohortVersion": f"release-{release}",
        "taskTypes": expected_counts,
        "sourceDataset": {**hub, "split": SPLIT},
        "sourceFiles": {setting: [{key: value for key, value in record.items() if key != "path"} for record in sources[setting]]
                        for setting in SETTINGS},
        "taskOrder": {"file": order_path.name, "sha256": sha256(order_path)},
        "cohort": {"statusCounts": dict(Counter(record["status"] for record in task_records)),
                   "statusMeaning": status_meaning},
        "canary": {"benchmarkPrefix": markers.pop(),
                   "note": "Each task file and each state file carries the contamination canary of its task (contaminationCanary). Exclude documents that contain the benchmark prefix from training corpora."},
        "states": dict(state_counts), "inferredTaskTypes": dict(inferred_counts),
        "tools": dict(sorted(service_counts.items())), "toolCount": len(service_counts),
        "referenceStepCount": total_steps,
        "referenceToolCallCount": total_tool_calls,
        "instructionRubrics": {"perSetting": dict(rubric_counts), "total": sum(rubric_counts.values())},
        "stateNotice": STATE_NOTICE,
        "tasks": task_records, "files": files,
        "totalAssetBytes": sum(value["bytes"] for value in files.values()),
        "totalDecodedBytes": sum(value["decodedBytes"] for value in files.values()),
        "exporter": {"file": "scripts/export_validation.py", "sha256": sha256(Path(__file__))},
        "displayHelpers": {"file": "scripts/vendor/explorer_helpers.py", "sha256": sha256(ROOT / "scripts/vendor/explorer_helpers.py")},
    }
    # Clear the folder of files that do not belong to this release: payloads and
    # empty state folders of tasks that are not in it.
    remove_stale_payloads(output, files)
    for directory in (output / "states").iterdir():
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    (output / "manifest.json").write_text(json.dumps(export_manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({key: export_manifest[key] for key in (
        "release", "sourceDataset", "taskCount", "taskTypes", "toolCount", "referenceStepCount", "referenceToolCallCount",
        "instructionRubrics", "states", "totalAssetBytes", "totalDecodedBytes")}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--release", choices=sorted(RELEASES), required=True,
                        help="Which public release to export")
    parser.add_argument("--dataset", default=DEFAULT_DATASET,
                        help="The dataset on the Hugging Face Hub (hf://datasets/<repository>), read at the revision "
                             "named after the release, or a folder that holds a copy of that revision "
                             f"(default: {DEFAULT_DATASET})")
    parser.add_argument("--output", type=Path,
                        help="Destination (default: public/data for v1.0.0, public/data/v1.1.0 for v1.1.0)")
    args = parser.parse_args()
    export_release(args, args.release)


if __name__ == "__main__":
    main()
