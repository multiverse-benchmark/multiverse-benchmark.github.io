import copy
import unittest

from export_leaderboard import TASK_SETTINGS, task_bootstrap


def fixture(counts, outcome, models=("a", "b"), harnesses=("bare", "custom")):
    return [
        {"taskId": f"{setting}-{task:03}", "setting": setting, "modelId": model,
         "harness": harness, "scored": True, "passed": outcome(setting, task, model)}
        for setting in TASK_SETTINGS for task in range(counts[setting])
        for model in models for harness in harnesses
    ]


class TaskBootstrapTests(unittest.TestCase):
    def test_average_weights_settings_equally_with_unequal_task_counts(self):
        counts = dict(zip(TASK_SETTINGS, (1, 3, 4, 5)))
        rows = fixture(counts, lambda setting, task, model: setting == "ST")
        cells = task_bootstrap(rows, ["a", "b"], ["bare", "custom"], counts, resamples=200)
        self.assertEqual(cells["Average"]["a"]["bare"], {
            "mean": 25.0, "passed": 1, "scored": 13, "ci95": [25.0, 25.0],
        })
        self.assertEqual(cells["ST"]["a"]["bare"]["ci95"], [100.0, 100.0])
        self.assertEqual(cells["MT"]["a"]["bare"]["ci95"], [0.0, 0.0])

    def test_draws_are_shared_and_independent_of_input_row_and_column_order(self):
        counts = {setting: 17 for setting in TASK_SETTINGS}
        rows = fixture(counts, lambda setting, task, model: (task % 3 == 0) == (model == "a"))
        cells = task_bootstrap(rows, ["a", "b"], ["bare", "custom"], counts, resamples=200)
        reordered = task_bootstrap(list(reversed(rows)), ["b", "a"], ["custom", "bare"], counts, resamples=200)
        self.assertEqual(cells, reordered)
        for setting, models in cells.items():
            self.assertEqual(models["a"]["bare"], models["a"]["custom"])
            low, high = models["a"]["bare"]["ci95"]
            other = models["b"]["bare"]["ci95"]
            self.assertAlmostEqual(other[0], 100 - high, places=6, msg=setting)
            self.assertAlmostEqual(other[1], 100 - low, places=6, msg=setting)

    def test_rejects_missing_duplicate_and_unscored_outcomes(self):
        counts = {setting: 2 for setting in TASK_SETTINGS}
        rows = fixture(counts, lambda setting, task, model: bool(task))
        unscored = copy.deepcopy(rows)
        unscored[0]["scored"] = False
        for invalid in (rows[:-1], [*rows, rows[0]], unscored):
            with self.subTest(rows=len(invalid)), self.assertRaises(AssertionError):
                task_bootstrap(invalid, ["a", "b"], ["bare", "custom"], counts, resamples=200)


if __name__ == "__main__":
    unittest.main()
