#!/usr/bin/env python3
"""Export the illustrative paper Figure 1 demo, separate from validation tasks.

Copies exact authored wording and cached local replay evidence. Does not import
or execute simulator/task code, grade a model, or modify the 400-task export.
"""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode

from export_demo import read_authored_sample

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data"
DEMO_ID = "figure1-message-demo"
# File name of the authored demo task, as the exported provenance records it.
TASK_SOURCE_NAME = "figure1-message-demo.json"
DEMO_DIR = f"demos/{DEMO_ID}"
OUTPUT = DATA / "dinner-showcase.json"
CONTACT_ID = "people/vip-julian-vance-001"


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def load(relative):
    blob = (DATA / relative).read_bytes()
    return json.loads(gzip.decompress(blob) if relative.endswith(".gz") else blob)


def pointer(parts):
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def source_ref(asset, parts):
    return {"asset": "data/" + asset, "jsonPointer": pointer(parts)}


def desktop(phase, app="gridwell_mail", record=None, view=None):
    params = {"demo": DEMO_ID, "phase": phase, "app": app}
    if record is not None:
        params["record"] = record
    if view:
        params["view"] = view
    return "gui/index.html?" + urlencode(params)


def selected(record, fields):
    return {key: record[key] for key in fields if key in record}


def build(task_source=None, cache_source=None, *, require_original=False, exporter_sha256=None):
    """Rebuild from the exported assets, cross-checking the sources when they are given.

    The demo manifest hashes its task, snapshot and replay assets and keeps the
    fingerprints of the two sources. Regeneration requires both sources;
    validation works from the exported assets alone.
    """
    validation = load("tasks.json")
    assert len(validation) == load("manifest.json")["taskCount"]
    assert DEMO_ID not in {task["id"] for task in validation}
    demo_manifest = load(f"{DEMO_DIR}/manifest.json")
    assert demo_manifest["validationTask"] is False
    for record in demo_manifest["files"]:
        blob = (DATA / DEMO_DIR / record["file"]).read_bytes()
        assert len(blob) == record["bytes"] and sha(blob) == record["sha256"]

    task_asset = f"{DEMO_DIR}/task.json.gz"
    replay_asset = f"{DEMO_DIR}/replay.json.gz"
    task_export = load(task_asset)
    compact_raw = task_export["rawTask"]
    authored = compact_raw
    assert authored["task_id"] == DEMO_ID
    replay_export = load(replay_asset)
    assert replay_export["sourceSha256"] == demo_manifest["sourceSha256"]
    assert task_export["demo"]["taskSourceSha256"] == demo_manifest["taskSourceSha256"]
    state_assets = {phase: f"{DEMO_DIR}/{phase}.json.gz" for phase in ("initial", "final")}
    snapshots = {phase: load(asset) for phase, asset in state_assets.items()}
    for phase in snapshots:
        assert snapshots[phase]["demo"]["sourceSha256"] == demo_manifest["sourceSha256"]
        assert snapshots[phase]["services"] == sorted(snapshots[phase]["data"])
    cache = {"modules": snapshots["initial"]["services"], "initial": snapshots["initial"]["data"],
             "final": snapshots["final"]["data"], "replay_log": replay_export["calls"]}
    assert snapshots["initial"]["services"] == snapshots["final"]["services"]
    task_given = task_source is not None and task_source.is_file()
    cache_given = cache_source is not None and cache_source.is_file()
    if require_original and not (task_given and cache_given):
        raise FileNotFoundError("Regeneration requires --task-source and --cache-source; --validate-only works from the exported assets.")
    if task_given:
        task_bytes = task_source.read_bytes()
        assert sha(task_bytes) == demo_manifest["taskSourceSha256"], "Original authored sample changed"
        original, trajectory_note = read_authored_sample(task_bytes)
        assert task_export["trajectoryNote"] == trajectory_note
        for key in ("task_id", "task_properties", "user_simulation_metadata", "gold_trajectories"):
            assert compact_raw[key] == original[key]
        for key in ("developer_instruction", "available_services"):
            assert compact_raw["environment_config"][key] == original["environment_config"][key]
    if cache_given:
        cache_bytes = cache_source.read_bytes()
        assert sha(cache_bytes) == demo_manifest["sourceSha256"], "Original replay cache changed"
        original = json.loads(cache_bytes)
        assert sorted(original["modules"]) == sorted(cache["modules"])
        for key in ("initial", "final", "replay_log"):
            assert original[key] == cache[key]
    initial, final = cache["initial"], cache["final"]

    trajectory = authored["gold_trajectories"][0]
    steps = trajectory["steps"]
    assert len(steps) == int(trajectory["step_count"]) == 15
    assert len(cache["replay_log"]) == int(trajectory["tool_call_count"]) == 10
    query = steps[1]["text"]["content"]
    assert steps[1]["text"]["role"] == "USER"
    assert authored["user_simulation_metadata"]["query"] == "[Figure 1 screenshot demo; illustrative adaptation] " + query
    assert task_export["prompt"] == query and "7:30" not in query
    instruction_text = authored["environment_config"]["developer_instruction"]["instruction_text"]
    instructions = instruction_text.splitlines()
    assert len(instructions) == 3
    system_text = steps[0]["text"]["content"]
    assert steps[0]["text"]["role"] == "SYSTEM" and system_text.endswith(instruction_text)
    assert "verification" not in authored
    assert "user_goals" not in authored["user_simulation_metadata"]
    titles = ["Email → text message", "Text message → reminder", "Sign off: Love, Clara"]
    developer = [{"id": f"demo-instruction-{i}", "title": titles[i], "text": text,
                  "type": "AUTHORED_DEMO_INSTRUCTION", "sourceRole": "SYSTEM", "rubrics": [],
                  "sourcePath": "/rawTask/environment_config/developer_instruction/instruction_text",
                  "sourceLine": i + 1,
                  "sourceRefs": [source_ref(task_asset, ["rawTask", "environment_config", "developer_instruction", "instruction_text"]),
                                 source_ref(task_asset, ["rawTask", "gold_trajectories", 0, "steps", 0, "text", "content"])]}
                 for i, text in enumerate(instructions)]

    services = sorted(cache["modules"])
    assert len(services) == 7 and "messages" in services and "phone" not in services
    replay_by_step = {row["index"]: (i, row) for i, row in enumerate(cache["replay_log"])}
    by_service = Counter()
    trajectory_steps, calls = [], []
    for index, step in enumerate(steps):
        path = ["rawTask", "gold_trajectories", 0, "steps", index]
        item = {"step": index + 1, "sourceIndex": index, "sourcePath": pointer(path)}
        if "text" in step:
            text = step["text"]
            item.update({"kind": "message", "role": {"AGENT": "assistant", "USER": "user", "SYSTEM": "system"}[text["role"]],
                         "sourceRole": text["role"], "text": text["content"],
                         "sourcePath": pointer(path + ["text", "content"]), "authored": True})
        else:
            call = step["function_call"]
            replay_index, replay = replay_by_step[index]
            assert replay["name"] == call["name"] and replay["arguments"] == call["arguments"]
            service = next(service for service in sorted(services, key=len, reverse=True) if call["name"].startswith(service + "_"))
            by_service[service] += 1
            item.update({"kind": "tool_call", "tool": call["name"], "arguments": call["arguments"], "service": service,
                         "sourcePath": pointer(path + ["function_call"]),
                         "replayResult": source_ref(replay_asset, ["calls", replay_index, "live_result"]),
                         "replayStatus": replay["status"]})
            calls.append(item)
        trajectory_steps.append(item)
    assert len(calls) == 10
    assert all(row["status"] == "no_recorded" for row in cache["replay_log"])
    question, answer = trajectory_steps[8], trajectory_steps[9]
    assert question["text"] == "Could you please let me know what the new time is?"
    assert answer["text"] == "7:30 PM"
    assert trajectory_steps[14]["text"] == "Email sent; Julian texted; reminder closed."
    assert [steps[i]["function_call"]["name"] for i in (11, 12, 13)] == ["gridwell_mail_send_message", "messages_send_chat_message", "generic_reminders_modify_reminder"]

    before_mail = initial["gridwell_mail"]["users"]["me"]["messages"]
    after_mail = final["gridwell_mail"]["users"]["me"]["messages"]
    before_texts, after_texts = initial["messages"]["messages"], final["messages"]["messages"]
    before_reminders, after_reminders = initial["generic_reminders"]["reminders"], final["generic_reminders"]["reminders"]
    added_mail = sorted(set(after_mail) - set(before_mail))
    added_texts = sorted(set(after_texts) - set(before_texts))
    changed_reminders = sorted(key for key in set(before_reminders) | set(after_reminders) if before_reminders.get(key) != after_reminders.get(key))
    assert added_mail == ["msg_354"] and added_texts == ["msg_1"] and not before_texts
    assert changed_reminders == ["reminder_2"]
    assert before_reminders["reminder_2"]["completed"] is False and after_reminders["reminder_2"]["completed"] is True
    assert before_reminders["reminder_2"]["title"] == "Message Julian - The Star"
    for reminders in (before_reminders, after_reminders):
        reminder = reminders["reminder_2"]
        assert reminder["repeat_every_n"] == 0 and reminder["repeat_interval_unit"] is None
        assert "repeat" not in reminder["schedule"]
        assert reminder["start_date"] == "2026-02-15" and reminder["time_of_day"] == "02:00:00"
        assert reminder["am_pm_or_unknown"] == "PM"
    for source_index, reminders in ((7, before_reminders), (13, after_reminders)):
        response = replay_by_step[source_index][1]["live_result"]["reminders"]
        assert next(row for row in response if row["id"] == "reminder_2") == reminders["reminder_2"]
    assert all(before_mail[key] == after_mail[key] for key in before_mail)
    reply, text = after_mail["msg_354"], after_texts["msg_1"]
    assert reply["body"] == steps[11]["function_call"]["arguments"]["msg"]["body"]
    assert text["message_body"] == steps[12]["function_call"]["arguments"]["message_body"]
    assert reply["body"].endswith("Love, Clara") and text["message_body"].endswith("Love, Clara")
    assert all(value in reply["body"] for value in ("7:30 PM", "3", "patio"))
    assert reply["threadId"] == "thread-066" and reply["recipient"] == "julian.vance@gridwellmail.com"
    assert text["recipient"]["contact_id"] == CONTACT_ID and text["status"] == "sent"
    assert text["recipient"]["contact_endpoints"][0]["endpoint_value"] == "+14696230199"
    assert "6:30 PM" in before_mail["msg_0110"]["body"]
    unchanged_services = sorted(service for service in services if initial[service] == final[service])
    assert unchanged_services == ["clock", "contacts", "gridwell_calendar", "notes_and_lists"]

    def record(key, label, service, path, fields):
        result = {"id": key, "label": label, "service": service, "values": {}, "sources": {}}
        for phase in ("initial", "final"):
            value = cache[phase]
            try:
                for part in path:
                    value = value[part]
            except KeyError:
                value = None
            result["values"][phase] = selected(value, fields) if value is not None else None
            result["sources"][phase] = source_ref(state_assets[phase], ["data", *path])
        return result

    mail_fields = ["id", "threadId", "sender", "recipient", "subject", "body", "date", "labelIds"]
    records = {
        "initialEmail": record("msg_0110", "Julian's original reservation email", "gridwell_mail", ["gridwell_mail", "users", "me", "messages", "msg_0110"], mail_fields),
        "reply": record("msg_354", "Replayed email reply", "gridwell_mail", ["gridwell_mail", "users", "me", "messages", "msg_354"], mail_fields),
        "thread": record("thread-066", "Dinner email thread", "gridwell_mail", ["gridwell_mail", "users", "me", "threads", "thread-066"], ["id", "messageIds"]),
        "message": record("msg_1", "Replayed text message to Julian", "messages", ["messages", "messages", "msg_1"], ["id", "sender", "recipient", "message_body", "timestamp", "status", "thread_id"]),
        "reminder": record("reminder_2", "Message Julian - The Star", "generic_reminders", ["generic_reminders", "reminders", "reminder_2"], ["id", "title", "description", "completed", "deleted", "schedule", "updated_at"]),
        "contact": record(CONTACT_ID, "Julian's saved contact", "contacts", ["contacts", "myContacts", CONTACT_ID], ["resourceName", "names", "emailAddresses", "phoneNumbers", "notes"]),
    }

    def target(phase, summary, app, id=None):
        return {"summary": summary, "app": app, "record": id, "view": None, "href": desktop(phase, app, id)}

    items = [
        {"id": "mail", "title": "Reply to Julian's dinner email", "summary": "The locally replayed reply asks for 7:30 PM, three people, and patio seating, and ends with Love, Clara.", "recordKeys": ["initialEmail", "reply", "thread"],
         "before": target("initial", "Julian's original dinner email says 6:30 PM; the thread has no rescheduling reply yet.", "gridwell_mail", "thread-066"),
         "after": target("final", "The thread includes the new 7:30 PM reply signed Love, Clara.", "gridwell_mail", "thread-066")},
        {"id": "contact", "title": "Find Julian's mobile number", "summary": "The authored call sequence searches Contacts for Julian; the text uses his saved mobile endpoint. The contact stays unchanged.", "recordKeys": ["contact"],
         "before": target("initial", "Julian's saved contact lists +1 469-623-0199 as his primary mobile.", "contacts", CONTACT_ID),
         "after": target("final", "The same contact remains available after the demo's text is sent.", "contacts", CONTACT_ID)},
        {"id": "messages", "title": "Send the follow-up text", "summary": "The replay creates one text asking Julian to check the email, signed Love, Clara.", "recordKeys": ["message"],
         "before": target("initial", "Julian's native conversation has no messages yet in the demo's empty message store.", "messages", CONTACT_ID),
         "after": target("final", "A sent text asks Julian to check the dinner email and ends with Love, Clara.", "messages", "msg_1")},
        {"id": "reminder", "title": "Complete the matching reminder", "summary": "After the text, the authored tool sequence completes Message Julian - The Star; the cached final state records that update.", "recordKeys": ["reminder"],
         "before": target("initial", '"Message Julian - The Star" is open (completed: false).', "generic_reminders", "reminder_2"),
         "after": target("final", '"Message Julian - The Star" is completed (completed: true).', "generic_reminders", "reminder_2")},
    ]
    query_path = "/rawTask/gold_trajectories/0/steps/1/text/content"
    goal_summary = "Ask Julian to reschedule tonight's family dinner at The Star to the new time, keeping the party of three and patio seating."
    requirements = ["Reply in Julian's dinner email thread with the user-provided time, keeping three people and patio seating.",
                    "After the email reply, send Julian a short text asking him to check it.",
                    "After the text, complete open reminders that mention Julian.",
                    "End both the email and the text with Love, Clara."]
    action_order = [{"tool": steps[i]["function_call"]["name"], "label": label, "sourceIndex": i, "step": i + 1}
                    for i, label in ((11, "Email reply"), (12, "Text message"), (13, "Reminder update"))]
    assets = [task_asset, replay_asset, *state_assets.values(), f"{DEMO_DIR}/manifest.json"]
    return {
        "schemaVersion": 2, "kind": "illustrative-adaptation", "validationTask": False,
        "task": {"id": DEMO_ID, "kind": "illustrative-adaptation", "validationTask": False,
                 "title": authored["task_properties"]["task_name"], "setting": "Illustrative adaptation",
                 "cohortStatus": "outside-validation", "query": query, "sourcePath": query_path,
                 "context": authored["user_simulation_metadata"]["global_context_variables"],
                 "userGoalSummary": goal_summary, "userGoalSummaryKind": "editorial summary of the authored USER request",
                 "authoringPurpose": authored["user_simulation_metadata"]["goal"],
                 "authoringPurposeSourcePath": "/rawTask/user_simulation_metadata/goal",
                 "narrative": "Prepared for the paper's Figure 1, this authored demonstration connects an email reply to a follow-up text and a completed reminder. Both outgoing messages end with Love, Clara. Ten tool calls were replayed locally; the dialogue is authored and this is not an evaluated model attempt.",
                 "narrativeKind": "editorial summary of the authored demo and replay provenance", "services": services},
        "goals": [{"id": "user-request-summary", "text": goal_summary, "kind": "derived_summary", "sourcePath": query_path}],
        "developerInstructions": developer, "developerInstructionText": instruction_text,
        "instructionNote": "These three rules are stored in the demo's developer_instruction.instruction_text and appear verbatim in its authored SYSTEM step. They are the paper-demo instructions, not additional validation-task rules.",
        "clarification": {"hiddenInformation": [], "userProvidedValue": answer["text"],
                          "referenceDialogue": [{key: entry[key] for key in ("role", "text", "sourceIndex", "step", "sourcePath")} for entry in (question, answer)],
                          "note": "This clarification exchange was authored for the paper demonstration. The USER reply supplies 7:30 PM; it is not a newly generated conversation. The demo has no separate structured hidden-information field."},
        "expectedOutcome": {"exactText": None, "steps": requirements, "highlights": requirements,
                            "kind": "derived_requirements", "note": "These requirements summarize the authored USER request, its supplied clarification, and the three demo instructions. The source has no separate desired-state checklist or evaluation rubrics.",
                            "sourcePaths": [query_path, "/rawTask/gold_trajectories/0/steps/9/text/content", "/rawTask/environment_config/developer_instruction/instruction_text"]},
        "acceptanceCriteria": [],
        "evaluation": {"taskRubricCount": 0, "developerRubricCount": 0, "countsByVerifier": {},
                       "scored": False, "note": "No authored evaluation rubrics, verifier scores, or model attempt are attached to this illustrative demo. No evaluation checks are invented by this export."},
        "referenceEvidence": {
            "kind": "cached_local_simulator_replay", "items": items, "records": records,
            "changes": {"addedMessageIds": added_mail, "addedTextMessageIds": added_texts, "changedReminderIds": changed_reminders,
                        "unchangedServices": unchanged_services, "initialMessageCount": len(before_mail), "replayFinalMessageCount": len(after_mail),
                        "initialTextMessageCount": len(before_texts), "replayFinalTextMessageCount": len(after_texts)},
            "trajectorySteps": trajectory_steps,
            "trajectorySummary": {"source": task_export["trajectoryNote"], "authored": True, "modelAttempt": False,
                                  "stepCount": 15, "toolCallCount": 10, "availableServiceCount": len(services),
                                  "usedServiceCount": len(by_service), "serviceCounterRequired": False,
                                  "usedServices": sorted(by_service), "unusedServices": sorted(set(services) - set(by_service)),
                                  "callsByService": dict(sorted(by_service.items())), "actionOrder": action_order,
                                  "finalResponse": {"text": trajectory_steps[14]["text"], "sourceIndex": 14, "step": 15, "authored": True,
                                                    "sourcePath": "/rawTask/gold_trajectories/0/steps/14/text/content"},
                                  "replayStatusNote": "Each cached call has status no_recorded: the authored call had no recorded response to compare. The cache's live_result contains its local simulator replay response; this status is not a success grade."},
            "snapshotProvenance": {phase: {key: value for key, value in snapshots[phase].items() if key != "data"} for phase in snapshots},
            "limitations": ["This is an authored illustrative adaptation outside the validation dataset, not a scored model run.",
                            "The dialogue and tool sequence are authored. Tool responses and before/after states come from the existing local simulator replay cache; the export does not rerun that simulator.",
                            "Cached final states are replay results, not reconstructions from a reference database diff. State alone does not establish dialogue or action order; the authored sequence and replay log provide that separate context.",
                            "The email asks Julian to change dinner. The local replay does not establish a real restaurant booking change or real-world email/text delivery."],
        },
        "links": {"task": "data/" + task_asset, "taskDetail": "data/" + task_asset,
                  "initialDesktop": desktop("initial", "gridwell_mail", "thread-066"),
                  "finalDesktop": desktop("final", "gridwell_mail", "thread-066"),
                  "initialSnapshot": "data/" + state_assets["initial"], "finalSnapshot": "data/" + state_assets["final"],
                  "replayLog": "data/" + replay_asset, "demoManifest": "data/" + f"{DEMO_DIR}/manifest.json"},
        "provenance": {"sourceDemoId": DEMO_ID, "validationTask": False, "kind": "illustrative-adaptation",
                       "taskSource": {"file": TASK_SOURCE_NAME, "sha256": demo_manifest["taskSourceSha256"]},
                       "replayCache": {"file": demo_manifest["sourceCache"], "sha256": demo_manifest["sourceSha256"]},
                       "querySource": {"asset": "data/" + task_asset, "jsonPointer": query_path,
                                       "note": "Exact authored USER step. The metadata query differs only by its explicitly labeled illustrative-demo prefix."},
                       "inputHashes": [{"asset": "data/" + asset, "bytes": (DATA / asset).stat().st_size,
                                        "sha256": sha((DATA / asset).read_bytes())} for asset in assets],
                       "exporter": "scripts/export_showcase.py", "exporterSha256": exporter_sha256 or sha(Path(__file__).read_bytes()),
                       "method": "Copy exact authored text and selected cached replay records; derive explicitly labeled summaries and byte-verified before/after comparisons. No task code, verifier, or model is executed."},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--task-source", type=Path, help="The authored demo task (needed to regenerate)")
    parser.add_argument("--cache-source", type=Path, help="The recorded simulator state of the demo (needed to regenerate)")
    args = parser.parse_args()
    # The recorded fingerprint identifies the code that generated the existing asset.
    exporter_sha256 = json.loads(OUTPUT.read_bytes())["provenance"]["exporterSha256"] if args.validate_only else None
    result = build(args.task_source, args.cache_source, require_original=not args.validate_only,
                   exporter_sha256=exporter_sha256)
    payload = (json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if args.validate_only:
        assert OUTPUT.read_bytes() == payload, "Showcase differs from its exact authored/replay sources"
    else:
        OUTPUT.write_bytes(payload)
    print(json.dumps({"asset": "data/dinner-showcase.json", "kind": "illustrative-adaptation", "validationTask": False,
                      "bytes": len(payload), "sha256": sha(payload), "instructions": 3, "authoredSteps": 15,
                      "replayedToolCalls": 10, "evaluationRubrics": 0, "evidenceCards": 4}))


if __name__ == "__main__":
    main()
