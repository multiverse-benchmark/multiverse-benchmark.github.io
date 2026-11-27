#!/usr/bin/env python3
"""Export the v1.1.0 baseline results for the leaderboard on the project page.

The leaderboard of v1.1.0 shows the baselines of the paper's section on the
later release (label sec:release-baselines): twelve models under the bare
harness, on the 400 validation tasks and on the 400 hidden test tasks, with
one scored trajectory per model and task.

Inputs: the two result exports, one per split
(MultiVerse-validation-400-bare-results.json, MultiVerse-test-400-bare-results.json).

Only the aggregates are exported: one cell per model and task setting, with
its success rate, rank, counts, and 95% task-bootstrap confidence interval.
The per-task records are used for resampling but never copied. The test tasks
are hidden, so nothing that identifies one of them (an id, an outcome per
task) may reach the site.

Output: src/data/leaderboard.v1.1.0.json, with one result set per split in the
shape of src/data/paper/leaderboard.json (the results of v1.0.0), so the page
reads both with the same code. A cell here has no standard deviation: there is
one run. Its confidence interval describes variation across sampled tasks,
not variation across repeated model runs.

The input files are not part of this repository, so their paths are
arguments. Exporting requires NumPy; `--validate-only` re-checks the committed
JSON without private inputs or NumPy, using only the Python standard library.

Example:
  uv run --with numpy scripts/export_leaderboard.py \
    --validation /path/to/MultiVerse-validation-400-bare-results.json \
    --test /path/to/MultiVerse-test-400-bare-results.json
  python3 scripts/export_leaderboard.py --validate-only
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "v1.1.0"
OUT = ROOT / "src" / "data" / f"leaderboard.{RELEASE}.json"
SPLITS = ("validation", "test")
TASK_SETTINGS = ("ST", "IF", "MT", "MTIF")
SETTING_IDS = ("Average", *TASK_SETTINGS)
TASKS_PER_SETTING = 100
BOOTSTRAP_RESAMPLES = 10_000
BOOTSTRAP_SEED = 260831
UNCERTAINTY = {
    "method": "percentile-task-bootstrap",
    "confidenceLevel": 0.95,
    "resamples": BOOTSTRAP_RESAMPLES,
    "seed": BOOTSTRAP_SEED,
    "rng": "numpy.random.PCG64",
    "strata": list(TASK_SETTINGS),
    "taskOrder": "lexicographic",
    "sharedTaskDraws": True,
    "runsPerTask": 1,
    "average": "equal-weight task-setting mean",
    "quantileMethod": "linear",
}

# The same names and descriptions as the results of v1.0.0 (scripts/export_paper.py).
SETTINGS = [
    {"id": "Average", "name": "Average", "description": "Equal-weight mean of the four task settings"},
    {"id": "ST", "name": "ST", "description": "Single-turn"},
    {"id": "IF", "name": "IF", "description": "Instruction following"},
    {"id": "MT", "name": "MT", "description": "Multi-turn"},
    {"id": "MTIF", "name": "MTIF", "description": "Multi-turn + instruction following"},
]
HARNESSES = [{"id": "bare", "name": "Bare", "abbr": "B", "kind": "bare"}]

# Names as the paper's table of v1.1.0 baselines prints them (tab:release-bare-baselines),
# which are also the names the page uses for the models that v1.0.0 shares.
# access: closed = proprietary, open = open-weight. The paper states the group
# for the models of its main study only. Kimi K3 is one of them; GLM 5.3 and
# DeepSeek V4.1 Flash are newer versions of the other two open-weight models
# and, like them, were run through OpenRouter.
MODELS = {
    "gemini_4_argon": {"name": "Gemini 4 Argon", "developer": "Google", "access": "closed"},
    "claude_fable_5_1": {"name": "Claude Fable 5.1", "developer": "Anthropic", "access": "closed"},
    "claude_opus_5_5": {"name": "Claude Opus 5.5", "developer": "Anthropic", "access": "closed"},
    "claude_sonnet_5_5": {"name": "Claude Sonnet 5.5", "developer": "Anthropic", "access": "closed"},
    "gpt_6_astra": {"name": "GPT 6 Astra", "developer": "OpenAI", "access": "closed"},
    "gpt_6_1_sol": {"name": "GPT 6.1 Sol", "developer": "OpenAI", "access": "closed"},
    "gpt_5_6_sol": {"name": "GPT 5.6 Sol", "developer": "OpenAI", "access": "closed"},
    "gemini_3_8_flash_thinking": {"name": "Gemini 3.8 Flash", "developer": "Google", "access": "closed"},
    "gemini_3_5_flash_thinking": {"name": "Gemini 3.5 Flash", "developer": "Google", "access": "closed"},
    "deepseek_v4_1_flash": {"name": "DeepSeek V4.1 Flash", "developer": "DeepSeek", "access": "open"},
    "kimi_k3": {"name": "Kimi K3", "developer": "Moonshot AI", "access": "open"},
    "glm_5_3": {"name": "GLM 5.3", "developer": "Z.ai", "access": "open"},
}
# The inputs label these two with the suffix the paper's figure uses.
INPUT_NAME_SUFFIX = {"gemini_3_8_flash_thinking": " Thinking", "gemini_3_5_flash_thinking": " Thinking"}

# The fields of an input cell that are exported.
CELL_FIELDS = ("mean", "meanText", "rank", "passed", "scored")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def one_decimal(value: float) -> str:
    """Round half up to one decimal, as the paper's figure prints a rate."""
    return str(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def task_bootstrap(
    rows: list[dict], models: list[str], harnesses: list[str], task_counts: dict[str, int],
    *, resamples: int = BOOTSTRAP_RESAMPLES, seed: int = BOOTSTRAP_SEED,
) -> dict:
    """Resample paired task rows within settings, matching the paper's procedure.

    The RNG resets per split. Each setting's draws are shared by every model
    and harness; Average combines the four setting rates inside each replicate.
    Only aggregate counts, means and percentile endpoints leave this function.
    """
    try:
        import numpy as np
    except ImportError as error:
        raise RuntimeError("Exporting confidence intervals requires NumPy; run with 'uv run --with numpy'.") from error

    assert resamples > 0 and set(task_counts) == set(TASK_SETTINGS)
    columns = [(model, harness) for model in models for harness in harnesses]
    assert columns and len(set(columns)) == len(columns)
    positions = {column: at for at, column in enumerate(columns)}
    outcomes = {}
    setting_of = {}
    task_ids = {setting: set() for setting in TASK_SETTINGS}
    for row in rows:
        task, setting = row["taskId"], row["setting"]
        column = row["modelId"], row["harness"]
        assert isinstance(task, str) and task and setting in task_ids
        assert column in positions and row["scored"] is True and type(row["passed"]) is bool
        assert task not in setting_of or setting_of[task] == setting, "A task belongs to multiple settings"
        setting_of[task] = setting
        key = task, *column
        assert key not in outcomes, "Duplicate model/harness/task outcome"
        outcomes[key] = int(row["passed"])
        task_ids[setting].add(task)
    assert all(len(task_ids[setting]) == task_counts[setting] > 0 for setting in TASK_SETTINGS), "Unexpected task counts"
    assert len(outcomes) == sum(task_counts.values()) * len(columns), "Incomplete model/harness/task outcomes"

    rng = np.random.Generator(np.random.PCG64(seed))
    means, passes, bootstraps = {}, {}, {}
    for setting in TASK_SETTINGS:
        ids = sorted(task_ids[setting])
        values = np.asarray([[outcomes[task, *column] for column in columns] for task in ids], dtype=np.uint8)
        draws = rng.integers(0, len(ids), size=(resamples, len(ids)))
        bootstraps[setting] = values[draws].mean(axis=1)
        means[setting] = values.mean(axis=0)
        passes[setting] = values.sum(axis=0)
    bootstraps["Average"] = np.mean(np.stack([bootstraps[setting] for setting in TASK_SETTINGS]), axis=0)
    means["Average"] = np.mean(np.stack([means[setting] for setting in TASK_SETTINGS]), axis=0)
    passes["Average"] = np.sum(np.stack([passes[setting] for setting in TASK_SETTINGS]), axis=0)
    result = {}
    for setting in SETTING_IDS:
        limits = np.quantile(bootstraps[setting], [0.025, 0.975], axis=0, method="linear")
        result[setting] = {model: {} for model in models}
        for at, (model, harness) in enumerate(columns):
            result[setting][model][harness] = {
                "mean": float(means[setting][at]) * 100,
                "passed": int(passes[setting][at]),
                "scored": sum(task_counts.values()) if setting == "Average" else task_counts[setting],
                "ci95": [round(float(bound) * 100, 6) for bound in limits[:, at]],
            }
    return result


def read_split(path: Path, split: str) -> dict:
    """Validate private outcomes against source aggregates and export aggregates only."""
    data = json.loads(path.read_text())
    assert data["format"] == "multiverse-bare-result-export" and data["split"] == split, f"{path.name} is not the {split} export"
    assert data["runs"] == 1
    assert data["taskCounts"] == {setting: TASKS_PER_SETTING for setting in TASK_SETTINGS}
    assert [harness["id"] for harness in data["harnesses"]] == ["bare"]
    assert [setting["id"] for setting in data["settings"]] == list(SETTING_IDS)
    order = [model["id"] for model in data["models"]]
    assert sorted(order) == sorted(MODELS), f"{path.name}: unexpected models {sorted(set(order) ^ set(MODELS))}"
    for model in data["models"]:
        assert model["name"] == MODELS[model["id"]]["name"] + INPUT_NAME_SUFFIX.get(model["id"], ""), model

    bootstrap = task_bootstrap(data.pop("taskResults"), order, ["bare"], data["taskCounts"])
    results = {}
    for setting in SETTING_IDS:
        results[setting] = {}
        for model in order:
            cell = data["results"][setting][model]["bare"]
            assert cell["sd"] is None and cell["unscored"] == 0 and cell["attempts"] == cell["scored"]
            computed = bootstrap[setting][model]["bare"]
            assert computed["passed"] == cell["passed"] and computed["scored"] == cell["scored"]
            assert abs(computed["mean"] - cell["mean"]) < 1e-9, f"Task outcomes differ from {split}/{setting}/{model} aggregate"
            results[setting][model] = {"bare": {**{field: cell[field] for field in CELL_FIELDS}, "sd": None, "sdText": None, "ci95": computed["ci95"]}}
    return {
        "split": split,
        "metric": "Success rate (%) for one scored trajectory per model and task under the bare harness",
        "runs": 1,
        "uncertainty": UNCERTAINTY.copy(),
        "taskCounts": data["taskCounts"],
        "settings": SETTINGS,
        "harnesses": HARNESSES,
        # In the order of the input: by the split's own Average, as the paper's figure orders its rows.
        "models": [{"id": model, **MODELS[model], "reference": False} for model in order],
        "results": results,
    }


def validate(payload: dict) -> list[str]:
    """Checks that hold for the exported file. Returns one line per result set for the log."""
    notes = []
    assert payload["release"] == RELEASE and sorted(payload["sets"]) == sorted(SPLITS)
    for split in SPLITS:
        result_set = payload["sets"][split]
        assert result_set["runs"] == 1 and result_set["uncertainty"] == UNCERTAINTY
        assert result_set["taskCounts"] == {setting: TASKS_PER_SETTING for setting in TASK_SETTINGS}
        models = [model["id"] for model in result_set["models"]]
        assert len(models) == len(MODELS) and sorted(models) == sorted(MODELS)
        assert sum(model["access"] == "open" for model in result_set["models"]) == 3
        assert not any(model["reference"] for model in result_set["models"])
        results = result_set["results"]
        for setting in SETTING_IDS:
            tasks = TASKS_PER_SETTING * (len(TASK_SETTINGS) if setting == "Average" else 1)
            column = {model: results[setting][model]["bare"] for model in models}
            for model, cell in column.items():
                assert set(cell) == {*CELL_FIELDS, "sd", "sdText", "ci95"}, f"unexpected fields in {split}/{setting}/{model}"
                assert cell["sd"] is None and cell["sdText"] is None, "One run has no across-run SD"
                interval = cell["ci95"]
                assert isinstance(interval, list) and len(interval) == 2
                assert all(type(value) in (int, float) and math.isfinite(value) for value in interval)
                assert 0 <= interval[0] <= cell["mean"] <= interval[1] <= 100, f"invalid interval in {split}/{setting}/{model}"
                assert cell["scored"] == tasks and 0 <= cell["passed"] <= tasks
                # The rate is the share of passed tasks, printed with one decimal, rounded half up.
                assert abs(cell["mean"] - 100 * cell["passed"] / tasks) < 1e-9
                assert cell["meanText"] == one_decimal(cell["mean"])
                # Competition rank: 1 + the number of models with a strictly higher rate.
                assert cell["rank"] == 1 + sum(other["mean"] > cell["mean"] for other in column.values())
        for model in models:
            # Average weights the four task settings equally; with 100 tasks each it is also the pooled rate.
            parts = [results[setting][model]["bare"] for setting in TASK_SETTINGS]
            average = results["Average"][model]["bare"]
            assert abs(sum(part["mean"] for part in parts) / len(parts) - average["mean"]) < 1e-9
            assert sum(part["passed"] for part in parts) == average["passed"]
        averages = [results["Average"][model]["bare"]["mean"] for model in models]
        assert averages == sorted(averages, reverse=True), f"{split}: models are not ordered by Average"
        best = models[0]
        notes.append(f"{split}: {len(models)} models x {len(SETTING_IDS)} settings, with 95% task-bootstrap CIs; highest Average {results['Average'][best]['bare']['mean']:.2f} ({result_set['models'][0]['name']})")
    # Nothing per task, and no path of this machine, may be in the file.
    text = json.dumps(payload)
    for forbidden in ("taskId", "taskResults", "sourceResult", str(Path.home())):
        assert forbidden not in text, f"exported file contains {forbidden!r}"
    return notes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--validation", type=Path, help="the result export of the validation set")
    parser.add_argument("--test", type=Path, help="the result export of the test set")
    parser.add_argument("--validate-only", action="store_true", help="check the committed JSON without the inputs")
    args = parser.parse_args()

    if args.validate_only:
        for note in validate(json.loads(OUT.read_text())):
            print(f"  {note}")
        print(f"The {RELEASE} leaderboard data is internally consistent: 120 result cells.")
        return

    if args.validation is None or args.test is None:
        parser.error("--validation and --test are required (or use --validate-only)")
    inputs = {"validation": args.validation, "test": args.test}
    payload = {
        "schemaVersion": 1,
        "release": RELEASE,
        "generatedBy": "scripts/export_leaderboard.py",
        "inputs": {split: {"file": path.name, "sha256": sha256(path)} for split, path in inputs.items()},
        "sets": {split: read_split(path, split) for split, path in inputs.items()},
    }
    notes = validate(payload)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    for note in notes:
        print(f"  {note}")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
