#!/usr/bin/env python3
"""Export the validation-set statistics shown in the page's dataset section.

The paper reports statistics of the 396-task validation set in its task
statistics appendix (tools per service, candidate tools and services per task,
gold tool calls, service usage by family, instruction rubric categories). This
script builds the page's data from the same per-task tables that back those
figures, and checks every number the paper states against the exported
rows, so the interactive plots and the paper cannot disagree.

Inputs (none of them are part of this repository):
  --tables DIR          the figure tables: dataset_tasks.tsv, tool_stats.tsv,
                        service_distribution.tsv
  --tex FILE            snapshot of the paper's root .tex file (service
                        name mapping, rubric category table, stated statistics)
  --validation-set DIR  the 396-task validation set (tasks.json), used to
                        cross-check task membership, settings, and the rubric
                        category counts

Output: src/data/paper/dataset.json. `--validate-only` re-checks the committed
JSON with the standard library only.

Gold user turns supplement the paper tables: the initial request plus nonempty
conversational replies in the exported gold trace. Source metadata records
excluded authoring hints and reconstructed transcript boundaries per task.

Service ids and names are the released (pseudo) names used by the benchmark and
the desktop GUI. The paper's tables use the original service names; they
are mapped through the paper's own mapping table and are not exported.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "paper" / "dataset.json"
SETTINGS = ("ST", "IF", "MT", "MTIF")
SETTING_COUNTS = {"ST": 100, "IF": 97, "MT": 100, "MTIF": 99}
# dataset_tasks.tsv column -> exported per-task field, in export order.
TASK_FIELDS = [
    ("candidate_tools", "candidateTools"),
    ("available_services", "connectedServices"),
    ("gold_calls", "goldCalls"),
    ("gold_unique_tools", "goldTools"),
    ("gold_services", "goldServices"),
    ("query_words", "queryWords"),
    ("hidden_items", "hiddenItems"),
    ("retained_instructions", "instructions"),
    ("retained_checks", "checks"),
]
NUMBER_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}
# Rubric labels of a later release that the paper's category table does not have, with the paper's
# category they belong to. Some unchanged rubrics in v1.1.0 use the more specific first label.
RELEASE_CATEGORY_PARENTS = {"Final-response content and presentation": "Response content and presentation"}
GOLD_USER_TURNS = "goldUserTurns"
TURN_DEFINITION = "Initial user request plus nonempty conversational user replies in the first gold trajectory; excludes authoring hints, system setup, and empty termination messages."
# A revised authoring hint, matched to its UNSPECIFIED_ROLE predecessor in v1.0.0.
# Exact text avoids treating ordinary user replies as hints based on keywords.
REVIEWED_HINTS = {
    "65tz2yg43oyxuhy477etabf0f6jdt0bi": "Re-read the contact-identification developer instruction. Check the conference record identifier as it was returned by the previous tool response and re-call the participants listing using that exact identifier before creating any reminder.",
}
TRANSCRIPT_ROLE = re.compile(r"^\*\*\[(SYSTEM|USER|MODEL|AGENT|THOUGHT)([^\]]*)\]\*\*\s*$", re.M)


def conversation_segments(task: dict):
    """Recover explicit transcript blocks embedded inside a structured text step."""
    for step in task["goldTrajectories"][0]["steps"]:
        text = step.get("content") or ""
        markers = list(TRANSCRIPT_ROLE.finditer(text))
        if not markers:
            yield step["sourceIndex"], step["role"], text.strip(), False
            continue
        if leading := text[:markers[0].start()].strip():
            yield step["sourceIndex"], step["role"], leading, False
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
            role = marker[1] if not marker[2] else "STEERING"
            yield step["sourceIndex"], role, text[marker.end():end].strip(), True


def gold_user_turns(task: dict, reference: dict | None = None) -> tuple[int, dict]:
    """Count conversation turns, checking relabelled hints against the original typed trace.

    v1.1.0 represents authoring hints as USER text. The paper release records
    those same messages as UNSPECIFIED_ROLE. Match their actual contents, and
    fail on an unreviewed change rather than guessing from the task setting.
    """
    normalize = lambda text: " ".join(text.split())
    segments = list(conversation_segments(task))
    prior = list(conversation_segments(reference)) if reference else []
    hints = {normalize(text) for _, role, text, _ in prior if role == "UNSPECIFIED_ROLE" and text}
    systems = {normalize(text) for _, role, text, _ in segments if role == "SYSTEM" and text}
    expected = Counter(normalize(text) for _, role, text, _ in prior
                       if role == "USER" and text and not text.startswith(("USER_QUERY:", "[SYSTEM HINT]")))
    found = Counter()
    replies, embedded, excluded, initial = [], [], Counter(), 0
    for index, role, text, is_embedded in segments:
        if role == "STEERING":
            excluded["markedSteering"] += 1
            continue
        if role != "USER":
            continue
        value = normalize(text)
        if not text:
            excluded["emptyTermination"] += 1
        elif text.startswith("USER_QUERY:"):
            initial += 1
        elif value in systems:
            excluded["systemSetup"] += 1
        elif text.startswith("[SYSTEM HINT]") or value in hints or value == normalize(REVIEWED_HINTS.get(task["id"], "")):
            excluded["authoringHint"] += 1
        else:
            if reference and value not in expected:
                fail(f"unclassified gold user message in {task['id']} at sourceIndex {index}")
            found[value] += 1
            replies.append(index)
            if is_embedded:
                embedded.append(index)
    if initial > 1 or (reference and found != expected):
        fail(f"gold conversation differs from the reviewed reference for {task['id']}")
    # A trace may omit the request; it is still supplied by the task's prompt.
    if not task.get("prompt"):
        fail(f"missing initial request for {task['id']}")
    return 1 + len(replies), {"replySourceIndexes": replies, "embeddedReplySourceIndexes": embedded,
                             "initialRequestInTrajectory": bool(initial), "excluded": dict(excluded)}


def fail(message: str) -> None:
    raise SystemExit(f"export_dataset_stats: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_tsv(path: Path) -> list[dict]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def number(value: float) -> str:
    """Format like the paper: integers without a decimal, thousands separators."""
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{value:,.1f}" if abs(value * 10 - round(value * 10)) < 1e-9 else f"{value:,.2f}"


def plain_tex(tex: str) -> str:
    """Manuscript text with comments, markup commands, and braces removed, for sentence checks."""
    tex = "\n".join(re.split(r"(?<!\\)%", line, maxsplit=1)[0] for line in tex.split("\n"))
    tex = tex.replace("{,}", ",").replace("~", " ").replace("\\S\\ref", "").replace("\\_", "_")
    tex = re.sub(r"\\(newtext|prov|texttt|textbf|emph)\b", "", tex)
    tex = tex.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", tex)


def service_mapping(tex: str) -> dict[str, str]:
    """Original service name -> released (pseudo) name, from the paper's mapping table."""
    start = tex.index("\\label{tab:service-mapping}")
    block = tex[start: tex.index("\\end{tabular}", start)]
    names = [name.replace("\\_", "_") for name in re.findall(r"\\texttt\{([^}]*)\}", block)]
    if len(names) % 2:
        fail("service mapping table has an unpaired name")
    mapping = dict(zip(names[0::2], names[1::2]))
    if len(mapping) != 35 or len(set(mapping.values())) != 35:
        fail(f"expected 35 services in the mapping table, found {len(mapping)}")
    return mapping


def rubric_categories(tex: str) -> list[dict]:
    start = tex.index("\\label{tab:if-groups}")
    block = tex[start: tex.index("\\end{tabular}", start)]
    body = block[block.index("\\midrule") + len("\\midrule"): block.index("\\bottomrule")]
    rows = []
    for raw in body.split("\\\\"):
        cells = [cell.strip() for cell in raw.split("&")]
        if len(cells) != 5:
            continue
        clean = [re.sub(r"\\(newtext|prov)\{([^{}]*)\}", r"\2", cell).strip() for cell in cells]
        rows.append({"name": clean[0], "definition": clean[1], "example": clean[2], "IF": int(clean[3]), "MTIF": int(clean[4])})
    if len(rows) != 9:
        fail(f"expected nine rubric categories, found {len(rows)}")
    return rows


def display_names(gui_apps: Path) -> dict[str, str]:
    names = {}
    for manifest in sorted(gui_apps.glob("*/frontend/manifest.json")):
        names[manifest.parent.parent.name] = json.loads(manifest.read_text())["name"]
    return names


def summarize(values: list[float]) -> dict:
    return {"median": statistics.median(values), "mean": statistics.fmean(values), "min": min(values), "max": max(values)}


def build(args) -> dict:
    tex_raw = args.tex.read_text()
    text = plain_tex(tex_raw)
    mapping = service_mapping(tex_raw)
    names = display_names(args.gui_apps)

    task_rows = read_tsv(args.tables / "dataset_tasks.tsv")
    if len(task_rows) != 396 or len({row["task_id"] for row in task_rows}) != 396:
        fail("dataset_tasks.tsv must list 396 unique tasks")
    if Counter(row["setting"] for row in task_rows) != SETTING_COUNTS:
        fail(f"per-setting task counts differ from {SETTING_COUNTS}")
    tasks = [[row["task_id"], row["setting"], *[int(row[source]) for source, _ in TASK_FIELDS]] for row in task_rows]
    column = {field: [row[2 + index] for row in tasks] for index, (_, field) in enumerate(TASK_FIELDS)}
    by_setting = lambda field, *settings: [row[2 + [name for _, name in TASK_FIELDS].index(field)] for row in tasks if row[1] in settings]

    tool_rows = read_tsv(args.tables / "tool_stats.tsv")
    service_rows = read_tsv(args.tables / "service_distribution.tsv")
    tools_per_service = {row["item"]: int(row["value"]) for row in tool_rows if row["panel"] == "tools_per_service"}
    tasks_per_service = {row["item"]: (int(row["value"]), row["group"]) for row in service_rows if row["panel"] == "tasks_per_service"}
    families = [{"name": row["item"], "pairs": int(row["value"])} for row in service_rows if row["panel"] == "family_task_service_uses"]
    pairs = int(next(row["denominator"] for row in service_rows if row["panel"] == "family_task_service_uses"))
    if set(tools_per_service) != set(mapping) or set(tasks_per_service) != set(mapping):
        fail("service names in the tables differ from the paper's mapping table")
    services = []
    for original, released in mapping.items():
        if released not in names:
            fail(f"no desktop app manifest for service {released!r}")
        gold_tasks, family = tasks_per_service[original]
        # The page shows released names only, so the original name is not exported.
        services.append({"id": released, "name": names[released], "family": family,
                         "tools": tools_per_service[original], "goldTasks": gold_tasks})
    services.sort(key=lambda service: service["id"])
    categories = rubric_categories(tex_raw)

    # ---- every number the paper states must follow from the exported rows
    stated = {
        "candidateToolsMedian": statistics.median(column["candidateTools"]), "candidateToolsMax": max(column["candidateTools"]),
        "connectedServicesMedian": statistics.median(column["connectedServices"]), "connectedServicesMax": max(column["connectedServices"]),
        "goldCallsMedian": statistics.median(column["goldCalls"]), "goldCallsMean": round(statistics.fmean(column["goldCalls"]), 1), "goldCallsMax": max(column["goldCalls"]),
        "goldToolsMedian": statistics.median(column["goldTools"]), "goldToolsMin": min(column["goldTools"]), "goldToolsMax": max(column["goldTools"]),
        "goldServicesMedian": statistics.median(column["goldServices"]), "goldServicesMin": min(column["goldServices"]), "goldServicesMax": max(column["goldServices"]),
        "queryWordsMedian": statistics.median(column["queryWords"]),
        "queryWordsMedianST": statistics.median(by_setting("queryWords", "ST")), "queryWordsMedianMT": statistics.median(by_setting("queryWords", "MT")),
        "toolsPerServiceMedian": statistics.median(tools_per_service.values()),
        "taskServicePairs": sum(column["goldServices"]),
        "rubrics": sum(column["checks"]), "instructions": sum(column["instructions"]),
        "instructionsMedian": statistics.median(by_setting("instructions", "IF", "MTIF")), "checksMedian": statistics.median(by_setting("checks", "IF", "MTIF")),
        "instructionsMin": min(by_setting("instructions", "IF", "MTIF")), "instructionsMax": max(by_setting("instructions", "IF", "MTIF")),
        "multiTurnTasks": len(by_setting("hiddenItems", "MT", "MTIF")), "hiddenItems": sum(by_setting("hiddenItems", "MT", "MTIF")),
        "hiddenItemsMedian": statistics.median(by_setting("hiddenItems", "MT", "MTIF")),
        "services": len(services), "tools": sum(service["tools"] for service in services),
    }
    s = {key: number(value) for key, value in stated.items()}
    word = lambda key: NUMBER_WORDS[int(stated[key])]
    sentences = [
        f"a median of {s['candidateToolsMedian']} candidate tools (maximum {s['candidateToolsMax']}) across a median of {word('connectedServicesMedian')} services (maximum {word('connectedServicesMax')})",
        f"Gold solutions contain a median of {s['goldCallsMedian']} tool calls, and every solution uses at least {word('goldToolsMin')} distinct tools across at least {word('goldServicesMin')} services",
        f"Validation queries have a median of {s['queryWordsMedian']} words ({s['queryWordsMedianST']} for ST and {s['queryWordsMedianMT']} for MT)",
        f"Gold solutions contain a mean of {s['goldCallsMean']} tool calls, with a maximum of {s['goldCallsMax']}",
        f"They use a median of {s['goldToolsMedian']} distinct tools across {s['goldServicesMedian']} services, with maxima of {s['goldToolsMax']} tools and {s['goldServicesMax']} services",
        f"Tools per service across the {s['services']} services (median {s['toolsPerServiceMedian']})",
        f"Candidate tools per validation task (median {s['candidateToolsMedian']}, maximum {s['candidateToolsMax']})",
        f"Services per validation task (median {s['connectedServicesMedian']}, maximum {s['connectedServicesMax']})",
        f"Shares are computed over {s['taskServicePairs']} pairs from 396 tasks",
        f"{s['rubrics']} rubrics from {s['instructions']} instructions across {SETTING_COUNTS['IF']} IF and {SETTING_COUNTS['MTIF']} MTIF tasks (median {s['instructionsMedian']} instructions and {s['checksMedian']} rubrics per task; {s['instructionsMin']}--{s['instructionsMax']} instructions)",
        f"The {s['multiTurnTasks']} multi-turn validation tasks contain {s['hiddenItems']} hidden items, a median of {word('hiddenItemsMedian')} per task",
        f"simulates {s['services']} real-world services with {s['tools']} tools",
    ]
    missing = [sentence for sentence in sentences if sentence not in text]
    if missing:
        fail("the exported rows do not reproduce these paper statements:\n  " + "\n  ".join(missing))
    if pairs != stated["taskServicePairs"] or sum(family["pairs"] for family in families) != pairs:
        fail("task-service pair totals disagree")
    if sum(category["IF"] for category in categories) != sum(by_setting("checks", "IF")) or sum(category["MTIF"] for category in categories) != sum(by_setting("checks", "MTIF")):
        fail("rubric category counts do not add up to the per-task check counts")

    checked_against_set = None
    if args.validation_set:
        definitions = json.loads((args.validation_set / "tasks.json").read_text())
        if {task["task_id"]: task["setting"] for task in definitions} != {row[0]: row[1] for row in tasks}:
            fail("task ids or settings differ from the validation set's tasks.json")
        counts = {setting: Counter() for setting in ("IF", "MTIF")}
        for task in definitions:
            for rubric in task["rubrics"]:
                counts[task["setting"]][rubric["category"]] += 1
        for category in categories:
            if counts["IF"][category["name"]] != category["IF"] or counts["MTIF"][category["name"]] != category["MTIF"]:
                fail(f"rubric category {category['name']!r}: table and tasks.json disagree")
        for task in definitions:
            row = next(item for item in tasks if item[0] == task["task_id"])
            if len(task["rubrics"]) != row[2 + 8] or task["hidden_item_count"] != row[2 + 6] or task["query_words"] != row[2 + 5]:
                fail(f"per-task counts differ from tasks.json for {task['task_id']}")
        checked_against_set = {"tasksJsonSha256": sha256(args.validation_set / "tasks.json"), "tasks": len(definitions)}

    turns = derive(ROOT / "public" / "data")
    counts = {row[0]: row[-1] for row in turns["rows"]}
    for row in tasks:
        row.append(counts[row[0]])
    stated.update(turn_statistics(tasks))
    return {
        "schemaVersion": 1,
        "taskCount": len(tasks),
        "settingCounts": SETTING_COUNTS,
        "catalog": {"services": stated["services"], "tools": stated["tools"]},
        "taskServicePairs": pairs,
        "taskColumns": ["id", "setting", *[field for _, field in TASK_FIELDS], GOLD_USER_TURNS],
        "tasks": tasks,
        "services": services,
        "families": families,
        "rubricCategories": categories,
        "stated": stated,
        "sources": {
            "tables": {name: sha256(args.tables / name) for name in ("dataset_tasks.tsv", "tool_stats.tsv", "service_distribution.tsv")},
            "paper": {"sha256": sha256(args.tex), "statementsChecked": len(sentences)},
            "validationSet": checked_against_set,
            "goldUserTurns": turns["userTurnAudit"],
        },
    }


def stated_statistics(tasks: list[list], services: list[dict]) -> dict:
    """The statistics the page quotes in its text, computed from the per-task rows and the service list."""
    names = [name for _, name in TASK_FIELDS]
    column = {field: [row[2 + index] for row in tasks] for index, field in enumerate(names)}
    by_setting = lambda field, *settings: [row[2 + names.index(field)] for row in tasks if row[1] in settings]
    return {
        "candidateToolsMedian": statistics.median(column["candidateTools"]), "candidateToolsMax": max(column["candidateTools"]),
        "connectedServicesMedian": statistics.median(column["connectedServices"]), "connectedServicesMax": max(column["connectedServices"]),
        "goldCallsMedian": statistics.median(column["goldCalls"]), "goldCallsMean": round(statistics.fmean(column["goldCalls"]), 1), "goldCallsMax": max(column["goldCalls"]),
        "goldToolsMedian": statistics.median(column["goldTools"]), "goldToolsMin": min(column["goldTools"]), "goldToolsMax": max(column["goldTools"]),
        "goldServicesMedian": statistics.median(column["goldServices"]), "goldServicesMin": min(column["goldServices"]), "goldServicesMax": max(column["goldServices"]),
        "queryWordsMedian": statistics.median(column["queryWords"]),
        "queryWordsMedianST": statistics.median(by_setting("queryWords", "ST")), "queryWordsMedianMT": statistics.median(by_setting("queryWords", "MT")),
        "toolsPerServiceMedian": statistics.median(service["tools"] for service in services),
        "taskServicePairs": sum(column["goldServices"]),
        "rubrics": sum(column["checks"]), "instructions": sum(column["instructions"]),
        "instructionsMedian": statistics.median(by_setting("instructions", "IF", "MTIF")), "checksMedian": statistics.median(by_setting("checks", "IF", "MTIF")),
        "instructionsMin": min(by_setting("instructions", "IF", "MTIF")), "instructionsMax": max(by_setting("instructions", "IF", "MTIF")),
        "multiTurnTasks": len(by_setting("hiddenItems", "MT", "MTIF")), "hiddenItems": sum(by_setting("hiddenItems", "MT", "MTIF")),
        "hiddenItemsMedian": statistics.median(by_setting("hiddenItems", "MT", "MTIF")),
        "services": len(services), "tools": sum(service["tools"] for service in services),
        **turn_statistics(tasks),
    }


def turn_statistics(tasks: list[list]) -> dict:
    values = [row[-1] for row in tasks]
    return {"goldUserTurnsMedian": statistics.median(values), "goldUserTurnsMin": min(values),
            "goldUserTurnsMax": max(values), "goldUserTurnsMean": statistics.fmean(values)}


def derive(data_root: Path) -> dict:
    """Per-task rows, tools and gold tasks per service, and rubric category counts of an exported task set.

    Reads the task explorer's export (tasks.json, tasks/*.json.gz) and the tool
    catalog (tool-source/index.json) under `data_root`, with the definitions of
    the paper's statistics: candidate tools are the tools of a task's connected
    services; a gold call belongs to the service whose name is the longest
    prefix of the tool's name; hidden items are the hidden-information entries
    of the user goals; an instruction counts with its rubrics.
    """
    reference_root = ROOT / "public" / "data"
    is_paper = data_root == reference_root
    inputs = [data_root / "tasks.json", data_root / "tool-source" / "index.json", *sorted((data_root / "tasks").glob("*.json.gz"))]
    if not is_paper:
        inputs += [reference_root / "tasks.json", *sorted((reference_root / "tasks").glob("*.json.gz"))]
    fingerprints = {str(path.relative_to(ROOT)): sha256(path) for path in inputs}
    catalog = json.loads((data_root / "tool-source" / "index.json").read_text())
    tools_per_service = Counter(tool["service"] for tool in catalog["tools"] if tool["scope"] == "benchmark")

    def call_service(call: str) -> str | None:
        name = call.replace(".", "_")
        matches = [service for service in tools_per_service if name == service or name.startswith(service + "_")]
        return max(matches, key=len) if matches else None

    # A gold solution records a tool call either as a function-call step or, in later releases, as
    # a code step that makes the call ("# Function Call: service.tool" followed by the call itself).
    header = re.compile(r"^# Function Call: ([A-Za-z_][\w.]*)")
    direct_call = re.compile(r"\b(" + "|".join(map(re.escape, sorted(tools_per_service, key=len, reverse=True))) + r")\.([A-Za-z_]\w*)\(")

    def gold_calls(trajectory: dict) -> list[str]:
        calls = []
        for step in trajectory["steps"]:
            if step["action"] == "tool_use":
                calls.append(step["tool"].replace(".", "_"))
            elif step["action"] == "code":
                code = step.get("code") or ""
                if match := header.match(code):
                    calls.append(match.group(1).replace(".", "_"))
                else:
                    live = "\n".join(line for line in code.splitlines() if not line.lstrip().startswith("#"))
                    calls.extend(f"{service}_{tool}" for service, tool in direct_call.findall(live))
        return calls

    rows, gold_tasks = [], Counter()
    turn_audit, turn_exclusions = {}, Counter()
    categories = {"IF": Counter(), "MTIF": Counter()}
    recorded_differs = []
    for summary in json.loads((data_root / "tasks.json").read_text()):
        with gzip.open(data_root / "tasks" / f"{summary['id']}.json.gz", "rt") as stream:
            task = json.load(stream)
        reference = None
        reference_path = reference_root / "tasks" / f"{summary['id']}.json.gz"
        if not is_paper and reference_path.exists():
            with gzip.open(reference_path, "rt") as stream:
                reference = json.load(stream)
        user_turns, audit = gold_user_turns(task, reference)
        turn_audit[summary["id"]] = audit
        turn_exclusions.update(audit["excluded"])
        calls = gold_calls(task["goldTrajectories"][0])
        recorded = task["goldTrajectories"][0].get("recordedToolCallCount")
        if recorded not in (None, "") and int(recorded) != len(calls):
            recorded_differs.append((summary["id"], int(recorded), len(calls)))
        used = {service for call in calls if (service := call_service(call))}
        chunks = task["instructions"]["developer"].get("developer_instruction_chunks", [])
        goals = task["userSimulation"].get("user_goals") or []
        connected = set(task["tools"])
        rows.append([
            summary["id"], summary["taskType"],
            sum(tools_per_service[service] for service in connected), len(connected),
            len(calls), len(set(calls)), len(used), len(task["prompt"].split()),
            sum(len(goal.get("hidden_information") or {}) for goal in goals),
            len(chunks), sum(len(chunk.get("rubrics", [])) for chunk in chunks),
            user_turns,
        ])
        gold_tasks.update(used)
        if summary["taskType"] in categories:
            for chunk in chunks:
                for rubric in chunk.get("rubrics", []):
                    categories[summary["taskType"]][rubric.get("category")] += 1
    if fingerprints != {str(path.relative_to(ROOT)): sha256(path) for path in inputs}:
        fail("task inputs changed while deriving statistics; retry from a stable export")
    return {"rows": rows, "toolsPerService": dict(tools_per_service), "goldTasks": dict(gold_tasks), "categories": categories,
            "recordedCallCountDiffers": recorded_differs,
            "userTurnAudit": {"definition": TURN_DEFINITION,
                              "inputFilesSha256": hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest(),
                              "referenceReleaseForHintRoles": None if is_paper else "v1.0.0",
                              "exclusions": dict(turn_exclusions), "tasks": turn_audit}}


def build_release(release: str) -> dict:
    """Statistics of a later public release, derived from its exported tasks and tool catalog.

    The paper states these statistics for its own validation set only, so there
    is no paper text to check against. Instead the derivation is first run
    on the paper's exported tasks and must reproduce the committed file (every
    per-task row, the per-service counts, the family totals, and the rubric
    category counts). Service names, families, and the rubric category
    definitions are those of the committed file.
    """
    paper = json.loads(OUT.read_text())
    columns = paper["taskColumns"]
    if columns != ["id", "setting", *[field for _, field in TASK_FIELDS], GOLD_USER_TURNS]:
        fail("the committed file has other task columns than this exporter writes")

    reference = derive(ROOT / "public" / "data")
    if sorted(reference["rows"]) != sorted(paper["tasks"]):
        fail("the derivation does not reproduce the paper's per-task rows")
    for service in paper["services"]:
        if reference["toolsPerService"].get(service["id"]) != service["tools"] or reference["goldTasks"].get(service["id"], 0) != service["goldTasks"]:
            fail(f"the derivation does not reproduce the paper's counts for service {service['id']!r}")
    for category in paper["rubricCategories"]:
        if reference["categories"]["IF"][category["name"]] != category["IF"] or reference["categories"]["MTIF"][category["name"]] != category["MTIF"]:
            fail(f"the derivation does not reproduce the paper's count for rubric category {category['name']!r}")

    data_root = ROOT / "public" / "data" / release
    derived = derive(data_root)
    tasks = sorted(derived["rows"])
    if set(derived["toolsPerService"]) != {service["id"] for service in paper["services"]}:
        fail("the release has other services than the paper's release")
    services = [{**service, "tools": derived["toolsPerService"][service["id"]], "goldTasks": derived["goldTasks"].get(service["id"], 0)}
                for service in paper["services"]]
    families = [{"name": family["name"], "pairs": sum(service["goldTasks"] for service in services if service["family"] == family["name"])}
                for family in paper["families"]]
    known = {category["name"] for category in paper["rubricCategories"]}
    # A release can label rubrics more finely than the paper's nine categories. Such a label is
    # counted under the paper's category that contains it; mergedRubricLabels records the mapping.
    merged = {}
    for label, parent in RELEASE_CATEGORY_PARENTS.items():
        count = derived["categories"]["IF"][label] + derived["categories"]["MTIF"][label]
        if count:
            merged[label] = {"countedUnder": parent, "rubrics": count}
            for setting in ("IF", "MTIF"):
                derived["categories"][setting][parent] += derived["categories"][setting].pop(label, 0)
    seen = set(derived["categories"]["IF"]) | set(derived["categories"]["MTIF"])
    if seen - known:
        fail(f"rubric categories without a definition: {sorted(str(name) for name in seen - known)}")
    categories = [{**category, "IF": derived["categories"]["IF"][category["name"]], "MTIF": derived["categories"]["MTIF"][category["name"]]}
                  for category in paper["rubricCategories"]]
    stated = stated_statistics(tasks, services)
    return {
        "schemaVersion": 1,
        "release": release,
        "taskCount": len(tasks),
        "settingCounts": {setting: sum(row[1] == setting for row in tasks) for setting in SETTINGS},
        "catalog": {"services": stated["services"], "tools": stated["tools"]},
        "taskServicePairs": stated["taskServicePairs"],
        "taskColumns": columns,
        "tasks": tasks,
        "services": services,
        "families": families,
        "rubricCategories": categories,
        "mergedRubricLabels": merged,
        "stated": stated,
        "sources": {
            "taskExport": {"manifest": f"public/data/{release}/manifest.json", "sha256": sha256(data_root / "manifest.json")},
            "toolCatalog": {"index": f"public/data/{release}/tool-source/index.json", "sha256": sha256(data_root / "tool-source" / "index.json")},
            "derivation": "Computed from the exported tasks with the definitions of the paper's statistics; the same computation reproduces src/data/paper/dataset.json from the paper's exported tasks. Gold tool calls are counted from the steps of the gold solution (function-call steps and code steps that make one call).",
            "recordedCallCountDiffers": {"tasks": len(derived["recordedCallCountDiffers"]),
                                         "note": "Tasks whose stored call count differs from the number of call steps in the gold solution; the steps are counted."},
            "goldUserTurns": derived["userTurnAudit"],
        },
    }


def validate(data: dict, task_count: int = 396, setting_counts: dict = SETTING_COUNTS, tool_count: int = 809) -> None:
    columns = data["taskColumns"]
    assert columns == ["id", "setting", *[field for _, field in TASK_FIELDS], GOLD_USER_TURNS]
    tasks = data["tasks"]
    assert data["taskCount"] == len(tasks) == task_count and len({row[0] for row in tasks}) == task_count
    assert Counter(row[1] for row in tasks) == data["settingCounts"] == setting_counts
    assert all(len(row) == len(columns) and all(isinstance(value, int) and value >= 0 for value in row[2:]) for row in tasks)
    index = {name: position for position, name in enumerate(columns)}
    assert all(row[index["instructions"]] == row[index["checks"]] == 0 for row in tasks if row[1] in ("ST", "MT"))
    assert all(row[index["hiddenItems"]] == 0 for row in tasks if row[1] in ("ST", "IF"))
    assert all(row[index["goldServices"]] <= row[index["connectedServices"]] and row[index["goldTools"]] <= row[index["candidateTools"]] for row in tasks)
    assert all(row[index[GOLD_USER_TURNS]] >= 1 for row in tasks)
    assert all(data["stated"][name] == value for name, value in turn_statistics(tasks).items())
    audit = data["sources"]["goldUserTurns"]
    assert set(audit["tasks"]) == {row[0] for row in tasks} and audit["definition"] == TURN_DEFINITION
    assert all(row[index[GOLD_USER_TURNS]] == 1 + len(audit["tasks"][row[0]]["replySourceIndexes"]) for row in tasks)
    services = data["services"]
    assert len(services) == data["catalog"]["services"] == 35 and sum(service["tools"] for service in services) == data["catalog"]["tools"] == tool_count
    assert sum(service["goldTasks"] for service in services) == data["taskServicePairs"] == sum(row[index["goldServices"]] for row in tasks)
    assert sum(family["pairs"] for family in data["families"]) == data["taskServicePairs"]
    assert {service["family"] for service in services} == {family["name"] for family in data["families"]}
    for family in data["families"]:
        assert family["pairs"] == sum(service["goldTasks"] for service in services if service["family"] == family["name"])
    assert len(data["rubricCategories"]) == 9
    assert sum(category["IF"] + category["MTIF"] for category in data["rubricCategories"]) == sum(row[index["checks"]] for row in tasks) == data["stated"]["rubrics"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tables", type=Path)
    parser.add_argument("--tex", type=Path)
    parser.add_argument("--validation-set", type=Path)
    parser.add_argument("--gui-apps", type=Path, default=ROOT / "gui-src" / "apps")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--release", help="a later public release, for example v1.1.0: derive its statistics from "
                        "public/data/<release> and write src/data/dataset.<release>.json")
    args = parser.parse_args()
    if args.release:
        out = ROOT / "src" / "data" / f"dataset.{args.release}.json"
        catalog = json.loads((ROOT / "public" / "data" / args.release / "tool-source" / "index.json").read_text())
        expected = dict(task_count=400, setting_counts={setting: 100 for setting in SETTINGS}, tool_count=catalog["statistics"]["benchmarkToolCount"])
        data = json.loads(out.read_text()) if args.validate_only else build_release(args.release)
        validate(data, **expected)
        if not args.validate_only:
            out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
            print(f"Wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
        print(f"Dataset statistics of {args.release} are internally consistent: {data['taskCount']} tasks, 35 services, {data['catalog']['tools']} tools, 9 rubric categories.")
        return
    if args.validate_only:
        validate(json.loads(OUT.read_text()))
        print("Dataset statistics are internally consistent: 396 tasks, 35 services, 9 rubric categories.")
        return
    if not args.tables or not args.tex:
        parser.error("--tables and --tex are required (or use --validate-only)")
    data = build(args)
    validate(data)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Checked {data['sources']['paper']['statementsChecked']} paper statements against the exported rows: all reproduced.")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        sys.exit(f"export_dataset_stats: validation failed: {error!r}")
