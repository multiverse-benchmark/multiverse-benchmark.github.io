#!/usr/bin/env python3
"""Export the small, illustrative desktop demo from its recorded simulator state."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


def read_authored_sample(raw):
    """The authored demo task, under the names of the task schema.

    The demo's source file names four fields differently from the task schema.
    They are mapped here and nowhere else, so everything that is exported uses
    the schema's names.

    The source also carries the author's note on its gold solution, which the
    task schema has no field for. The note is returned next to the task.
    """
    task = json.loads(raw)
    task["task_id"] = task.pop("colab_id")
    task["user_simulation_metadata"]["query"] = task["user_simulation_metadata"].pop("initial_query")
    task["environment_config"]["available_services"] = task["environment_config"].pop("tools_needed_for_task")
    (trajectory,) = task["gold_trajectories"]
    trajectory["tool_call_count"] = trajectory.pop("number_of_api_calls")
    return task, trajectory.pop("action_description")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="The recorded simulator state of the demo: its initial state, its final state, and the replayed tool calls")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/data/demo.json")
    parser.add_argument("--task-source", type=Path, required=True, help="The authored demo task")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    raw = args.source.read_bytes()
    source = json.loads(raw)
    result = {
        "id": "figure1-message-demo",
        "kind": "illustrative-adaptation",
        "description": "Selected records from a locally replayed, authored demonstration. This is an adapted task, not a scored model attempt.",
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "sourceCache": args.source.name,
        "selection": {"mailThread": "thread-066", "reminderId": "reminder_2", "messages": "all"},
        "states": {},
    }
    for phase in ("initial", "final"):
        state = source[phase]
        mail = state["gridwell_mail"]["users"]["me"]
        result["states"][phase] = {
            "mail": [{k: m.get(k, "") for k in ("id", "sender", "recipient", "subject", "body", "date", "internalDate")}
                     for m in mail["messages"].values() if m.get("threadId") == "thread-066"],
            "messages": [{"id": m["id"], "sender": m["sender"]["contact_name"], "recipient": m["recipient"]["contact_name"],
                          "body": m["message_body"], "timestamp": m["timestamp"], "status": m["status"]}
                         for m in state["messages"]["messages"].values()],
            "reminder": {k: state["generic_reminders"]["reminders"]["reminder_2"][k]
                         for k in ("id", "title", "description", "completed", "schedule")},
        }
    before, after = result["states"]["initial"], result["states"]["final"]
    assert len(before["mail"]) == 1 and len(after["mail"]) == 2
    assert not before["messages"] and len(after["messages"]) == 1
    assert not before["reminder"]["completed"] and after["reminder"]["completed"]
    assert after["mail"][-1]["body"].endswith("Love, Clara")
    assert after["messages"][0]["body"].endswith("Love, Clara")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result_bytes = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode()
    if args.validate_only:
        assert args.output.read_bytes() == result_bytes
    else:
        args.output.write_bytes(result_bytes)
    print(f"Exported verified illustrative demo: {args.output} ({args.output.stat().st_size:,} bytes)")

    # Separate from data/tasks and data/states: the illustrative adaptation
    # must never become a 401st validation task or change the cohort manifest.
    demo_dir = args.output.parent / "demos" / result["id"]
    demo_dir.mkdir(parents=True, exist_ok=True)
    task_raw = args.task_source.read_bytes()
    task, trajectory_note = read_authored_sample(task_raw)
    assert task["task_id"] == result["id"]
    assert len(source["replay_log"]) == 10
    provenance = {
        "demoId": result["id"],
        "validationTask": False,
        "sourceCache": args.source.name,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "taskSourceSha256": hashlib.sha256(task_raw).hexdigest(),
        "authoredToolCalls": len(source["replay_log"]),
    }

    def write_gzip(name, value):
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        output = demo_dir / f"{name}.json.gz"
        compressed = gzip.compress(payload, compresslevel=9, mtime=0)
        if args.validate_only:
            assert output.read_bytes() == compressed, name
        else:
            output.write_bytes(compressed)
        return {"file": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "bytes": output.stat().st_size}

    files = []
    for phase in ("initial", "final"):
        state = {
            "available": True,
            "data": source[phase],
            "services": sorted(source[phase]),
            "provenance": f"illustrative_replay_{phase}",
            "reason": (
                "Illustrative adaptation of the family-dinner task, separate from the validation dataset. "
                + ("This is the cached initial simulator state before the authored demonstration." if phase == "initial" else
                   "This is the cached final simulator state produced by replaying ten authored tool calls; it is not reconstructed from a reference diff.")
                + " The demonstration replies to Julian's email, sends him a text, and completes his reminder. "
                  "It is not a model attempt and has no benchmark score. No simulator is running in this static viewer."
            ),
            "warnings": [],
            "demo": provenance,
        }
        files.append(write_gzip(phase, state))
        # Prove the desktop receives the complete unchanged source snapshot.
        assert json.loads(gzip.decompress((demo_dir / f"{phase}.json.gz").read_bytes()))["data"] == source[phase]
    trajectory = task["gold_trajectories"][0]
    authored_user_query = trajectory["steps"][1]["text"]["content"]
    assert trajectory["steps"][1]["text"]["role"] == "USER"
    assert task["user_simulation_metadata"]["query"] == "[Figure 1 screenshot demo; illustrative adaptation] " + authored_user_query
    compact_raw = {key: task[key] for key in ("task_id", "task_properties", "user_simulation_metadata", "gold_trajectories")}
    compact_raw["environment_config"] = {key: task["environment_config"][key] for key in ("available_services", "developer_instruction")}
    files.append(write_gzip("task", {
        "id": result["id"],
        "kind": "illustrative-adaptation",
        "validationTask": False,
        "title": "Dinner at The Star · illustrative adaptation",
        "prompt": authored_user_query,
        "userSimulation": task["user_simulation_metadata"],
        "rawTask": compact_raw,
        "trajectoryNote": trajectory_note,
        "omittedSourceFields": ["environment_config.initialization"],
        "sourceNote": "The inherited initialization code is not used by this static viewer. Complete recorded replay states and replay responses are exported separately.",
        "demo": provenance,
    }))
    files.append(write_gzip("replay", {"demoId": result["id"], "kind": "authored-local-replay", "sourceSha256": provenance["sourceSha256"], "calls": source["replay_log"]}))
    manifest_bytes = (json.dumps({**provenance, "files": files}, indent=2) + "\n").encode()
    if args.validate_only:
        assert (demo_dir / "manifest.json").read_bytes() == manifest_bytes
    else:
        (demo_dir / "manifest.json").write_bytes(manifest_bytes)
    print(f"Exported matching full desktop demo: {demo_dir} ({sum(f['bytes'] for f in files):,} compressed bytes; {len(source['modules'])} services)")


if __name__ == "__main__":
    main()
