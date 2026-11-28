"""The runs of submitted entries in the run viewer of a built site (scripts/export_submission_runs.py)."""
import copy
import gzip
import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import check_submission
import export_runs
import export_submission_runs as runs
import submission_format as fmt
from test_submissions import INDEX, REFERENCE, submission_like

# A short trajectory as an archive holds it: reasoning inside the content of a message and outside it.
MESSAGES = [
    {"type": "system", "data": {"content": "You are an assistant."}},
    {"type": "human", "data": {"content": "Please do the task."}},
    {"type": "ai", "data": {
        "content": [{"type": "thinking", "thinking": "A thought in the content."}, {"type": "text", "text": "I will look it up."}],
        "tool_calls": [{"id": "call_1", "name": "search", "args": {"query": "x"}}],
        "reasoning_text": "A thought outside the content.",
    }},
    {"type": "tool", "data": {"content": "found", "tool_call_id": "call_1", "name": "search"}},
    {"type": "ai", "data": {"content": "Done."}},
]
ACTIONS = ["system", "user", "thought", "response", "tool_use", "tool_result", "response"]
CANARIES = export_runs.page_canaries()
BASE = json.loads(runs.BASE_INDEX.read_text())
quiet = lambda *_: None


def entry_like(baseline: str, folder: Path, **identity) -> tuple[dict, Path, dict[str, bytes]]:
    """A checked score file with the task results of one baseline, its archive in `folder`, and the archive's members."""
    document, members = submission_like(baseline, **identity)
    for task_id, data in members.items():
        record = json.loads(data)
        record["model_logs"] = copy.deepcopy(MESSAGES)
        record["final_response_text"] = "Done."
        record["contamination_canary"] = CANARIES[task_id]
        members[task_id] = fmt.canonical_json(record)
        document["tasks"][task_id] = {**fmt.task_entry(record, record["setting"], members[task_id]), "attempts": document["tasks"][task_id]["attempts"]}
    path = pack(document, members, folder)
    assert fmt.check_submission(document, REFERENCE) == []
    return document, path, members


def pack(document: dict, members: dict[str, bytes], folder: Path) -> Path:
    """Write the archive of the members and name it in the score file."""
    path = folder / f"{document['entry']['id']}.tar.gz"
    fmt.write_archive(str(path), document["entry"]["id"], members)
    data = path.read_bytes()
    document["trajectories"].update(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    return path


def column(index: dict, entry: str) -> dict[str, str]:
    at = [model if isinstance(model, str) else model["id"] for model in index["models"]].index(entry)
    return {task: cells[at] for task, cells in index["cells"].items()}


class SubmissionRunsTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        # A built site whose run index is a link to the file it was built from, as a local build makes it.
        self.site = self.folder / "site"
        self.runs = self.site / runs.RUNS
        self.runs.mkdir(parents=True)
        self.source = self.folder / "public-index.json"
        shutil.copyfile(runs.BASE_INDEX, self.source)
        os.link(self.source, self.runs / "index.json")

    def index(self) -> dict:
        return json.loads((self.runs / "index.json").read_text())

    def run_of(self, entry: str, task: str) -> dict:
        return json.loads(gzip.decompress((self.runs / entry / f"{task}.json.gz").read_bytes()))

    def assert_site_untouched(self):
        self.assertEqual(sorted(path.name for path in self.runs.iterdir()), ["index.json"])
        self.assertEqual(sorted(path.name for path in self.runs.parent.iterdir()), ["runs"])
        self.assertEqual(os.stat(self.runs / "index.json").st_ino, os.stat(self.source).st_ino)
        self.assertEqual(self.source.read_bytes(), runs.BASE_INDEX.read_bytes())

    def test_an_entry_gets_a_column_and_a_run_file_per_task(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        done = runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": archive}, say=quiet)
        self.assertEqual(done, {"entries": ["trial_model-bare"], "skipped": []})
        index = self.index()
        self.assertEqual(index["models"], BASE["models"] + [{"id": "trial_model-bare", "modelId": "trial_model", "harness": "bare", "name": "Trial Model"}])
        # The same task results as the baseline give the same cells, and no cell of a baseline moved.
        self.assertEqual(column(index, "trial_model-bare"), column(BASE, "kimi_k3"))
        for model in BASE["models"]:
            self.assertEqual(column(index, model), column(BASE, model))
        self.assertEqual(set(index["cells"]), set(REFERENCE["tasks"]))
        self.assertEqual(index["submissions"]["entries"][0]["archiveSha256"], document["trajectories"]["sha256"])
        files = sorted(path.name for path in (self.runs / "trial_model-bare").iterdir())
        self.assertEqual(files, sorted(f"{task}.json.gz" for task in REFERENCE["tasks"]))
        self.assertEqual(index["bytes"], BASE["bytes"] + sum((self.runs / "trial_model-bare" / name).stat().st_size for name in files))
        for task in list(REFERENCE["tasks"])[:25]:
            run = self.run_of("trial_model-bare", task)
            self.assertEqual((run["taskId"], run["modelId"], run["harness"], run["release"]), (task, "trial_model", "bare", "v1.1.0"))
            self.assertEqual(run["contaminationCanary"], CANARIES[task])
            self.assertEqual([step["action"] for step in run["steps"]], ACTIONS)
            verdicts = [entry.get("passed") if entry["applicable"] else None for entry in run["verifiers"]]
            self.assertEqual(export_runs.cell_code(run["passed"], verdicts), index["cells"][task][-1])
        # The reasoning inside the content of a message and the reasoning outside it are one thought.
        thought = self.run_of("trial_model-bare", next(iter(REFERENCE["tasks"])))["steps"][2]
        self.assertEqual(thought["content"], "A thought in the content.\n\nA thought outside the content.")

    def test_the_index_is_replaced_and_the_file_it_was_linked_to_is_not_changed(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": archive}, say=quiet)
        self.assertEqual(self.source.read_bytes(), runs.BASE_INDEX.read_bytes())
        self.assertNotEqual(os.stat(self.runs / "index.json").st_ino, os.stat(self.source).st_ino)
        self.assertEqual(os.stat(self.source).st_nlink, 1)
        self.assertEqual(sorted(path.name for path in self.runs.parent.iterdir()), ["runs"])

    def test_without_submissions_nothing_is_read_or_written(self):
        self.assertIsNone(runs.export(self.folder / "no-such-site", [], {}, say=quiet))
        with mock.patch.object(check_submission, "committed_score_files", return_value=[]), \
                mock.patch.object(sys, "argv", ["export_submission_runs.py", "--site", str(self.folder / "no-such-site")]), \
                mock.patch("builtins.print"):
            runs.main()
        self.assert_site_untouched()

    def test_the_runs_never_go_into_the_folder_the_site_is_built_from(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        with self.assertRaises(SystemExit) as stopped:
            runs.export(runs.ROOT / "public", [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": archive}, say=quiet)
        self.assertIn("never into public/", str(stopped.exception))

    def test_a_local_file_that_is_not_the_named_archive_stops_the_export(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        other = self.folder / "other.tar.gz"
        other.write_bytes(archive.read_bytes() + b"\0")
        with self.assertRaises(SystemExit) as stopped:
            runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": other}, say=quiet)
        self.assertIn("is not the archive the score file names", str(stopped.exception))
        self.assert_site_untouched()

    def test_a_fetched_file_that_is_not_the_named_archive_stops_the_export(self):
        document, _, _ = entry_like("kimi_k3", self.folder)
        differs = lambda url, size, sha256, target: "the file at trajectories.url is not the archive the score file names (size or sha256 differs)"
        with self.assertRaises(SystemExit) as stopped:
            runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {}, fetch=differs, say=quiet)
        self.assertIn("trial_model-bare: the file at trajectories.url is not the archive", str(stopped.exception))
        self.assert_site_untouched()

    def test_a_fetched_archive_that_disagrees_with_its_score_file_stops_the_export(self):
        document, _, members = entry_like("kimi_k3", self.folder)
        task = next(iter(members))
        record = json.loads(members[task])
        record["final_response_text"] = "Another response."
        members[task] = fmt.canonical_json(record)
        data = pack(document, members, self.folder).read_bytes()
        self.assertEqual(fmt.check_submission(document, REFERENCE), [])

        def fetch(url, size, sha256, target):
            target.write(data)

        with self.assertRaises(SystemExit) as stopped:
            runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {}, fetch=fetch, say=quiet)
        self.assertIn(f"trial_model-bare: {task}: the trajectory is not the one the score file names", str(stopped.exception))
        self.assert_site_untouched()

    def test_an_archive_that_cannot_be_fetched_leaves_its_entry_out(self):
        document, _, _ = entry_like("kimi_k3", self.folder)
        unreachable = lambda url, size, sha256, target: f"{check_submission.UNREACHABLE} (HTTPError)"
        said = []
        done = runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {}, fetch=unreachable, say=said.append)
        self.assertEqual(done["entries"], [])
        self.assertEqual([entry["id"] for entry in done["skipped"]], ["trial_model-bare"])
        self.assertIn("trial_model-bare: left out", " ".join(said))
        self.assert_site_untouched()

    def test_the_download_reports_an_unreachable_archive_under_the_shared_name(self):
        with mock.patch("urllib.request.urlopen", side_effect=OSError("no route")), tempfile.TemporaryFile() as target:
            problem = check_submission.download_archive("https://example.org/a.tar.gz", 1, "0" * 64, target)
        self.assertTrue(problem.startswith(check_submission.UNREACHABLE))

    def command(self, document: dict, *arguments: str) -> str:
        """Run the script as a step of a workflow does, with one committed score file; returns the summary of the step."""
        summary = self.folder / "summary.md"
        with mock.patch.object(runs, "read_submissions", return_value=[("submissions/v1.1.0/trial_model-bare.json", document)]), \
                mock.patch.object(sys, "argv", ["export_submission_runs.py", "--site", str(self.site), *arguments]), \
                mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}), mock.patch("builtins.print"):
            try:
                runs.main()
            finally:
                self.summary = summary.read_text() if summary.exists() else ""
        return self.summary

    def test_as_a_step_an_unreachable_archive_is_reported_and_is_no_failure(self):
        document, _, _ = entry_like("kimi_k3", self.folder)
        with mock.patch("urllib.request.urlopen", side_effect=OSError("no route")):
            summary = self.command(document)
        self.assertIn("## Runs of the submitted entries in the task explorer", summary)
        self.assertIn("trial_model-bare: left out, the trajectory archive cannot be downloaded", summary)
        self.assert_site_untouched()

    def test_as_a_step_a_converted_entry_is_reported(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        summary = self.command(document, "--archive", f"trial_model-bare={archive}")
        self.assertIn("trial_model-bare: 400 runs", summary)
        self.assertEqual(len(self.index()["models"]), len(BASE["models"]) + 1)

    def test_as_a_step_an_archive_that_fails_its_check_is_a_failure(self):
        document, archive, _ = entry_like("kimi_k3", self.folder)
        archive.write_bytes(archive.read_bytes() + b"\0")
        with self.assertRaises(SystemExit) as stopped:
            self.command(document, "--archive", f"trial_model-bare={archive}")
        self.assertIsInstance(stopped.exception.code, str)
        self.assertIn("is not the archive the score file names", self.summary)
        self.assert_site_untouched()

    def test_as_a_step_no_submission_writes_no_summary(self):
        summary = self.folder / "summary.md"
        with mock.patch.object(runs, "read_submissions", return_value=[]), \
                mock.patch.object(sys, "argv", ["export_submission_runs.py", "--site", str(self.site)]), \
                mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}), mock.patch("builtins.print"):
            runs.main()
        self.assertFalse(summary.exists())
        self.assert_site_untouched()

    def test_an_entry_left_out_does_not_shift_the_columns_of_the_others(self):
        first, _, _ = entry_like("kimi_k3", self.folder)
        second, archive, _ = entry_like("glm_5_3", self.folder, model_id="other_model", name="Other Model", harness="hermes")
        unreachable = lambda url, size, sha256, target: f"{check_submission.UNREACHABLE} (URLError)"
        submissions = [("submissions/v1.1.0/trial_model-bare.json", first), ("submissions/v1.1.0/other_model-hermes.json", second)]
        done = runs.export(self.site, submissions, {"other_model-hermes": archive}, fetch=unreachable, say=quiet)
        self.assertEqual((done["entries"], [entry["id"] for entry in done["skipped"]]), (["other_model-hermes"], ["trial_model-bare"]))
        index = self.index()
        self.assertEqual(index["models"], BASE["models"] + [{"id": "other_model-hermes", "modelId": "other_model", "harness": "hermes", "name": "Other Model"}])
        self.assertTrue(all(len(cells) == len(index["models"]) for cells in index["cells"].values()))
        self.assertEqual(column(index, "other_model-hermes"), column(BASE, "glm_5_3"))
        for model in BASE["models"]:
            self.assertEqual(column(index, model), column(BASE, model))
        self.assertEqual(self.run_of("other_model-hermes", next(iter(REFERENCE["tasks"])))["harness"], "hermes")
        self.assertFalse((self.runs / "trial_model-bare").exists())

    def test_a_second_export_starts_from_the_baselines_again(self):
        first, first_archive, _ = entry_like("kimi_k3", self.folder)
        second, second_archive, _ = entry_like("glm_5_3", self.folder, model_id="other_model", name="Other Model", harness="hermes")
        both = [("submissions/v1.1.0/other_model-hermes.json", second), ("submissions/v1.1.0/trial_model-bare.json", first)]
        archives = {"trial_model-bare": first_archive, "other_model-hermes": second_archive}
        runs.export(self.site, both, archives, say=quiet)
        once = (self.runs / "index.json").read_bytes()
        runs.export(self.site, both, archives, say=quiet)
        self.assertEqual((self.runs / "index.json").read_bytes(), once)
        self.assertEqual(len(self.index()["models"]), len(BASE["models"]) + 2)
        # An entry whose score file is gone leaves the viewer with its run files.
        runs.export(self.site, both[:1], archives and {"other_model-hermes": second_archive}, say=quiet)
        self.assertEqual([model["id"] for model in self.index()["models"][len(BASE["models"]):]], ["other_model-hermes"])
        self.assertEqual(sorted(path.name for path in self.runs.iterdir()), ["index.json", "other_model-hermes"])

    def test_a_termination_other_than_completed_is_kept_with_its_entry(self):
        document, _, members = entry_like("kimi_k3", self.folder)
        task = next(iter(members))
        record = json.loads(members[task])
        record["termination_reason"] = "max_model_calls"
        members[task] = fmt.canonical_json(record)
        document["tasks"][task] = {**fmt.task_entry(record, record["setting"], members[task]), "attempts": document["tasks"][task]["attempts"]}
        archive = pack(document, members, self.folder)
        runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": archive}, say=quiet)
        self.assertEqual(self.index()["terminations"][task]["trial_model-bare"], "max_model_calls")
        self.assertEqual(self.run_of("trial_model-bare", task)["termination"], "max_model_calls")
        self.assertEqual({name: reason for name, reason in self.index()["terminations"][task].items() if name != "trial_model-bare"}, BASE["terminations"].get(task, {}))

    def test_half_of_a_character_pair_in_a_trajectory_is_written_as_a_replacement_character(self):
        document, _, members = entry_like("kimi_k3", self.folder)
        task = next(iter(members))
        record = json.loads(members[task])
        record["model_logs"][3]["data"]["content"] = "cut off here: \ud83d"
        data, code = runs.run_file(record, runs.row_of(task, document["tasks"][task], "trial_model"), CANARIES[task], "bare")
        text = gzip.decompress(data).decode("utf-8")
        self.assertIn("cut off here: �", text)
        self.assertEqual(code, INDEX["cells"][task][INDEX["models"].index("kimi_k3")])

    def test_a_trajectory_without_messages_is_a_problem_of_the_archive(self):
        document, members = submission_like("kimi_k3")
        archive = pack(document, members, self.folder)
        with self.assertRaises(SystemExit) as stopped:
            runs.export(self.site, [("submissions/v1.1.0/trial_model-bare.json", document)], {"trial_model-bare": archive}, say=quiet)
        self.assertIn("no trajectory", str(stopped.exception))
        self.assert_site_untouched()


if __name__ == "__main__":
    unittest.main()
