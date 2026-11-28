# Model and harness entries in the run viewer

The viewer reads `public/data/v1.1.0/runs/index.json` (schema version `1`).
The index is for the `validation` split of `v1.1.0`. It must not contain hidden
test tasks.

Each item in `models` identifies one submission, with one scored run per
submitted task. An entry given as a plain string uses that string as both its
storage key and its base model id, and takes the top-level `harness`. An entry
given as an object names its own harness:

```json
{
  "schemaVersion": 1,
  "release": "v1.1.0",
  "split": "validation",
  "harness": "bare",
  "models": [
    "gpt_5_6_sol",
    {
      "id": "gpt_5_6_sol-hermes",
      "modelId": "gpt_5_6_sol",
      "harness": "hermes",
      "name": "GPT 5.6 Sol"
    }
  ],
  "verifiers": ["assertion", "dbdiff", "response", "instruction"],
  "cells": { "TASK_ID": ["Pppnn", null] },
  "terminations": {}
}
```

- `id` must be unique across submissions. Keep it stable: it identifies the
  storage directory, matrix column, trajectory selection and deep link.
- `modelId` identifies the base model. Different harness entries can share it.
- `harness` must match the run files exactly. Known harness ids use the display
  names in the source results; custom harness names are displayed unchanged.
- `name` optionally overrides the base model's displayed name. It does not
  change either identity.
- Each task's `cells` array follows `models` order. A code contains the overall
  `P`/`F` outcome followed by four `p`/`f`/`n` verifier results in `verifiers`
  order. `n` means not applicable, not missing.
- Use `null` for an unsubmitted task/entry pair. Omitted trailing slots and an
  absent task row are also unavailable. Never remove an interior slot and shift
  later entries. Missing submissions are not failures and do not count toward
  the number of scored runs.
- Non-completed termination reasons are keyed by task id and **entry id** in
  `terminations`. An early termination does not override the scored outcome.

A submitted run is stored at `runs/<entry.id>/<taskId>.json.gz`. Its JSON keeps
the base `modelId`, plus the matching `taskId` and `harness`. The loader checks
all three before displaying it. The verifier and trajectory fields are the same
for every run. Links use
`?release=v1.1.0#task=<taskId>&section=trajectories&model=<entry.id>`.

The TypeScript reader normalizes these entries to `RunModel`, whose `id` is the
submission key and whose `modelId` and `harness` preserve the source identities.
`RunIndex.cell(taskId, entryId)` returns `undefined` when a result is unavailable;
`scoredCount(taskId)` and `passedCount(taskId)` count submitted results only.

This describes what the viewer reads. Two scripts write it.

`scripts/export_runs.py` writes and checks the runs of the baselines under the
bare harness, into `public/data/v1.1.0/runs/`. It replaces the whole runs
directory, so files added there by hand do not survive it.

`scripts/export_submission_runs.py` adds the runs of the submitted entries. It
works on a built site, never on `public/`:

```sh
python3 scripts/export_submission_runs.py --site dist
```

For every score file under `submissions/v1.1.0/` it fetches the trajectory
archive the score file names, checks it against the score file, converts every
trajectory to a run file at `<site>/data/v1.1.0/runs/<entry.id>/<taskId>.json.gz`,
and replaces the site's index with the baselines' index plus one object entry
and one column per submitted entry, after the baselines and in the order of the
score files. The cell of a run is the verdicts of its score file. The run
files are written with the functions of `scripts/export_runs.py`, so a
submitted run has the fields of a baseline's run. The differences are its
`harness` and a `termination` that need not be one the baselines ended with.

- An archive that cannot be fetched leaves its entry out of the index and is
  not a failure. The entry stays on the leaderboard, and its run details link
  to the archive instead of the result explorer.
- An archive that was fetched and fails a check is a failure, and the site is
  left as it was.
- With no score file the script does nothing.
- `--archive <entry.id>=<file>` reads the archive of an entry from a local
  file, which must have the size and the sha256 the score file names. It is
  for previews and tests.

The index of a site with submitted entries also names them under
`submissions`, with the sha256 of each archive.
