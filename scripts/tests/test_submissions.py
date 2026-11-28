"""Leaderboard submissions: the check of a score file and the board built from the score files."""
import copy
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import build_board
import check_submission
import export_submission_reference
import read_pull_request
import submission_format as fmt

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = check_submission.reference_for("v1.1.0")
INDEX = json.loads((ROOT / "public" / "data" / "v1.1.0" / "runs" / "index.json").read_text())
BASELINES = json.loads((ROOT / "src" / "data" / "leaderboard.v1.1.0.json").read_text())["sets"]["validation"]
# The settings of the action model that the trial submissions state.
MODEL_SETTINGS = {"name": "trial-model-001", "provider": "vllm", "transport": "vllm", "context_window": 262144, "max_tokens": 32768, "supports_sampling": True, "default_temperature": 1.0, "supports_thinking": True, "thinking_level": "HIGH", "vllm_profile": "local"}
# The verifiers of the run index, in the order of a score file's checks.
MARK = {"p": fmt.PASS, "f": fmt.FAIL, "n": fmt.NOT_APPLICABLE}


def record_of(task_id: str, setting: str, code: str) -> dict:
    """A trajectory record whose votes give the verdicts of a run index code such as 'Pppnn'."""
    record = {
        "schema_version": 1, "task_id": task_id, "setting": setting, "sample_id": f"00001_{task_id}",
        "api_version": REFERENCE["api_version"], "user_simulator_model": REFERENCE["user_simulator_model"],
        "verifier_model": REFERENCE["verifier_model"], "model_logs": [], "termination_reason": "completed",
        "action_model_behavior": dict(MODEL_SETTINGS), "developer_instruction_placement": "system",
        "number_of_model_calls": 3, "number_of_api_calls": 2, "number_of_turns": 1,
        "final_assertion_outcome": code[1] == "p", "autorater_dimension_status": {},
        "autorater_votes": [{"pass": n} for n in (1, 2, 3)],
    }
    for verifier, mark in zip(fmt.VERIFIERS, code[2:]):
        record["autorater_dimension_status"][verifier] = "not_applicable" if mark == "n" else "scored"
        if mark != "n":
            record[f"autorater_{verifier}_outcome"] = mark == "p"
            for vote in record["autorater_votes"]:
                vote[verifier] = {"result": "", "outcome": mark == "p"}
    return record


def submission_like(baseline: str, *, model_id="trial_model", name="Trial Model", harness="bare") -> tuple[dict, dict[str, bytes]]:
    """A score file and its archive members with the task results of one baseline."""
    column = INDEX["models"].index(baseline)
    tasks, members = {}, {}
    for task_id, reference in REFERENCE["tasks"].items():
        record = record_of(task_id, reference["setting"], INDEX["cells"][task_id][column])
        members[task_id] = fmt.canonical_json(record)
        tasks[task_id] = fmt.task_entry(record, reference["setting"], members[task_id])
        tasks[task_id]["attempts"] = {"scored": 1, "skipped": 0}
    document = {
        "format": fmt.FORMAT, "schema_version": fmt.SCHEMA_VERSION, "release": "v1.1.0", "split": "validation",
        "entry": {
            "id": fmt.entry_id_of(model_id, harness),
            "model": {"id": model_id, "name": name, "developer": "Trial Lab", "access": "open"},
            "harness": harness, "submitter": {"name": "Trial Lab"}, "submitted_on": "2026-11-28",
        },
        "run": {
            "api_version": REFERENCE["api_version"], "agent": "llm_agent" if harness == "bare" else "harness_agent",
            "action_model": "trial_model", "user_simulator_model": REFERENCE["user_simulator_model"],
            "verifier_model": REFERENCE["verifier_model"], "verifier_votes": REFERENCE["verifier_votes"],
            "max_model_calls_allowed": REFERENCE["max_model_calls_allowed"],
            "model_call_timeout_seconds": [fmt.DEFAULT_MODEL_CALL_TIMEOUT_SECONDS],
            "action_model_behavior": [{"tasks": len(tasks), "settings": dict(MODEL_SETTINGS)}],
            "developer_instruction_placement": "system",
            "code": {"commits": ["0" * 40], "dirty": False, "changed_paths": []},
            "datasets": {setting: REFERENCE["datasets"][setting]["sha256"] for setting in fmt.SETTINGS},
            "completed_at": "2026-11-28T00:00:00Z",
        },
        "tasks": tasks, "summary": fmt.summary_of(tasks),
        "trajectories": {"url": "https://example.org/trajectories.tar.gz", "sha256": "0" * 64, "bytes": 1},
    }
    return document, members


def archive_of(document: dict, members: dict[str, bytes], folder: Path) -> bytes:
    path = folder / "archive.tar.gz"
    fmt.write_archive(str(path), document["entry"]["id"], members)
    data = path.read_bytes()
    document["trajectories"].update(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    return data


class Response(io.BytesIO):
    """What urlopen returns for an archive: a stream that names its final address."""

    def __init__(self, data: bytes, url: str = "https://example.org/trajectories.tar.gz"):
        super().__init__(data)
        self.url = url

    def geturl(self) -> str:
        return self.url

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class ReferenceTests(unittest.TestCase):
    def test_committed_reference_matches_the_exported_tasks_and_the_baseline_runs(self):
        committed = json.loads(export_submission_reference.OUT.read_text())
        self.assertEqual(committed, export_submission_reference.build())
        self.assertEqual(len(committed["tasks"]), 400)


class CheckFileTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.candidates = Path(folder.name)

    def put(self, document: dict, name: str | None = None) -> str:
        relative = f"submissions/v1.1.0/{name or document['entry']['id']}.json"
        target = self.candidates / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(document))
        return relative

    def errors(self, document: dict, name: str | None = None, **options) -> list[str]:
        return check_submission.check_file(self.put(document, name), self.candidates, download=False, **options)[1]

    def test_a_complete_score_file_passes(self):
        document, _ = submission_like("kimi_k3")
        self.assertEqual(self.errors(document), [])

    def test_the_file_is_named_after_its_entry(self):
        document, _ = submission_like("kimi_k3")
        self.assertIn("named after its entry", self.errors(document, "other_model-bare")[0])

    def test_a_path_outside_the_release_folders_is_refused(self):
        _, errors = check_submission.check_file("submissions/reference/x.json", self.candidates, download=False)
        self.assertIn("submissions/<release>/<entry id>.json", errors[0])
        _, errors = check_submission.check_file("submissions/v9.9.9/trial_model-bare.json", self.candidates, download=False)
        self.assertIn("takes no submissions", errors[0])

    def test_a_baseline_cannot_be_submitted_again(self):
        baseline = BASELINES["models"][0]
        document, _ = submission_like("kimi_k3", model_id=baseline["id"], name=baseline["name"])
        document["entry"]["model"].update(developer=baseline["developer"], access=baseline["access"])
        self.assertIn("is a baseline of the leaderboard already", " ".join(self.errors(document)))

    def test_a_baseline_model_keeps_its_identity_under_another_harness(self):
        baseline = BASELINES["models"][0]
        document, _ = submission_like("kimi_k3", model_id=baseline["id"], name=baseline["name"], harness="hermes")
        self.assertIn("is a baseline model", " ".join(self.errors(document)))
        document["entry"]["model"].update(developer=baseline["developer"], access=baseline["access"])
        self.assertEqual(self.errors(document), [])

    def test_a_new_model_cannot_take_the_name_of_a_baseline(self):
        document, _ = submission_like("kimi_k3", name=BASELINES["models"][0]["name"].upper())
        self.assertIn("is the name of a baseline model", self.errors(document)[0])

    def test_a_failed_check_cannot_be_reported_as_not_applicable(self):
        document, _ = submission_like("kimi_k3")
        task_id = next(task_id for task_id, task in REFERENCE["tasks"].items() if "rubrics" in task["checks"])
        document["tasks"][task_id]["checks"]["rubrics"] = fmt.NOT_APPLICABLE
        document["tasks"][task_id]["passed"] = fmt.case_passed(document["tasks"][task_id]["checks"])
        document["summary"] = fmt.summary_of(document["tasks"])
        self.assertIn("the checks with a verdict are", " ".join(self.errors(document)))

    def test_an_oversized_or_malformed_file_is_refused(self):
        relative = "submissions/v1.1.0/trial_model-bare.json"
        target = self.candidates / relative
        target.parent.mkdir(parents=True)
        target.write_text("[1, 2]")
        self.assertEqual(check_submission.check_file(relative, self.candidates, download=False)[1], ["the file is not a JSON object"])
        target.write_bytes(b" " * (fmt.MAX_SCORE_FILE_BYTES + 1))
        self.assertIn("larger than", check_submission.check_file(relative, self.candidates, download=False)[1][0])

    def test_the_archive_is_downloaded_and_compared_with_the_score_file(self):
        document, members = submission_like("kimi_k3")
        data = archive_of(document, members, self.candidates)
        relative = self.put(document)
        with mock.patch.object(check_submission.urllib.request, "urlopen", return_value=Response(data)):
            self.assertEqual(check_submission.check_file(relative, self.candidates, download=True)[1], [])
        with mock.patch.object(check_submission.urllib.request, "urlopen", return_value=Response(data + b"x")):
            self.assertIn("larger than trajectories.bytes", check_submission.check_file(relative, self.candidates, download=True)[1][0])
        with mock.patch.object(check_submission.urllib.request, "urlopen", return_value=Response(data[:-1] + b"x")):
            self.assertIn("not the archive the score file names", check_submission.check_file(relative, self.candidates, download=True)[1][0])
        with mock.patch.object(check_submission.urllib.request, "urlopen", return_value=Response(data, "http://example.org/x")):
            self.assertIn("leaves https", check_submission.check_file(relative, self.candidates, download=True)[1][0])

    def test_votes_in_the_archive_must_give_the_verdicts_of_the_score_file(self):
        document, members = submission_like("kimi_k3")
        failed = next(task_id for task_id, task in document["tasks"].items() if not task["passed"])
        # The score file claims a pass for a task whose archived votes fail it.
        document["tasks"][failed]["checks"] = {check: (fmt.PASS if verdict != fmt.NOT_APPLICABLE else verdict) for check, verdict in document["tasks"][failed]["checks"].items()}
        document["tasks"][failed]["passed"] = True
        document["summary"] = fmt.summary_of(document["tasks"])
        data = archive_of(document, members, self.candidates)
        relative = self.put(document)
        with mock.patch.object(check_submission.urllib.request, "urlopen", return_value=Response(data)):
            errors = check_submission.check_file(relative, self.candidates, download=True)[1]
        self.assertEqual(len(errors), 1)
        self.assertIn("the score file disagrees with the trajectory on", errors[0])

    def test_the_report_points_out_an_entry_under_the_maintainers_name(self):
        document, _ = submission_like("kimi_k3")
        relative = "submissions/v1.1.0/trial_model-bare.json"
        note = "Merge this only if the pull request comes from the maintainers."
        self.assertNotIn(note, check_submission.report_of(relative, document, [], downloaded=True))
        document["entry"]["submitter"]["name"] = "multiverse ADMIN"
        self.assertIn(note, check_submission.report_of(relative, document, [], downloaded=True))

    def test_the_report_keeps_submitted_text_inside_code_blocks(self):
        document, _ = submission_like("kimi_k3", name="Trial `@someone` Model")
        report = check_submission.report_of("submissions/v1.1.0/trial_model-bare.json", document, [], downloaded=True)
        self.assertIn("All checks passed", report)
        self.assertNotIn("`@someone`", report)
        self.assertIn("50.5 (202/400)", report)
        self.assertIn("request limit  240 s", report)
        self.assertIn("tasks run again after a scored result  0", report)
        self.assertIn("tasks retried after an infrastructure failure  0", report)
        failed = check_submission.report_of("submissions/v1.1.0/trial_model-bare.json", document, ["a `problem`"], downloaded=True)
        self.assertIn("Not accepted", failed)
        self.assertIn("a 'problem'", failed)


class BoardTests(unittest.TestCase):
    def test_without_submissions_the_board_is_the_baselines(self):
        board = build_board.build([])
        build_board.validate(board, [])
        self.assertEqual(board.pop("entries"), {})
        self.assertEqual(board.pop("baselineSubmitter"), "MultiVerse admin")
        details = board.pop("runDetails")
        self.assertEqual(sorted(details), sorted(model["id"] for model in BASELINES["models"]))
        for harnesses in details.values():
            self.assertEqual(list(harnesses), ["bare"])
            self.assertEqual(harnesses["bare"]["tasks"], 400)
            self.assertEqual(sum(group["tasks"] for group in harnesses["bare"]["modelSettings"]), 400)
        self.assertEqual(board, BASELINES)

    def test_an_entry_gets_the_cells_its_task_results_give_among_the_baselines(self):
        document, _ = submission_like("kimi_k3")
        submissions = [("submissions/v1.1.0/trial_model-bare.json", document)]
        board = build_board.build(submissions)
        build_board.validate(board, submissions)
        self.assertEqual(len(board["models"]), 13)
        self.assertEqual([harness["id"] for harness in board["harnesses"]], ["bare"])
        for setting in build_board.SETTING_IDS:
            # The same task results as the baseline: the same rate, counts, interval and rank.
            self.assertEqual(board["results"][setting]["trial_model"]["bare"], board["results"][setting]["kimi_k3"]["bare"], setting)
        order = [model["id"] for model in board["models"]]
        self.assertEqual(order.index("trial_model"), order.index("kimi_k3") + 1)
        self.assertEqual(board["entries"]["trial_model"]["bare"]["submitter"], "Trial Lab")
        self.assertEqual(board["entries"]["trial_model"]["bare"]["rerunTasks"], 0)
        self.assertEqual(board["runDetails"]["trial_model"]["bare"], {
            "tasks": 400,
            "modelSettings": [{"tasks": 400, "settings": MODEL_SETTINGS}],
            "instructionPlacement": "system",
            "modelCallLimit": 320,
            "requestLimitsSeconds": [240],
            "completedOn": "2026-11-28",
            "rerunTasks": 0,
            "retriedTasks": 0,
        })
        # A model below the tie moves down by one place.
        self.assertEqual(board["results"]["Average"]["glm_5_3"]["bare"]["rank"], BASELINES["results"]["Average"]["glm_5_3"]["bare"]["rank"] + 1)

    def test_an_entry_states_how_many_tasks_were_run_again_after_a_scored_result(self):
        document, _ = submission_like("kimi_k3")
        first, second, third = sorted(document["tasks"])[:3]
        document["tasks"][first]["attempts"] = {"scored": 2, "skipped": 0}
        document["tasks"][second]["attempts"] = {"scored": 3, "skipped": 1}
        # A retry after an infrastructure failure is not a re-run of a scored task.
        document["tasks"][third]["attempts"] = {"scored": 1, "skipped": 4}
        submissions = [("submissions/v1.1.0/trial_model-bare.json", document)]
        board = build_board.build(submissions)
        build_board.validate(board, submissions)
        self.assertEqual(board["entries"]["trial_model"]["bare"]["rerunTasks"], 2)
        report = check_submission.report_of("submissions/v1.1.0/trial_model-bare.json", document, [], downloaded=True)
        self.assertIn("tasks run again after a scored result  2", report)
        self.assertIn("tasks retried after an infrastructure failure  2", report)

    def test_an_entry_under_another_harness_adds_that_harness_for_its_model_only(self):
        baseline = BASELINES["models"][0]
        document, _ = submission_like("kimi_k3", model_id=baseline["id"], name=baseline["name"], harness="hermes")
        document["entry"]["model"].update(developer=baseline["developer"], access=baseline["access"])
        submissions = [("submissions/v1.1.0/x-hermes.json", document)]
        board = build_board.build(submissions)
        build_board.validate(board, submissions)
        self.assertEqual([harness["id"] for harness in board["harnesses"]], ["bare", "hermes"])
        self.assertEqual(len(board["models"]), 12)
        self.assertEqual(sorted(board["results"]["Average"][baseline["id"]]), ["bare", "hermes"])
        self.assertEqual(board["results"]["Average"][baseline["id"]]["hermes"]["rank"], 1)
        self.assertEqual(sum("hermes" in cells for cells in board["results"]["Average"].values()), 1)
        self.assertIn("harness and task", board["metric"])
        self.assertEqual(board["results"]["Average"][baseline["id"]]["bare"], BASELINES["results"]["Average"][baseline["id"]]["bare"])


class PullRequestTests(unittest.TestCase):
    def test_only_added_or_changed_score_files_make_a_submission(self):
        score = {"filename": "submissions/v1.1.0/trial_model-bare.json", "status": "added"}
        self.assertIsNone(read_pull_request.refusal([score]))
        self.assertIsNone(read_pull_request.refusal([{**score, "status": "modified"}]))
        self.assertIn("changes no files", read_pull_request.refusal([]))
        self.assertIn("also changes 1 other file", read_pull_request.refusal([score, {"filename": "scripts/check_submission.py", "status": "modified"}]))
        self.assertIn("also changes 1 other file", read_pull_request.refusal([{"filename": "submissions/v1.1.0/../x.json", "status": "added"}]))
        self.assertIn("not remove or rename", read_pull_request.refusal([{**score, "status": "removed"}]))
        self.assertIn("more than", read_pull_request.refusal([score] * (read_pull_request.MAX_FILES + 1)))


if __name__ == "__main__":
    unittest.main()
