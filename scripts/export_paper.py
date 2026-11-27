#!/usr/bin/env python3
"""Export paper-derived data for the project page.

The leaderboard, the bar chart, and the benchmark comparison table on the
project page show numbers and marks taken from the MultiVerse paper. This
script derives them from three inputs so that nothing is typed by hand:

  1. a snapshot of the paper source (the root .tex file),
  2. the main-results table that backs the paper's full success-rate figure
     (label fig:main-results-full; one row per setting, model, and harness),
  3. that figure's PDF, used to check every exported cell against what the
     paper actually prints.

Outputs (under src/data/paper/):
  leaderboard.json   three-run mean success rate, across-run SD, task-bootstrap
                     95% confidence interval, and rank for
                     every model, harness, and task setting; and each model's
                     rate averaged over the five harnesses (computed per run,
                     not printed in the paper)
  comparison.json    the compact benchmark comparison table (marks and buckets),
                     with the exact counts from the full comparison table
  abc.json           the Agentic Benchmark Checklist assessment (one mark per
                     checklist item and benchmark), with the table's notes; the
                     totals are recomputed from the marks and must equal the
                     totals the paper prints
  provenance.json    input hashes (not bundled)

The paper and the result files are not part of this repository, so their
paths are arguments. `--validate-only` re-checks the committed JSON without
them and needs only the Python standard library.

Example:
  python3 scripts/export_paper.py \
    --tex /path/to/paper.tex \
    --results-tsv /path/to/tables/main_results.tsv \
    --figure-pdf /path/to/figures/main_results.pdf
  python3 scripts/export_paper.py --validate-only
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "data" / "paper"

SETTINGS = [
    {"id": "Average", "name": "Average", "description": "Equal-weight mean of the four task settings"},
    {"id": "ST", "name": "ST", "description": "Single-turn"},
    {"id": "IF", "name": "IF", "description": "Instruction following"},
    {"id": "MT", "name": "MT", "description": "Multi-turn"},
    {"id": "MTIF", "name": "MTIF", "description": "Multi-turn + instruction following"},
]
# Result-table setup id -> harness shown in the paper.
HARNESSES = [
    {"id": "bare", "setup": "llm", "name": "Bare", "abbr": "B", "kind": "bare"},
    {"id": "hermes", "setup": "hermes", "name": "Hermes", "abbr": "H", "kind": "end-user"},
    {"id": "opencode", "setup": "opencode", "name": "OpenCode", "abbr": "OC", "kind": "end-user"},
    {"id": "openhands", "setup": "openhands", "name": "OpenHands", "abbr": "OH", "kind": "end-user"},
    {"id": "openclaw", "setup": "openclaw", "name": "OpenClaw", "abbr": "OCl", "kind": "end-user"},
]
# Row order of the paper's figure, top to bottom. `access` separates
# closed-source (proprietary) models from open-source (open-weight) models;
# `reference` marks the three models used to select tasks during construction.
MODELS = [
    {"id": "gpt_6_astra", "name": "GPT 6 Astra", "developer": "OpenAI", "access": "closed", "reference": False, "providerId": "gpt-6-astra"},
    {"id": "claude_fable_5", "name": "Claude Fable 5", "developer": "Anthropic", "access": "closed", "reference": False, "providerId": "claude-fable-5"},
    {"id": "gemini_3_8_flash_thinking", "name": "Gemini 3.8 Flash", "developer": "Google", "access": "closed", "reference": False, "providerId": "gemini-3.8-flash"},
    {"id": "gpt_5_6_sol", "name": "GPT 5.6 Sol", "developer": "OpenAI", "access": "closed", "reference": False, "providerId": "gpt-5.6-sol"},
    {"id": "gpt_5_4", "name": "GPT 5.4", "developer": "OpenAI", "access": "closed", "reference": True, "providerId": "gpt-5.4"},
    {"id": "gemini_3_5_flash_thinking", "name": "Gemini 3.5 Flash", "developer": "Google", "access": "closed", "reference": False, "providerId": "gemini-3.5-flash"},
    {"id": "kimi_k3", "name": "Kimi K3", "developer": "Moonshot AI", "access": "open", "reference": False, "providerId": "moonshotai/kimi-k3"},
    {"id": "claude_sonnet_5", "name": "Claude Sonnet 5", "developer": "Anthropic", "access": "closed", "reference": False, "providerId": "claude-sonnet-5"},
    {"id": "gemini_3_1_pro_thinking", "name": "Gemini 3.1 Pro", "developer": "Google", "access": "closed", "reference": True, "providerId": "gemini-3.1-pro-preview"},
    {"id": "claude_opus_4_6", "name": "Claude Opus 4.6", "developer": "Anthropic", "access": "closed", "reference": True, "providerId": "claude-opus-4-6"},
    {"id": "glm_5_2", "name": "GLM 5.2", "developer": "Z.ai", "access": "open", "reference": False, "providerId": "z-ai/glm-5.2"},
    {"id": "deepseek_v4_flash", "name": "DeepSeek V4 Flash", "developer": "DeepSeek", "access": "open", "reference": False, "providerId": "deepseek/deepseek-v4-flash"},
]
TASK_COUNTS = {"ST": 100, "IF": 97, "MT": 100, "MTIF": 99}
RUNS = 3

# Compact comparison table: column order and the design principle each column marks.
COMPARISON_COLUMNS = [
    {"id": "realWorldTools", "label": "Real-world tools", "principle": 1, "group": "realism", "kind": "mark", "header": "Real-world"},
    {"id": "services", "label": "# Services", "principle": 2, "group": "realism", "kind": "bucket", "header": "# Services"},
    {"id": "tools", "label": "# Tools", "principle": 2, "group": "realism", "kind": "bucket", "header": "# Tools"},
    {"id": "toolsPerTask", "label": "# Tools/task", "principle": 2, "group": "realism", "kind": "bucket", "header": "# Tools/task"},
    {"id": "servicesPerTask", "label": "# Services/task", "principle": 2, "group": "realism", "kind": "bucket", "header": "# Services/"},
    {"id": "userSimulator", "label": "User simulator", "principle": 3, "group": "realism", "kind": "mark", "header": "User simulator"},
    {"id": "steering", "label": "Category-wise steering evaluation", "principle": 4, "group": "realism", "kind": "mark", "header": "Category-wise"},
    {"id": "crossHarness", "label": "Cross-harness evaluation", "principle": 5, "group": "realism", "kind": "mark", "header": "Cross-harness"},
    {"id": "hiddenTest", "label": "Hidden test set", "principle": 6, "group": "trustworthy", "kind": "mark", "header": "Hidden test"},
    {"id": "stateVerification", "label": "Service-state verification", "principle": 7, "group": "trustworthy", "kind": "mark", "header": "Service-state"},
    {"id": "selfContained", "label": "Self-contained", "principle": 8, "group": "trustworthy", "kind": "mark", "header": "Self-contained"},
    {"id": "infraIsolation", "label": "Infra-error isolation", "principle": 9, "group": "trustworthy", "kind": "mark", "header": "Infra-error"},
    {"id": "validatedSimulator", "label": "Validated user simulator", "principle": 10, "group": "trustworthy", "kind": "mark", "header": "Validated user"},
    {"id": "validatedEvaluation", "label": "Validated evaluation", "principle": 10, "group": "trustworthy", "kind": "mark", "header": "Validated"},
    {"id": "tasks", "label": "# Tasks", "principle": 11, "group": "trustworthy", "kind": "bucket", "header": "# Tasks"},
]
# Full comparison table: index of each compact column among the cells after the name.
FULL_TABLE_INDEX = {
    "realWorldTools": 0, "services": 1, "tools": 2, "toolsPerTask": 3, "servicesPerTask": 4,
    "userSimulator": 5, "steering": 6, "crossHarness": 7, "hiddenTest": 8, "stateVerification": 9,
    "selfContained": 10, "validatedSimulator": 11, "validatedEvaluation": 12, "infraIsolation": 13, "tasks": 14,
}
FULL_TABLE_HEADERS = [
    "Real-world tools", "# Services", "# Tools", "# Tools/task", "# Services/task", "User simulator",
    "Category-wise steering", "Cross-harness evaluation", "Hidden test set", "Service-state verification",
    "Self-contained", "Validated user simulator", "Validated evaluation", "Infra-error isolation", "# Tasks",
]
# The compact table shortens or versions two names.
FULL_TABLE_NAME = {"Terminal-Bench 2.0": "Terminal-Bench"}
MARKS = {"\\cmark": "yes", "\\pmark": "partial", "\\xmark": "no", "--": "na"}
BUCKETS = {"\\bktL": "low", "\\bktM": "mid", "\\bktH": "high", "--": "na"}
# Bucket thresholds as stated in the notes of the full comparison table.
BUCKET_RULES = {
    "services": {"low": "< 6", "mid": "6 to 15", "high": "16 or more"},
    "tools": {"low": "< 100", "mid": "100 to 500", "high": "> 500"},
    "toolsPerTask": {"low": "< 20", "mid": "20 to 50", "high": "> 50"},
    "servicesPerTask": {"low": "1", "mid": "2 to 5", "high": "6 or more"},
    "tasks": {"low": "< 300", "mid": "300 to 999", "high": "1,000 or more"},
}


# Agentic Benchmark Checklist table (label tab:abc-full).
ABC_NAME = "Agentic Benchmark Checklist"
ABC_MARKS = {"\\cmark": "yes", "\\rcmark": "committed", "\\xmark": "no", "--": "na"}
ABC_CATEGORIES = {"Outcome validity": "outcome", "Challenge (task) validity": "task", "Benchmark reporting": "reporting"}
ABC_NOTE_MARKERS = {"dagger": "†", "ddagger": "‡"}
# Summary rows under the table: a fragment of the row label -> what the row counts.
ABC_TOTAL_ROWS = [
    ("Satisfied or committed / applicable", "score"),
    ("Satisfied / applicable", "score"),
    ("of which committed", "committed"),
    ("Not satisfied", "notSatisfied"),
    ("Not applicable", "notApplicable"),
]


def bucket_of(column: str, value: float) -> str:
    if column == "services":
        return "low" if value < 6 else "mid" if value <= 15 else "high"
    if column == "tools":
        return "low" if value < 100 else "mid" if value <= 500 else "high"
    if column == "toolsPerTask":
        return "low" if value < 20 else "mid" if value <= 50 else "high"
    if column == "servicesPerTask":
        return "low" if value <= 1 else "mid" if value < 6 else "high"
    if column == "tasks":
        return "low" if value < 300 else "mid" if value < 1000 else "high"
    raise KeyError(column)


def one_decimal(value: float) -> str:
    """Round half up to one decimal. Identical to Math.round(value * 10) / 10 in
    the page's formatter, so the page and this export always agree."""
    return f"{math.floor(value * 10 + 0.5) / 10:.1f}"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message: str) -> None:
    raise SystemExit(f"export_paper: {message}")


# ---------------------------------------------------------------- paper
def strip_comments(tex: str) -> str:
    return "\n".join(re.split(r"(?<!\\)%", line, maxsplit=1)[0] for line in tex.split("\n"))


def split_row(row: str) -> list[str]:
    """Split a tabular row on top-level `&` (cells never nest braces around &)."""
    return [cell.strip() for cell in row.split("&")]


def clean_name(cell: str) -> str:
    cell = re.sub(r"~?\\citeyearpar\{[^}]*\}", "", cell)
    cell = cell.replace("\\textbf{", "").replace("\\MV{}", "MultiVerse")
    cell = cell.replace("$\\tau^3$", "τ³").replace("$\\tau^2$", "τ²").replace("$\\tau$", "τ")
    cell = cell.replace("}", "").replace("{", "")
    return re.sub(r"\s+", " ", cell).strip()


def clean_count(cell: str) -> str | None:
    """Return the displayed count of a full-table numeric cell, or None for `--`."""
    cell = re.sub(r"\\textsuperscript\{[^}]*\}", "", cell)
    cell = re.sub(r"\\prov\{([^}]*)\}", r"\1", cell)
    cell = cell.replace("{,}", ",").replace("$\\sim$", "~").replace("--", "–").strip()
    return None if cell in {"–", ""} else cell


def count_value(text: str) -> float:
    """Numeric value used for the bucket check; ranges use their upper end."""
    number = text.replace(",", "").replace("~", "").split("–")[-1]
    return float(number)


def table_block(tex: str, label: str) -> str:
    start = tex.index(f"\\label{{{label}}}")
    begin = tex.index("\\begin{tabular}", start)
    end = tex.index("\\end{tabular}", begin)
    return tex[begin:end]


def data_rows(block: str) -> list[str]:
    body = block[block.index("\\midrule") + len("\\midrule"):]
    body = body[: body.index("\\bottomrule")]
    rows = []
    for raw in re.split(r"\\\\(?:\[[^\]]*\])?", body):
        row = raw.replace("\\midrule", "").replace("\\addlinespace[3pt]", "").strip()
        if row:
            rows.append(row)
    return rows


def parse_comparison(tex: str) -> dict:
    compact = table_block(tex, "tab:comparison-compact")
    header = compact[: compact.index("\\midrule")]
    position = 0
    for column in COMPARISON_COLUMNS:  # the header must list the columns in this order
        found = header.find(column["header"], position)
        if found < 0:
            fail(f"compact table header no longer matches column {column['id']!r}")
        position = found + 1

    full_rows = {}
    full = table_block(tex, "tab:comparison")
    full_header = full[: full.index("\\midrule")]
    position = 0
    for name in FULL_TABLE_HEADERS:
        found = full_header.find(name, position)
        if found < 0:
            fail(f"full table header no longer matches column {name!r}")
        position = found + 1
    for row in data_rows(full):
        if row.startswith("\\multicolumn"):
            continue
        cells = split_row(row)
        if len(cells) != 16:
            fail(f"full table row has {len(cells)} cells: {row[:80]}")
        full_rows[clean_name(cells[0]).replace(" (ours)", "")] = cells[1:]

    groups, current, warnings = [], None, []
    for row in data_rows(compact):
        if row.startswith("\\multicolumn"):
            title = re.search(r"\\emph\{([^}]*)\}", row).group(1)
            current = {"id": "widely-used" if "Widely" in title else "closest", "title": title, "rows": []}
            groups.append(current)
            continue
        cells = split_row(row)
        if len(cells) != 16:
            fail(f"compact table row has {len(cells)} cells: {row[:80]}")
        name = clean_name(cells[0])
        ours = name.endswith("(ours)")
        if ours:
            name = name.replace(" (ours)", "")
            current = {"id": "ours", "title": "This work", "rows": []}
            groups.append(current)
        full_cells = full_rows.get(FULL_TABLE_NAME.get(name, name))
        if full_cells is None:
            fail(f"{name!r} is missing from the full comparison table")
        values, counts = {}, {}
        for column, cell in zip(COMPARISON_COLUMNS, cells[1:]):
            mapping = BUCKETS if column["kind"] == "bucket" else MARKS
            if cell not in mapping:
                fail(f"unexpected cell {cell!r} for {name} / {column['id']}")
            values[column["id"]] = mapping[cell]
            full_cell = full_cells[FULL_TABLE_INDEX[column["id"]]]
            if column["kind"] == "bucket":
                count = clean_count(full_cell)
                if count is not None:
                    counts[column["id"]] = count
                    expected = bucket_of(column["id"], count_value(count))
                    if values[column["id"]] != expected:
                        warnings.append(f"{name} / {column['id']}: compact table says {values[column['id']]}, full table count {count} implies {expected}")
                elif values[column["id"]] != "na":
                    warnings.append(f"{name} / {column['id']}: compact table has a bucket but the full table has no count")
            else:
                full_mark = MARKS.get(re.sub(r"\\textsuperscript\{.*\}$", "", full_cell).strip())
                if full_mark != values[column["id"]]:
                    warnings.append(f"{name} / {column['id']}: compact table says {values[column['id']]}, full table says {full_mark}")
        current["rows"].append({"name": name, "ours": ours, "values": values, "counts": counts})
    return {
        "columns": [{key: column[key] for key in ("id", "label", "principle", "group", "kind")} for column in COMPARISON_COLUMNS],
        "bucketRules": BUCKET_RULES,
        "groups": groups,
        "otherBenchmarksReviewed": 33,
        "warnings": warnings,
    }


def unwrap(text: str, *macros: str) -> str:
    """Drop wrappers such as \\newtext{...} and \\textbf{...}, keeping what they wrap."""
    pattern = re.compile(r"\\(?:%s)\{((?:[^{}]|\{[^{}]*\})*)\}" % "|".join(macros))
    while pattern.search(text):
        text = pattern.sub(r"\1", text)
    return text


def clean_prose(text: str) -> str:
    """Plain text of a short paper phrase (a requirement or a table note)."""
    text = unwrap(text, "newtext", "textbf", "emph", "prov")
    text = text.replace("\\MV{}", "MultiVerse").replace(".\\ ", ". ").replace("~", " ")
    text = text.replace("--", "–").replace("'", "’")
    text = re.sub(r"\s+", " ", text).strip()
    if re.search(r"[\\{}$]", text):
        fail(f"unexpected markup in paper text: {text!r}")
    return text


def parse_abc(tex: str) -> dict:
    """The full Agentic Benchmark Checklist table: marks, notes, and checked totals."""
    label = tex.index("\\label{tab:abc-full}")
    caption = tex[tex.rindex("\\caption{", 0, label):label]
    if ABC_NAME not in caption:
        fail("the checklist table's caption no longer names the checklist")
    version = re.search(r"\(ABC (v\d+)\)", caption)
    stated_items = re.search(r"(?:the|all) (\d+) (?:Agentic Benchmark Checklist )?items", caption)
    if not version or not stated_items:
        fail("the checklist table's caption no longer states the checklist version and item count")
    # The caption spells out the column abbreviations: "MV = \MV{}, AW = AppWorld, ..., HB = HANDBOOK.md."
    try:
        key = caption[caption.index("MV = "):caption.index(" \\cmark~satisfied")]
    except ValueError:
        fail("the checklist table's caption no longer lists the benchmark abbreviations")
    benchmarks = []
    for entry in key.rstrip(".").split(", "):
        abbr, _, name = entry.partition(" = ")
        name = clean_prose(name)
        benchmarks.append({"id": abbr, "name": name, "ours": name == "MultiVerse"})
    ids = [benchmark["id"] for benchmark in benchmarks]

    begin = tex.index("\\begin{tabular}", label)
    end = tex.index("\\end{tabular}", begin)
    block = tex[begin:end]
    header = block[: block.index("\\midrule")]
    if re.findall(r"\\textbf\{([A-Z][A-Z0-9])\}", header) != ids:
        fail("the checklist table's columns differ from the abbreviations in its caption")
    body = block[block.index("\\midrule") + len("\\midrule"):block.index("\\bottomrule")]
    if body.count("\\midrule") != 1:
        fail("the checklist table no longer has one rule between its items and its totals")
    item_part, total_part = body.split("\\midrule")

    def rows_of(part: str) -> list[str]:
        rows = (re.sub(r"^\\addlinespace(?:\[[^\]]*\])?", "", raw.strip()).strip() for raw in re.split(r"\\\\(?:\[[^\]]*\])?", part))
        return [row for row in rows if row]

    categories, current = [], None
    for row in rows_of(item_part):
        if row.startswith("\\multicolumn"):
            title = re.search(r"\\emph\{([^}]*)\}", row).group(1)
            if title not in ABC_CATEGORIES:
                fail(f"unexpected checklist category {title!r}")
            current = {"id": ABC_CATEGORIES[title], "title": title, "items": []}
            categories.append(current)
            continue
        cells = split_row(row)
        # The paper capitalizes the O.i.1 item differently from the checklist.
        if cells[0] == "O.I.1":
            cells[0] = "O.i.1"
        if current is None or len(cells) != 2 + len(ids) or not re.fullmatch(r"[OTR]\.(?:[a-z]\.)?\d+", cells[0]):
            fail(f"unexpected checklist row: {row[:80]}")
        marks, note_marks = {}, {}
        for benchmark, cell in zip(ids, cells[2:]):
            match = re.fullmatch(r"(\\[a-z]+|--)(?:\$\^\{\\(dagger|ddagger)\}\$)?", unwrap(cell, "newtext"))
            if not match or match.group(1) not in ABC_MARKS:
                fail(f"unexpected checklist cell {cell!r} for {cells[0]} / {benchmark}")
            marks[benchmark] = ABC_MARKS[match.group(1)]
            if match.group(2):
                note_marks[benchmark] = ABC_NOTE_MARKERS[match.group(2)]
        current["items"].append({"id": cells[0], "requirement": clean_prose(cells[1]), "marks": marks, "noteMarks": note_marks})

    items = [item for category in categories for item in category["items"]]
    if len(items) != int(stated_items.group(1)) or len({item["id"] for item in items}) != len(items):
        fail(f"the checklist table has {len(items)} items; its caption states {stated_items.group(1)}")
    totals = {}
    for benchmark in ids:
        count = {value: sum(item["marks"][benchmark] == value for item in items) for value in ABC_MARKS.values()}
        totals[benchmark] = {
            "satisfied": count["yes"], "committed": count["committed"], "notSatisfied": count["no"],
            "notApplicable": count["na"], "applicable": len(items) - count["na"],
        }

    # The totals the paper prints under the table must equal the totals of the marks.
    printed = {}
    for row in rows_of(total_part):
        cells = split_row(row)
        kind = next((kind for fragment, kind in ABC_TOTAL_ROWS if fragment in cells[0]), None)
        if kind is None or len(cells) != 1 + len(ids):
            fail(f"unexpected checklist totals row: {row[:80]}")
        printed[kind] = [unwrap(cell, "newtext", "textbf") for cell in cells[1:]]
    if "committed" not in printed:
        printed["committed"] = ["0"] * len(ids)
    if set(printed) != {kind for _, kind in ABC_TOTAL_ROWS}:
        fail("the checklist table's totals rows changed")
    for index, benchmark in enumerate(ids):
        total = totals[benchmark]
        computed = {
            "score": f"{total['satisfied'] + total['committed']}/{total['applicable']}",
            "committed": str(total["committed"]), "notSatisfied": str(total["notSatisfied"]), "notApplicable": str(total["notApplicable"]),
        }
        for kind, value in computed.items():
            if printed[kind][index] != value:
                fail(f"checklist totals for {benchmark}: the paper prints {printed[kind][index]} ({kind}), the marks give {value}")

    notes = []
    notes_begin = tex.find("\\begin{tablenotes}", end, tex.index("\\end{table}", end))
    if notes_begin >= 0:
        notes_block = tex[notes_begin:tex.index("\\end{tablenotes}", notes_begin)]
        for raw in notes_block.split("\\item")[1:]:
            marker = re.match(r"\s*\$\^\{\\(dagger|ddagger)\}\$", raw)
            text = clean_prose(raw[marker.end():] if marker else raw)
            notes.append({"marker": ABC_NOTE_MARKERS[marker.group(1)] if marker else None, "text": text})
    used_markers = {marker for item in items for marker in item["noteMarks"].values()}
    if used_markers != {note["marker"] for note in notes if note["marker"]}:
        fail("a marker in the checklist table has no matching table note (or the reverse)")

    # The main text quotes this work's total, optionally followed by its ratio.
    warnings = []
    ours = next((benchmark["id"] for benchmark in benchmarks if benchmark["ours"]), None)
    if ours is None or ids[0] != ours:
        fail("the checklist table's first column is no longer this work")
    statement = re.search(r"(\d+) of (\d+) applicable (?:checklist|ABC) items(?: \(([\d.]+)\))?", unwrap(tex, "prov"))
    if not statement:
        warnings.append("the main text no longer states this work's checklist total")
    else:
        total = totals[ours]
        score = total["satisfied"] + total["committed"]
        if (int(statement.group(1)), int(statement.group(2))) != (score, total["applicable"]) or (statement.group(3) is not None and f"{score / total['applicable']:.2f}" != statement.group(3)):
            warnings.append(f"the main text states {statement.group(0)!r}; the table gives {score}/{total['applicable']}")
    return {
        "checklist": {"name": ABC_NAME, "abbr": "ABC", "version": version.group(1), "itemCount": len(items)},
        "benchmarks": benchmarks,
        "categories": categories,
        "totals": totals,
        "notes": notes,
        "warnings": warnings,
    }


def check_identifiers(tex: str) -> None:
    block = table_block(tex, "tab:identifiers")
    for model in MODELS:
        if model["name"].replace(" ", "~") not in block and model["name"] not in block:
            fail(f"model name {model['name']!r} is not in the paper's identifier table")
        if f"\\texttt{{{model['providerId']}}}" not in block:
            fail(f"provider id {model['providerId']!r} is not in the paper's identifier table")
    open_rows = [line for line in block.split("\n") if "OpenRouter" in line]
    open_names = {model["name"] for model in MODELS if model["access"] == "open"}
    if len(open_rows) != len(open_names) or not all(any(name in row for row in open_rows) for name in open_names):
        fail("open-weight models in the identifier table changed")
    # Task construction names the reference models: "one of three reference models (A, B, and C, ...)".
    match = re.search(r"one of three reference models \(([^)]*)\)", tex)
    if not match:
        fail("the paper no longer names the three reference models")
    named = match.group(1).replace("~", " ")
    for model in MODELS:
        if model["reference"] != (model["name"] in named):
            fail(f"reference-model flag for {model['name']!r} disagrees with the paper")
    plain = re.sub(r"\\prov\{([^}]*)\}", r"\1", tex)
    if "396 validation tasks (100 ST, 97 IF, 100 MT, and 99 MTIF)" not in plain and "100 each of ST and MT, 97 IF, and 99 MTIF" not in plain:
        fail("the paper's validation task counts changed")


# ------------------------------------------------------------------- results
def parse_results(path: Path) -> dict:
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    setups = {harness["setup"]: harness["id"] for harness in HARNESSES}
    model_ids = {model["id"] for model in MODELS}
    results: dict = {setting["id"]: {model["id"]: {} for model in MODELS} for setting in SETTINGS}
    for row in rows:
        setting, model, setup = row["setting"], row["model"], row["setup"]
        if setting not in results or model not in model_ids or setup not in setups:
            fail(f"unexpected result row {setting}/{model}/{setup}")
        expected_n = sum(TASK_COUNTS.values()) if setting == "Average" else TASK_COUNTS[setting]
        for run in ("run1", "run2", "run3"):
            if int(row[f"{run}_n"]) != expected_n:
                fail(f"{setting}/{model}/{setup}: {run} has {row[f'{run}_n']} tasks, expected {expected_n}")
        mean, sd = round(float(row["run_mean"]) * 100, 6), round(float(row["run_sd"]) * 100, 6)
        results[setting][model][setups[setup]] = {
            "mean": mean,
            "sd": sd,
            "ci95": [round(float(row[bound]) * 100, 6) for bound in ("ci_low", "ci_high")],
            "rank": int(row["model_rank"]),
            # One-decimal text exactly as the paper prints it (checked against the figure PDF).
            "meanText": one_decimal(mean),
            "sdText": one_decimal(sd),
        }
    for setting in results:
        for model in results[setting]:
            if set(results[setting][model]) != set(setups.values()):
                fail(f"{setting}/{model} is missing a harness")
    return results


def parse_harness_average(path: Path) -> dict:
    """Each model's success rate averaged over the five harnesses, per task setting.

    The leaderboard's "Average" view. The harnesses are weighted equally. The
    average is taken within each run first, so the SD is the sample standard
    deviation across runs of that average, the same statistic as for one harness.
    """
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    setups = [harness["setup"] for harness in HARNESSES]
    rates: dict = {}
    for row in rows:
        rates[(row["setting"], row["model"], row["setup"])] = [float(row[f"run{run}_rate"]) * 100 for run in range(1, RUNS + 1)]
    average: dict = {}
    for setting in SETTINGS:
        average[setting["id"]] = {}
        for model in MODELS:
            per_run = [sum(rates[(setting["id"], model["id"], setup)][run] for setup in setups) / len(setups) for run in range(RUNS)]
            mean = sum(per_run) / RUNS
            sd = math.sqrt(sum((value - mean) ** 2 for value in per_run) / (RUNS - 1))
            mean, sd = round(mean, 6), round(sd, 6)
            average[setting["id"]][model["id"]] = {"mean": mean, "sd": sd, "meanText": one_decimal(mean), "sdText": one_decimal(sd)}
    return average


def figure_cells(pdf: Path) -> dict:
    """Read every (row, column) cell of the figure: printed mean, rank, and SD."""
    if not shutil.which("pdftotext"):
        fail("pdftotext (poppler-utils) is required to check the figure PDF")
    html = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words = [(float(a), float(b), float(c), float(d), text) for a, b, c, d, text in re.findall(
        r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', html)]
    # Rank labels (#n) occur only inside cells, so they fix the grid. Model names
    # in the row labels also contain numbers such as "5.6"; those sit left of it.
    kinds = {"rank": r"^#\d+$", "mean": r"^\d+\.\d$", "sd": r"^±\d+\.\d$"}
    columns, rows = len(SETTINGS) * len(HARNESSES), len(MODELS)
    cells: dict = {}
    grid_left = None
    for kind, pattern in kinds.items():
        found = [((x0 + x1) / 2, (y0 + y1) / 2, text) for x0, y0, x1, y1, text in words if re.match(pattern, text)]
        if grid_left is not None:
            found = [item for item in found if item[0] > grid_left]
        if len(found) != columns * rows:
            fail(f"figure PDF has {len(found)} {kind} labels, expected {columns * rows}")
        xs, ys = sorted(x for x, _, _ in found), sorted(y for _, y, _ in found)
        dx, dy = (xs[-1] - xs[0]) / (columns - 1), (ys[-1] - ys[0]) / (rows - 1)
        if grid_left is None:
            grid_left = xs[0] - dx
        for x, y, text in found:
            key = (round((y - ys[0]) / dy), round((x - xs[0]) / dx))
            cells.setdefault(key, {})[kind] = text
    if len(cells) != 300 or any(len(cell) != 3 for cell in cells.values()):
        fail("could not map the figure PDF labels onto the 12 x 25 grid")
    return cells


def check_against_figure(results: dict, pdf: Path) -> int:
    cells = figure_cells(pdf)
    checked = 0
    for row, model in enumerate(MODELS):
        for s, setting in enumerate(SETTINGS):
            for h, harness in enumerate(HARNESSES):
                printed = cells[(row, s * len(HARNESSES) + h)]
                value = results[setting["id"]][model["id"]][harness["id"]]
                ours = {"mean": value["meanText"], "rank": f"#{value['rank']}", "sd": f"±{value['sdText']}"}
                if printed != ours:
                    fail(f"{model['name']} / {setting['id']} / {harness['name']}: figure prints {printed}, table gives {ours}")
                checked += 1
    return checked


# ---------------------------------------------------------------- validation
def validate_abc(abc: dict) -> list[str]:
    benchmarks = [benchmark["id"] for benchmark in abc["benchmarks"]]
    assert len(benchmarks) == 6 and len(set(benchmarks)) == 6
    assert [benchmark["ours"] for benchmark in abc["benchmarks"]] == [True] + [False] * 5 and abc["benchmarks"][0]["name"] == "MultiVerse"
    assert [category["id"] for category in abc["categories"]] == list(ABC_CATEGORIES.values())
    items = [item for category in abc["categories"] for item in category["items"]]
    assert len(items) == abc["checklist"]["itemCount"] == 43 and len({item["id"] for item in items}) == 43
    markers = {note["marker"] for note in abc["notes"] if note["marker"]}
    for item in items:
        assert set(item["marks"]) == set(benchmarks) and set(item["marks"].values()) <= set(ABC_MARKS.values()), item["id"]
        assert item["requirement"] and set(item["noteMarks"]) <= set(benchmarks) and set(item["noteMarks"].values()) <= markers, item["id"]
    for benchmark in benchmarks:
        total = abc["totals"][benchmark]
        count = {value: sum(item["marks"][benchmark] == value for item in items) for value in ABC_MARKS.values()}
        assert (total["satisfied"], total["committed"], total["notSatisfied"], total["notApplicable"]) == (count["yes"], count["committed"], count["no"], count["na"]), benchmark
        assert total["applicable"] == len(items) - count["na"], benchmark
    ours = abc["totals"][benchmarks[0]]
    best = max(abc["totals"][benchmark]["satisfied"] + abc["totals"][benchmark]["committed"] for benchmark in benchmarks)
    commitment_count = f" + {ours['committed']} committed" if ours['committed'] else ""
    notes = [f"checklist: MultiVerse {ours['satisfied']} satisfied{commitment_count} of {ours['applicable']} applicable items (highest total in the table: {best})"]
    notes.extend(f"paper inconsistency: {warning}" for warning in abc.get("warnings", []))
    return notes


def validate(leaderboard: dict, comparison: dict) -> list[str]:
    notes = []
    models = [model["id"] for model in leaderboard["models"]]
    harnesses = [harness["id"] for harness in leaderboard["harnesses"]]
    settings = [setting["id"] for setting in leaderboard["settings"]]
    assert len(models) == 12 and len(harnesses) == 5 and settings == ["Average", "ST", "IF", "MT", "MTIF"]
    assert sum(model["access"] == "open" for model in leaderboard["models"]) == 3
    assert sum(model["reference"] for model in leaderboard["models"]) == 3
    assert leaderboard["taskCounts"] == TASK_COUNTS and leaderboard["runs"] == RUNS
    for setting in settings:
        for harness in harnesses:
            column = [(leaderboard["results"][setting][model][harness]["mean"], leaderboard["results"][setting][model][harness]["rank"]) for model in models]
            assert all(0 <= mean <= 100 for mean, _ in column)
            for model in models:
                cell = leaderboard["results"][setting][model][harness]
                assert cell["meanText"] == one_decimal(cell["mean"]) and cell["sdText"] == one_decimal(cell["sd"])
                low, high = cell["ci95"]
                assert math.isfinite(low) and math.isfinite(high) and 0 <= low <= cell["mean"] <= high <= 100, f"invalid task-bootstrap interval in {setting}/{model}/{harness}"
            assert sorted(rank for _, rank in column)[0] == 1
            for mean_a, rank_a in column:
                for mean_b, rank_b in column:
                    if mean_a > mean_b + 1e-9:
                        assert rank_a <= rank_b, f"rank order differs from mean order in {setting}/{harness}"
        for model in models:  # Average weights the four settings equally
            if setting != "Average":
                continue
            for harness in harnesses:
                parts = [leaderboard["results"][name][model][harness]["mean"] for name in ("ST", "IF", "MT", "MTIF")]
                assert abs(sum(parts) / 4 - leaderboard["results"]["Average"][model][harness]["mean"]) < 1e-3
    best = max((leaderboard["results"]["Average"][model][harness]["mean"], model, harness) for model in models for harness in harnesses)
    notes.append(f"highest model-harness mean: {best[1]} + {best[2]} = {best[0]:.1f}%")
    # The harness average of a model is the mean of its five harness means.
    for setting in settings:
        for model in models:
            cell = leaderboard["harnessAverage"][setting][model]
            parts = [leaderboard["results"][setting][model][harness]["mean"] for harness in harnesses]
            assert abs(sum(parts) / len(parts) - cell["mean"]) < 1e-4, f"harness average of {model} / {setting}"
            assert cell["meanText"] == one_decimal(cell["mean"]) and cell["sdText"] == one_decimal(cell["sd"]) and cell["sd"] >= 0

    columns = comparison["columns"]
    assert [column["principle"] for column in columns] == [1, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11]
    rows = [row for group in comparison["groups"] for row in group["rows"]]
    assert len(rows) == 12 and [group["id"] for group in comparison["groups"]] == ["widely-used", "closest", "ours"]
    ours = [row for row in rows if row["ours"]]
    assert len(ours) == 1 and ours[0]["name"] == "MultiVerse"
    for column in columns:
        value = ours[0]["values"][column["id"]]
        assert value == ("yes" if column["kind"] == "mark" else "mid" if column["id"] == "tasks" else "high")
    for row in rows:
        for column in columns:
            value = row["values"][column["id"]]
            assert value in (("yes", "partial", "no", "na") if column["kind"] == "mark" else ("low", "mid", "high", "na"))
            count = row["counts"].get(column["id"])
            if count is not None:
                assert bucket_of(column["id"], count_value(count)) == value, f"{row['name']} / {column['id']}"
    notes.extend(f"paper inconsistency: {warning}" for warning in comparison.get("warnings", []))
    return notes


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tex", type=Path, help="snapshot of the paper's root .tex file")
    parser.add_argument("--results-tsv", type=Path, help="main_results.tsv behind the full success-rate figure")
    parser.add_argument("--figure-pdf", type=Path, help="the full success-rate figure, as included in the paper")
    parser.add_argument("--results-only", action="store_true", help="update results while preserving existing comparison and checklist data")
    parser.add_argument("--output-dir", type=Path, default=OUT_DIR, help="output directory (defaults to src/data/paper)")
    parser.add_argument("--validate-only", action="store_true", help="check the committed JSON without the sources")
    args = parser.parse_args()

    if args.validate_only:
        leaderboard = json.loads((OUT_DIR / "leaderboard.json").read_text())
        comparison = json.loads((OUT_DIR / "comparison.json").read_text())
        abc = json.loads((OUT_DIR / "abc.json").read_text())
        for note in validate(leaderboard, comparison) + validate_abc(abc):
            print(f"  {note}")
        print("Paper data is internally consistent: 300 result cells, 12 x 15 comparison cells, 43 x 6 checklist cells.")
        return

    missing = [name for name in ("tex", "results_tsv", "figure_pdf") if getattr(args, name) is None]
    if missing:
        parser.error("missing arguments: " + ", ".join("--" + name.replace("_", "-") for name in missing))

    tex = strip_comments(args.tex.read_text())
    check_identifiers(tex)
    comparison = json.loads((OUT_DIR / "comparison.json").read_text()) if args.results_only else parse_comparison(tex)
    results = parse_results(args.results_tsv)
    checked = check_against_figure(results, args.figure_pdf)
    leaderboard = {
        "schemaVersion": 1,
        "metric": "Success rate (%): mean of three runs, with the sample standard deviation across runs",
        "runs": RUNS,
        "taskCounts": TASK_COUNTS,
        "settings": SETTINGS,
        "harnesses": [{key: harness[key] for key in ("id", "name", "abbr", "kind")} for harness in HARNESSES],
        "models": MODELS,
        "results": results,
        "harnessAverage": parse_harness_average(args.results_tsv),
    }
    comparison = {"schemaVersion": 1, **comparison}
    abc = json.loads((OUT_DIR / "abc.json").read_text()) if args.results_only else {"schemaVersion": 1, **parse_abc(tex)}
    notes = validate(leaderboard, comparison) + validate_abc(abc)
    write_json(args.output_dir / "leaderboard.json", leaderboard)
    if not args.results_only:
        write_json(args.output_dir / "comparison.json", comparison)
        write_json(args.output_dir / "abc.json", abc)
    provenance = {
        "generatedBy": "scripts/export_paper.py",
        "paper": {"sha256": sha256(args.tex)},
        "results": {
            "table": {"file": args.results_tsv.name, "sha256": sha256(args.results_tsv)},
            "figure": {"label": "fig:main-results-full", "file": args.figure_pdf.name, "sha256": sha256(args.figure_pdf), "cellsCheckedAgainstTable": checked},
        },
        "comparison": {"compactTable": "tab:comparison-compact", "fullTable": "tab:comparison"},
        "checklist": {"table": "tab:abc-full"},
    }
    if args.results_only:
        previous = json.loads((OUT_DIR / "provenance.json").read_text())
        provenance["results"]["paper"] = provenance["paper"]
        provenance = {**previous, "results": provenance["results"]}
    write_json(args.output_dir / "provenance.json", provenance)
    print(f"Checked {checked} result cells against the figure PDF: every printed mean, rank, and SD matches.")
    for note in notes:
        print(f"  {note}")
    print(f"Wrote paper {'results' if args.results_only else 'data'} to {args.output_dir}")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        sys.exit(f"export_paper: validation failed: {error}")
